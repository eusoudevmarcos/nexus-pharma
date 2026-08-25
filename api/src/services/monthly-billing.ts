import { createHash } from "node:crypto";
import type { InvoiceItemType, Prisma } from "../generated/prisma/client.js";
import { prisma } from "../infra/prisma.js";
import { dispatchInvoiceCharge } from "./billing-gateway.js";

const money = (value: unknown) => Number(value ?? 0);
const cents = (value: number) => Math.round(value * 100) / 100;
const json = (value: unknown) => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;

export function normalizeBillingPeriod(value: Date) {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), 1));
}

function addMonths(period: Date, months: number) {
  return new Date(Date.UTC(period.getUTCFullYear(), period.getUTCMonth() + months, 1));
}

export async function ensureCustomerBillingStructure(subscriptionId: string) {
  const subscription = await prisma.subscription.findUnique({
    where: { id: subscriptionId },
    include: { company: true, plan: true, onboarding: { include: { installments: true } } },
  });
  if (!subscription) throw new Error("ASSINATURA_NAO_ENCONTRADA");
  const mainStore = await prisma.store.upsert({
    where: { companyId_code: { companyId: subscription.companyId, code: "MATRIZ" } },
    create: { companyId: subscription.companyId, code: "MATRIZ", name: subscription.company.branchName || "Matriz", type: "MAIN", activatedAt: subscription.contractStartedAt },
    update: { type: "MAIN" },
  });
  await prisma.pointOfSale.upsert({
    where: { storeId_code: { storeId: mainStore.id, code: "PDV-01" } },
    create: { storeId: mainStore.id, code: "PDV-01", name: "Caixa 1", activatedAt: subscription.contractStartedAt },
    update: {},
  });
  if (subscription.onboarding) return subscription;
  const startPeriod = normalizeBillingPeriod(subscription.contractStartedAt);
  const fineTuning = subscription.plan.hasFineTuning;
  const entryAmount = fineTuning ? 5000 : money(subscription.plan.setupPrice);
  const installmentCount = fineTuning ? 4 : 0;
  const installmentAmount = fineTuning ? 1250 : 0;
  await prisma.customerOnboarding.create({
    data: {
      companyId: subscription.companyId,
      subscriptionId: subscription.id,
      type: fineTuning ? "FINE_TUNING" : "SIMPLE_CONVERSION",
      status: "IN_PROGRESS",
      setupTotal: subscription.plan.setupPrice,
      entryAmount,
      installmentCount,
      installmentAmount,
      startedAt: subscription.contractStartedAt,
      installments: {
        create: fineTuning
          ? [
              { number: 0, label: "Entrada do ajuste fino tributário", amount: 5000, duePeriod: startPeriod },
              ...Array.from({ length: 4 }, (_, index) => ({ number: index + 1, label: `Parcela ${index + 1}/4 do ajuste fino tributário`, amount: 1250, duePeriod: addMonths(startPeriod, index + 1) })),
            ]
          : [{ number: 0, label: "Setup de conversão simples", amount: subscription.plan.setupPrice, duePeriod: startPeriod }],
      },
    },
  });
  return prisma.subscription.findUniqueOrThrow({ where: { id: subscription.id }, include: { company: true, plan: true, onboarding: { include: { installments: true } } } });
}

type Line = { type: InvoiceItemType; description: string; quantity: number; unitAmount: number; totalAmount: number; metadata: Record<string, unknown> };

