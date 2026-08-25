import type { Prisma } from "../generated/prisma/client.js";
import { prisma } from "../infra/prisma.js";
import { recordOperationalIncident } from "../services/observability.js";

const DAY = 86_400_000;
const money = (value: unknown) => Number(value ?? 0);
const json = (value: Record<string, unknown>) => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;

type AlertInput = {
  companyId: string;
  productId?: string;
  lotId?: string;
  invoiceId?: string;
  type: "STOCK_LOW" | "HIGH_MARGIN_REORDER" | "EXPIRY_90" | "EXPIRY_60" | "EXPIRY_30" | "BILLING_OVERDUE";
  severity: "INFO" | "WARNING" | "ERROR" | "CRITICAL";
  deduplicationKey: string;
  title: string;
  message: string;
  dueAt?: Date;
  actionData: Record<string, unknown>;
};

async function upsertAlert(input: AlertInput) {
  const existing = await prisma.businessAlert.findUnique({ where: { deduplicationKey: input.deduplicationKey }, select: { status: true } });
  return prisma.businessAlert.upsert({
    where: { deduplicationKey: input.deduplicationKey },
    create: { ...input, actionData: json(input.actionData) },
    update: {
      severity: input.severity,
      title: input.title,
      message: input.message,
      dueAt: input.dueAt,
      actionData: json(input.actionData),
      detectedAt: new Date(),
      ...(existing?.status === "RESOLVED" && { status: "OPEN", resolvedAt: null }),
    },
  });
}

