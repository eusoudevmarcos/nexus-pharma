import { createHash } from "node:crypto";
import type { Prisma } from "../generated/prisma/client.js";
import { prisma } from "../infra/prisma.js";

const money = (value: unknown) => Math.round((Number(value ?? 0) + Number.EPSILON) * 100) / 100;
const quantity = (value: unknown) => Math.round((Number(value ?? 0) + Number.EPSILON) * 1000) / 1000;
const json = (value: unknown) => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;

export type ManagerialFilters = {
  start: Date; end: Date; storeId?: string; pointOfSaleId?: string; categoryId?: string; productId?: string; sellerId?: string;
};

export type DreInput = { grossSales: number; discounts: number; returns: number; taxes: number; costOfGoods: number; losses: number };

export function calculateManagerialDre(input: DreInput) {
  const netRevenue = money(input.grossSales - input.discounts - input.returns);
  const contribution = money(netRevenue - input.taxes - input.costOfGoods);
  const result = money(contribution - input.losses);
  return { ...input, netRevenue, contribution, result, margin: netRevenue ? result / netRevenue : 0 };
}

export function classifyAbc<T extends { revenue: number }>(rows: T[]) {
  const ordered = [...rows].sort((a, b) => b.revenue - a.revenue);
  const total = ordered.reduce((sum, row) => sum + row.revenue, 0);
  let cumulative = 0;
  return ordered.map((row) => {
    cumulative += row.revenue;
    const share = total ? row.revenue / total : 0;
    const cumulativeShare = total ? cumulative / total : 0;
    return { ...row, share, cumulativeShare, class: cumulativeShare <= 0.8 || cumulative === row.revenue ? "A" : cumulativeShare <= 0.95 ? "B" : "C" };
  });
}

function saleWhere(companyId: string, filters: ManagerialFilters): Prisma.SaleWhereInput {
  const itemFilter: Prisma.SaleItemWhereInput = {
    ...(filters.productId ? { productId: filters.productId } : {}),
    ...(filters.categoryId ? { product: { categoryId: filters.categoryId } } : {}),
  };
  return {
    companyId, status: "COMPLETED", soldAt: { gte: filters.start, lte: filters.end },
    ...(filters.storeId || filters.pointOfSaleId ? { cashSession: { ...(filters.storeId ? { storeId: filters.storeId } : {}), ...(filters.pointOfSaleId ? { pointOfSaleId: filters.pointOfSaleId } : {}) } } : {}),
    ...(filters.sellerId ? { sellerId: filters.sellerId } : {}),
    ...(filters.productId || filters.categoryId ? { items: { some: itemFilter } } : {}),
  };
}