export async function closeMonthlyInvoice(input: { companyId: string; period: Date; dueAt: Date; requestedById?: string }) {
  const period = normalizeBillingPeriod(input.period);
  const periodEnd = new Date(addMonths(period, 1).getTime() - 1);
  const subscription = await prisma.subscription.findFirst({
    where: { companyId: input.companyId, status: { in: ["ACTIVE", "TRIALING", "PAST_DUE"] } },
    orderBy: { updatedAt: "desc" },
  });
  if (!subscription) throw new Error("ASSINATURA_ATIVA_NAO_ENCONTRADA");
  const existing = await prisma.invoice.findUnique({
    where: { subscriptionId_billingPeriod: { subscriptionId: subscription.id, billingPeriod: period } },
    include: { items: true, chargeRequests: true },
  });
  if (existing && existing.status !== "DRAFT") return { invoice: existing, duplicate: true, gateway: null };
  const structured = await ensureCustomerBillingStructure(subscription.id);
  const stores = await prisma.store.findMany({
    where: { companyId: input.companyId, activatedAt: { lte: periodEnd }, OR: [{ deactivatedAt: null }, { deactivatedAt: { gt: periodEnd } }] },
    include: { pointsOfSale: { where: { activatedAt: { lte: periodEnd }, OR: [{ deactivatedAt: null }, { deactivatedAt: { gt: periodEnd } }] } } },
  });
  const additionalStores = Math.max(0, stores.length - structured.plan.includedStores);
  const extraPdvs = stores.reduce((total, store) => total + Math.max(0, store.pointsOfSale.length - structured.plan.includedPdvsPerStore), 0);
  const successRate = money(structured.plan.successFeeRate);
  const savings = successRate > 0
    ? await prisma.monthlySavingsLedger.findUnique({ where: { companyId_period: { companyId: input.companyId, period } } })
    : null;
  const verifiedSavings = savings && ["VERIFIED", "LOCKED"].includes(savings.status);
  const requiresReview = successRate > 0 && !verifiedSavings;
  const taxSavings = verifiedSavings ? money(savings.taxSavings) : 0;
  const inventorySavings = verifiedSavings ? money(savings.inventoryLossSavings) : 0;
  const totalSavings = cents(taxSavings + inventorySavings);
  const successFee = cents(totalSavings * successRate);
  const pendingSetup = await prisma.setupInstallment.findMany({
    where: { onboardingId: structured.onboarding!.id, status: "PENDING", duePeriod: { lte: period } },
    orderBy: { number: "asc" },
  });
  const lines: Line[] = [
    { type: "SUBSCRIPTION", description: `Mensalidade do plano ${structured.plan.name}`, quantity: 1, unitAmount: money(structured.plan.monthlyPrice), totalAmount: money(structured.plan.monthlyPrice), metadata: { planCode: structured.plan.code } },
  ];
  if (additionalStores > 0) lines.push({ type: "ADDITIONAL_STORE", description: "Filiais adicionais ativas", quantity: additionalStores, unitAmount: money(structured.plan.additionalStorePrice), totalAmount: cents(additionalStores * money(structured.plan.additionalStorePrice)), metadata: { activeStores: stores.length, includedStores: structured.plan.includedStores } });
  if (extraPdvs > 0) lines.push({ type: "EXTRA_PDV", description: "PDVs adicionais ativos", quantity: extraPdvs, unitAmount: money(structured.plan.extraPdvPrice), totalAmount: cents(extraPdvs * money(structured.plan.extraPdvPrice)), metadata: { includedPdvsPerStore: structured.plan.includedPdvsPerStore } });
  if (successRate > 0) lines.push({ type: "SUCCESS_FEE", description: "Success Fee sobre economia real homologada", quantity: 1, unitAmount: successFee, totalAmount: successFee, metadata: { rate: successRate, taxSavings, inventorySavings, totalSavings, ledgerId: savings?.id ?? null, verified: Boolean(verifiedSavings) } });
  for (const installment of pendingSetup) lines.push({ type: installment.number === 0 ? "SETUP_ENTRY" : "SETUP_INSTALLMENT", description: installment.label, quantity: 1, unitAmount: money(installment.amount), totalAmount: money(installment.amount), metadata: { installmentId: installment.id, number: installment.number } });
  const total = cents(lines.reduce((sum, line) => sum + line.totalAmount, 0));
  const calculation = { companyId: input.companyId, subscriptionId: subscription.id, period: period.toISOString(), stores: stores.length, additionalStores, extraPdvs, savings: { taxSavings, inventorySavings, totalSavings, verified: Boolean(verifiedSavings) }, lines };
  const calculationHash = createHash("sha256").update(JSON.stringify(calculation)).digest("hex");
  const invoice = await prisma.$transaction(async (tx) => {
    const saved = existing
      ? await tx.invoice.update({ where: { id: existing.id }, data: { amount: total, dueAt: input.dueAt, status: requiresReview ? "DRAFT" : "OPEN", requiresReview, calculationHash, metadata: json(calculation) } })
      : await tx.invoice.create({ data: { subscriptionId: subscription.id, billingPeriod: period, amount: total, dueAt: input.dueAt, status: requiresReview ? "DRAFT" : "OPEN", requiresReview, calculationHash, metadata: json(calculation) } });
    if (existing) await tx.invoiceItem.deleteMany({ where: { invoiceId: saved.id } });
    await tx.invoiceItem.createMany({ data: lines.map((line) => ({ invoiceId: saved.id, ...line, metadata: json(line.metadata) })) });
    if (!requiresReview && pendingSetup.length) await tx.setupInstallment.updateMany({ where: { id: { in: pendingSetup.map((item) => item.id) } }, data: { status: "BILLED", invoiceId: saved.id, billedAt: new Date() } });
    if (!requiresReview && verifiedSavings && savings.status === "VERIFIED") await tx.monthlySavingsLedger.update({ where: { id: savings.id }, data: { status: "LOCKED", lockedAt: new Date() } });
    if (input.requestedById) await tx.auditLog.create({ data: { companyId: input.companyId, userId: input.requestedById, action: "MONTHLY_INVOICE_CLOSED", entity: "Invoice", entityId: saved.id, after: json({ total, requiresReview, calculationHash, additionalStores, extraPdvs, successFee }) } });
    return tx.invoice.findUniqueOrThrow({ where: { id: saved.id }, include: { items: { orderBy: { createdAt: "asc" } }, subscription: { include: { company: { select: { tradeName: true } }, plan: { select: { name: true, code: true } } } } } });
  }, { isolationLevel: "Serializable" });
  const gateway = requiresReview ? null : await dispatchInvoiceCharge(invoice.id);
  return { invoice, duplicate: false, gateway };
}