export async function runDailyBusinessAutomation(referenceDate = new Date()) {
  const dateKey = referenceDate.toISOString().slice(0, 10);
  const idempotencyKey = `daily-business-automation:${dateKey}`;
  const previous = await prisma.backgroundJobRun.findUnique({ where: { idempotencyKey } });
  if (previous?.status === "COMPLETED") return { duplicate: true, run: previous };
  if (previous?.status === "RUNNING" && previous.startedAt > new Date(Date.now() - 2 * 60 * 60 * 1000)) {
    return { duplicate: true, run: previous };
  }
  const run = previous
    ? await prisma.backgroundJobRun.update({ where: { id: previous.id }, data: { status: "RUNNING", attempts: { increment: 1 }, error: null, startedAt: new Date(), finishedAt: null } })
    : await prisma.backgroundJobRun.create({ data: { jobName: "DAILY_BUSINESS_AUTOMATION", idempotencyKey } });

  const counters = { companies: 0, reorder: 0, expiry: 0, billing: 0, resolved: 0 };
  try {
    const companies = await prisma.company.findMany({ where: { status: "ACTIVE" }, select: { id: true } });
    const companyIds = companies.map((company) => company.id);
    counters.companies = companyIds.length;
    const [products, lots, invoices] = await Promise.all([
      prisma.product.findMany({ where: { companyId: { in: companyIds }, active: true } }),
      prisma.inventoryLot.findMany({
        where: { product: { companyId: { in: companyIds }, active: true }, quantity: { gt: 0 }, expiresAt: { lte: new Date(referenceDate.getTime() + 90 * DAY) } },
        include: { product: { select: { id: true, companyId: true, name: true, ean: true } } },
      }),
      prisma.invoice.findMany({
        where: { status: "OPEN", dueAt: { lt: referenceDate }, subscription: { company: { status: "ACTIVE" } } },
        include: { subscription: { include: { company: { select: { id: true, tradeName: true } } } } },
      }),
    ]);

    const activeInventoryKeys: string[] = [];
    const activeReorderProducts: string[] = [];
    for (const product of products) {
      const stock = money(product.stockQuantity);
      const minimum = money(product.minimumStock);
      const dailySales = money(product.dailySalesAverage);
      const price = money(product.salePrice);
      const cost = money(product.currentCost);
      const margin = price > 0 ? (price - cost) / price : 0;
      const coverageDays = dailySales > 0 ? stock / dailySales : null;
      const highOpportunity = margin >= 0.25 && dailySales > 0 && (coverageDays ?? Infinity) <= 15;
      const lowStock = stock <= minimum;
      if (!highOpportunity && !lowStock) continue;
      const type = highOpportunity ? "HIGH_MARGIN_REORDER" : "STOCK_LOW";
      const suggestedQuantity = Math.max(0, Math.ceil(Math.max(minimum * 2, dailySales * 30) - stock));
      const key = `inventory:${type}:${product.id}`;
      activeInventoryKeys.push(key);
      activeReorderProducts.push(product.id);
      await upsertAlert({
        companyId: product.companyId,
        productId: product.id,
        type,
        severity: highOpportunity ? "ERROR" : "WARNING",
        deduplicationKey: key,
        title: highOpportunity ? `${product.name}: recomprar com prioridade` : `${product.name}: estoque baixo`,
        message: highOpportunity ? `Boa saída e margem de ${(margin * 100).toFixed(1)}%, com cobertura estimada de ${Math.max(0, Math.floor(coverageDays ?? 0))} dias.` : `Estoque atual ${stock.toFixed(2)}, abaixo do mínimo de ${minimum.toFixed(2)}.`,
        actionData: { ean: product.ean, stock, minimum, dailySales, coverageDays, margin, suggestedQuantity },
      });
      const existingReorder = await prisma.reorderAlert.findFirst({ where: { productId: product.id, status: { in: ["OPEN", "ACKNOWLEDGED"] } } });
      const reorderData = { stockAtTrigger: stock, suggestedQuantity, estimatedMargin: margin, reason: highOpportunity ? "Boa margem, alto giro e cobertura curta" : "Estoque igual ou abaixo do mínimo" };
      if (existingReorder) await prisma.reorderAlert.update({ where: { id: existingReorder.id }, data: reorderData });
      else await prisma.reorderAlert.create({ data: { companyId: product.companyId, productId: product.id, ...reorderData } });
      counters.reorder += 1;
    }

    const expiryKeys: string[] = [];
    for (const lot of lots) {
      const days = Math.ceil((lot.expiresAt.getTime() - referenceDate.getTime()) / DAY);
      const type = days <= 30 ? "EXPIRY_30" : days <= 60 ? "EXPIRY_60" : "EXPIRY_90";
      const key = `expiry:${type}:${lot.id}`;
      expiryKeys.push(key);
      await upsertAlert({
        companyId: lot.product.companyId,
        productId: lot.product.id,
        lotId: lot.id,
        type,
        severity: days <= 30 ? "CRITICAL" : days <= 60 ? "ERROR" : "WARNING",
        deduplicationKey: key,
        title: `${lot.product.name}: lote próximo do vencimento`,
        message: days < 0 ? `Lote ${lot.code} vencido há ${Math.abs(days)} dia(s), com ${money(lot.quantity)} unidade(s).` : `Lote ${lot.code} vence em ${days} dia(s), com ${money(lot.quantity)} unidade(s).`,
        dueAt: lot.expiresAt,
        actionData: { ean: lot.product.ean, lotCode: lot.code, quantity: money(lot.quantity), daysToExpiry: days },
      });
      counters.expiry += 1;
    }

    const billingKeys: string[] = [];
    for (const invoice of invoices) {
      const key = `billing:overdue:${invoice.id}`;
      billingKeys.push(key);
      const overdueDays = Math.max(1, Math.floor((referenceDate.getTime() - invoice.dueAt.getTime()) / DAY));
      await upsertAlert({
        companyId: invoice.subscription.company.id,
        invoiceId: invoice.id,
        type: "BILLING_OVERDUE",
        severity: overdueDays >= 15 ? "CRITICAL" : "ERROR",
        deduplicationKey: key,
        title: `Cobrança vencida: ${invoice.subscription.company.tradeName}`,
        message: `Fatura de R$ ${money(invoice.amount).toFixed(2)} vencida há ${overdueDays} dia(s).`,
        dueAt: invoice.dueAt,
        actionData: { amount: money(invoice.amount), overdueDays, providerReference: invoice.providerReference },
      });
      counters.billing += 1;
    }

    const resolved = await prisma.businessAlert.updateMany({
      where: {
        status: { in: ["OPEN", "ACKNOWLEDGED"] },
        OR: [
          { type: { in: ["STOCK_LOW", "HIGH_MARGIN_REORDER"] }, deduplicationKey: { notIn: activeInventoryKeys } },
          { type: { in: ["EXPIRY_30", "EXPIRY_60", "EXPIRY_90"] }, deduplicationKey: { notIn: expiryKeys } },
          { type: "BILLING_OVERDUE", deduplicationKey: { notIn: billingKeys } },
        ],
      },
      data: { status: "RESOLVED", resolvedAt: new Date() },
    });
    counters.resolved = resolved.count;
    await prisma.reorderAlert.updateMany({ where: { status: { in: ["OPEN", "ACKNOWLEDGED"] }, productId: { notIn: activeReorderProducts } }, data: { status: "RESOLVED", resolvedAt: new Date() } });
    const completed = await prisma.backgroundJobRun.update({ where: { id: run.id }, data: { status: "COMPLETED", counters: json(counters), result: json({ referenceDate: referenceDate.toISOString() }), finishedAt: new Date() } });
    return { duplicate: false, run: completed, counters };
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 2000) : "ERRO_DESCONHECIDO";
    await prisma.backgroundJobRun.update({ where: { id: run.id }, data: { status: "FAILED", counters: json(counters), error: message, finishedAt: new Date() } }).catch(() => undefined);
    await recordOperationalIncident({ source: "automation", severity: "CRITICAL", title: "Falha na automação diária do negócio", detail: message, metadata: { runId: run.id, dateKey } }).catch(() => undefined);
    throw error;
  }
}