export async function buildManagerialReport(companyId: string, filters: ManagerialFilters) {
  const where = saleWhere(companyId, filters);
  const [company, sales, reversals, losses, openCash, pendingAdjustments, pendingCounts, transfers, close] = await Promise.all([
    prisma.company.findUniqueOrThrow({ where: { id: companyId }, select: { id: true, tradeName: true, taxRegime: true } }),
    prisma.sale.findMany({
      where,
      include: {
        seller: { select: { id: true, name: true } },
        cashSession: { select: { store: { select: { id: true, name: true } }, pointOfSale: { select: { id: true, name: true } } } },
        items: { where: { ...(filters.productId ? { productId: filters.productId } : {}), ...(filters.categoryId ? { product: { categoryId: filters.categoryId } } : {}) }, include: { product: { select: { id: true, categoryId: true } } } },
        payments: { include: { refunds: { where: { createdAt: { gte: filters.start, lte: filters.end }, status: { not: "FAILED" } } } } },
      },
      orderBy: { soldAt: "desc" }, take: 5000,
    }),
    prisma.saleReversal.findMany({
      where: { companyId, createdAt: { gte: filters.start, lte: filters.end }, ...(filters.storeId || filters.pointOfSaleId ? { cashSession: { ...(filters.storeId ? { storeId: filters.storeId } : {}), ...(filters.pointOfSaleId ? { pointOfSaleId: filters.pointOfSaleId } : {}) } } : {}), ...(filters.sellerId ? { sale: { sellerId: filters.sellerId } } : {}), ...(filters.productId || filters.categoryId ? { items: { some: { saleItem: { ...(filters.productId ? { productId: filters.productId } : {}), ...(filters.categoryId ? { product: { categoryId: filters.categoryId } } : {}) } } } } : {}) },
      include: { items: { include: { saleItem: { select: { productId: true, productName: true, ean: true, product: { select: { categoryId: true } } } } } } },
    }),
    prisma.stockMovement.findMany({
      where: { companyId, type: "LOSS", occurredAt: { gte: filters.start, lte: filters.end }, ...(filters.storeId ? { storeId: filters.storeId } : {}), ...(filters.productId ? { productId: filters.productId } : {}), ...(filters.categoryId ? { product: { categoryId: filters.categoryId } } : {}) },
      include: { store: { select: { id: true, name: true } }, product: { select: { id: true, name: true, ean: true } }, lot: { select: { code: true } } }, orderBy: { occurredAt: "desc" },
    }),
    prisma.cashSession.count({ where: { companyId, status: "OPEN", openedAt: { lte: filters.end } } }),
    prisma.stockAdjustment.count({ where: { companyId, status: "PENDING_APPROVAL", createdAt: { lte: filters.end } } }),
    prisma.inventoryCount.count({ where: { companyId, status: { in: ["OPEN", "PENDING_APPROVAL"] }, createdAt: { lte: filters.end } } }),
    prisma.stockTransfer.count({ where: { companyId, status: "IN_TRANSIT", createdAt: { lte: filters.end } } }),
    prisma.managerialPeriodClose.findFirst({ where: { companyId, period: new Date(Date.UTC(filters.start.getUTCFullYear(), filters.start.getUTCMonth(), 1)) }, include: { closedBy: { select: { name: true } } } }),
  ]);

  const itemFiltered = Boolean(filters.productId || filters.categoryId);
  const saleItems = sales.flatMap((sale) => sale.items);
  const relevantReversalItems = reversals.flatMap((entry) => entry.items).filter((item) => (!filters.productId || item.saleItem.productId === filters.productId) && (!filters.categoryId || item.saleItem.product?.categoryId === filters.categoryId));
  const grossSales = itemFiltered ? saleItems.reduce((sum, item) => sum + money(Number(item.originalUnitPrice) * Number(item.quantity)), 0) : sales.reduce((sum, sale) => sum + money(sale.originalGrossAmount), 0);
  const discounts = itemFiltered ? saleItems.reduce((sum, item) => sum + money(item.discountAmount), 0) : sales.reduce((sum, sale) => sum + money(sale.discountAmount), 0);
  const salesRevenue = itemFiltered ? saleItems.reduce((sum, item) => sum + money(Number(item.unitPrice) * Number(item.quantity)), 0) : sales.reduce((sum, sale) => sum + money(sale.grossAmount), 0);
  const saleTaxes = itemFiltered ? saleItems.reduce((sum, item) => sum + money(item.taxAmount), 0) : sales.reduce((sum, sale) => sum + money(sale.taxAmount), 0);
  const saleCosts = itemFiltered ? saleItems.reduce((sum, item) => sum + money(Number(item.unitCost) * Number(item.quantity)), 0) : sales.reduce((sum, sale) => sum + money(sale.costAmount), 0);
  const returns = relevantReversalItems.reduce((sum, item) => sum + money(item.grossAmount), 0);
  const returnedTax = relevantReversalItems.reduce((sum, item) => sum + money(item.taxAmount), 0);
  const returnedCost = relevantReversalItems.reduce((sum, item) => sum + money(item.costAmount), 0);
  const nonRestockedCost = relevantReversalItems.filter((item) => !item.restocked).reduce((sum, item) => sum + money(item.costAmount), 0);
  const movementLoss = losses.reduce((sum, entry) => sum + money(Math.abs(Number(entry.quantity)) * Number(entry.unitCost ?? 0)), 0);
  const lossAmount = money(movementLoss + nonRestockedCost);
  const dre = calculateManagerialDre({ grossSales, discounts, returns, taxes: money(saleTaxes - returnedTax), costOfGoods: money(saleCosts - returnedCost), losses: lossAmount });

  const products = new Map<string, { id: string | null; ean: string; name: string; quantity: number; revenue: number; cost: number; tax: number; profit: number }>();
  for (const sale of sales) for (const item of sale.items) {
    const key = item.productId ?? item.ean;
    const current = products.get(key) ?? { id: item.productId, ean: item.ean, name: item.productName, quantity: 0, revenue: 0, cost: 0, tax: 0, profit: 0 };
    current.quantity = quantity(current.quantity + Number(item.quantity)); current.revenue = money(current.revenue + Number(item.unitPrice) * Number(item.quantity)); current.cost = money(current.cost + Number(item.unitCost) * Number(item.quantity)); current.tax = money(current.tax + Number(item.taxAmount)); current.profit = money(current.profit + Number(item.profitAmount)); products.set(key, current);
  }
  for (const reversal of reversals) for (const item of reversal.items) {
    const key = item.saleItem.productId ?? item.saleItem.ean; const current = products.get(key); if (!current) continue;
    current.quantity = quantity(current.quantity - Number(item.quantity)); current.revenue = money(current.revenue - Number(item.grossAmount)); current.cost = money(current.cost - Number(item.costAmount)); current.tax = money(current.tax - Number(item.taxAmount)); current.profit = money(current.revenue - current.cost - current.tax); products.set(key, current);
  }
  const abc = classifyAbc([...products.values()].filter((entry) => entry.revenue > 0)).slice(0, 100);

  const sellers = new Map<string, { id: string | null; name: string; sales: number; revenue: number; discount: number; profit: number }>();
  for (const sale of sales) { const key = sale.sellerId ?? "legacy"; const current = sellers.get(key) ?? { id: sale.sellerId, name: sale.sellerName ?? sale.seller?.name ?? "Venda legada", sales: 0, revenue: 0, discount: 0, profit: 0 }; current.sales += 1; current.revenue = money(current.revenue + Number(sale.grossAmount)); current.discount = money(current.discount + Number(sale.discountAmount)); current.profit = money(current.profit + Number(sale.netProfit)); sellers.set(key, current); }

  const payments = new Map<string, { method: string; received: number; refunded: number; net: number }>();
  for (const payment of sales.flatMap((sale) => sale.payments)) { const current = payments.get(payment.method) ?? { method: payment.method, received: 0, refunded: 0, net: 0 }; current.received = money(current.received + Number(payment.amount)); current.refunded = money(current.refunded + payment.refunds.reduce((sum, refund) => sum + Number(refund.amount), 0)); current.net = money(current.received - current.refunded); payments.set(payment.method, current); }

  const controlledItems = sales.flatMap((sale) => sale.items).filter((item) => item.controlLevel !== "NONE");
  const warnings = [openCash ? `${openCash} caixa(s) aberto(s)` : null, pendingAdjustments ? `${pendingAdjustments} ajuste(s) pendente(s)` : null, pendingCounts ? `${pendingCounts} inventário(s) aberto(s)` : null, transfers ? `${transfers} transferência(s) em trânsito` : null].filter(Boolean);
  return {
    company, period: { start: filters.start, end: filters.end }, filters,
    indicators: { sales: sales.length, averageTicket: sales.length ? money(salesRevenue / sales.length) : 0, controlledItems: controlledItems.length, discountRate: grossSales ? discounts / grossSales : 0, lossAmount },
    dre, abc, sellers: [...sellers.values()].sort((a, b) => b.revenue - a.revenue), payments: [...payments.values()], losses: losses.map((entry) => ({ ...entry, quantity: Number(entry.quantity), unitCost: Number(entry.unitCost ?? 0), amount: money(Math.abs(Number(entry.quantity)) * Number(entry.unitCost ?? 0)) })),
    sales: sales.slice(0, 300).map((sale) => ({ id: sale.id, soldAt: sale.soldAt, sellerName: sale.sellerName ?? sale.seller?.name ?? "Venda legada", store: sale.cashSession?.store ?? null, pointOfSale: sale.cashSession?.pointOfSale ?? null, gross: Number(sale.grossAmount), discount: Number(sale.discountAmount), tax: Number(sale.taxAmount), profit: Number(sale.netProfit), items: sale.items.length })),
    closing: { blockers: { openCash, pendingAdjustments, pendingCounts, transfers }, warnings, closed: close ? { id: close.id, hash: close.snapshotHash, closedAt: close.closedAt, closedBy: close.closedBy.name, note: close.note } : null },
  };
}

