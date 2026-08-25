import { createHash } from "node:crypto";
import { config } from "../config.js";
import { prisma } from "../infra/prisma.js";
import { recordOperationalIncident } from "./observability.js";

export async function dispatchInvoiceCharge(invoiceId: string) {
  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    include: {
      items: { orderBy: { createdAt: "asc" } },
      subscription: { include: { company: { select: { id: true, tradeName: true } } } },
    },
  });
  if (!invoice || invoice.status !== "OPEN" || invoice.requiresReview) {
    return { automatic: false, status: "NOT_READY" as const };
  }
  const payload = {
    idempotency_key: invoice.id,
    invoice_id: invoice.id,
    company_id: invoice.subscription.company.id,
    customer_reference: invoice.subscription.providerCustomerId,
    description: `Nexus Pharma · ${invoice.subscription.company.tradeName}`,
    amount: Number(invoice.amount),
    due_at: invoice.dueAt.toISOString(),
    items: invoice.items.map((item) => ({ description: item.description, quantity: Number(item.quantity), unit_amount: Number(item.unitAmount), total_amount: Number(item.totalAmount) })),
  };
  const serialized = JSON.stringify(payload);
  const payloadHash = createHash("sha256").update(serialized).digest("hex");
  const existing = await prisma.billingChargeRequest.findUnique({ where: { invoiceId_payloadHash: { invoiceId, payloadHash } } });
  if (existing?.status === "SENT") return { automatic: true, status: existing.status, request: existing };
  const request = existing
    ? await prisma.billingChargeRequest.update({ where: { id: existing.id }, data: { status: config.BILLING_RELAY_URL ? "PROCESSING" : "QUEUED", attempts: { increment: config.BILLING_RELAY_URL ? 1 : 0 }, lastError: null } })
    : await prisma.billingChargeRequest.create({ data: { invoiceId, payloadHash, provider: config.BILLING_RELAY_URL ? "relay" : "manual", status: config.BILLING_RELAY_URL ? "PROCESSING" : "QUEUED", attempts: config.BILLING_RELAY_URL ? 1 : 0 } });
  if (!config.BILLING_RELAY_URL) return { automatic: false, status: request.status, request };
  try {
    const response = await fetch(config.BILLING_RELAY_URL, {
      method: "POST",
      headers: { "content-type": "application/json", ...(config.BILLING_RELAY_KEY && { authorization: `Bearer ${config.BILLING_RELAY_KEY}` }) },
      body: serialized,
      signal: AbortSignal.timeout(12_000),
    });
    const result = await response.json().catch(() => ({})) as { id?: string; reference?: string; error?: string };
    if (!response.ok) throw new Error(result.error ?? `HTTP_${response.status}`);
    const providerReference = result.id ?? result.reference;
    const sent = await prisma.$transaction(async (tx) => {
      const updated = await tx.billingChargeRequest.update({ where: { id: request.id }, data: { status: "SENT", providerReference, sentAt: new Date(), lastError: null } });
      if (providerReference) await tx.invoice.update({ where: { id: invoice.id }, data: { providerReference } });
      return updated;
    });
    return { automatic: true, status: sent.status, request: sent };
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 2000) : "ERRO_DESCONHECIDO";
    const failed = await prisma.billingChargeRequest.update({ where: { id: request.id }, data: { status: "FAILED", lastError: message } });
    await recordOperationalIncident({ source: "billing-gateway", severity: "CRITICAL", title: "Falha ao enviar cobrança ao gateway", detail: message, metadata: { invoiceId, requestId: request.id } }).catch(() => undefined);
    return { automatic: false, status: failed.status, request: failed };
  }
}