export function managerialReportCsv(report: Awaited<ReturnType<typeof buildManagerialReport>>) {
  const escape = (value: unknown) => `"${String(value ?? "").replaceAll('"', '""')}"`;
  const rows = [["venda", "data", "loja", "pdv", "vendedor", "itens", "valor", "desconto", "tributos", "lucro"], ...report.sales.map((sale) => [sale.id, sale.soldAt.toISOString(), sale.store?.name ?? "", sale.pointOfSale?.name ?? "", sale.sellerName, sale.items, sale.gross.toFixed(2), sale.discount.toFixed(2), sale.tax.toFixed(2), sale.profit.toFixed(2)])];
  return `\uFEFF${rows.map((row) => row.map(escape).join(";")).join("\r\n")}`;
}

export async function closeManagerialPeriod(input: { companyId: string; period: Date; note: string; userId: string; requestId: string }) {
  const start = new Date(Date.UTC(input.period.getUTCFullYear(), input.period.getUTCMonth(), 1));
  const end = new Date(Date.UTC(input.period.getUTCFullYear(), input.period.getUTCMonth() + 1, 1) - 1);
  const report = await buildManagerialReport(input.companyId, { start, end });
  if (report.closing.closed) return report.closing.closed;
  if (report.closing.warnings.length) throw new Error(`FECHAMENTO_GERENCIAL_BLOQUEADO:${report.closing.warnings.join(",")}`);
  const snapshot = { version: "1.0", companyId: input.companyId, period: start.toISOString().slice(0, 7), generatedAt: new Date().toISOString(), report };
  const snapshotHash = createHash("sha256").update(JSON.stringify(snapshot)).digest("hex");
  try {
    return await prisma.$transaction(async (tx) => {
      const existing = await tx.managerialPeriodClose.findUnique({ where: { companyId_period: { companyId: input.companyId, period: start } } });
      if (existing) return existing;
      const saved = await tx.managerialPeriodClose.create({ data: { companyId: input.companyId, period: start, periodStart: start, periodEnd: end, closedById: input.userId, note: input.note, snapshot: json(snapshot), snapshotHash } });
      await tx.auditLog.create({ data: { companyId: input.companyId, userId: input.userId, action: "MANAGERIAL_PERIOD_CLOSED", entity: "ManagerialPeriodClose", entityId: saved.id, requestId: input.requestId, after: json({ period: start, snapshotHash, note: input.note }) } });
      return saved;
    });
  } catch (error) {
    if ((error as { code?: string }).code === "P2002") return prisma.managerialPeriodClose.findUniqueOrThrow({ where: { companyId_period: { companyId: input.companyId, period: start } } });
    throw error;
  }
}
