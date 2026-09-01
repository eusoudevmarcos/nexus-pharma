import { randomUUID } from "node:crypto";
import { prisma } from "../infra/prisma.js";

const roundMoney = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
const quantity = (value: unknown) => Number(value ?? 0);

export type ReorderSuggestion = {
  recommendationId?: string;
  productId: string;
  ean: string;
  productName: string;
  categoryName: string;
  onHand: number;
  reserved: number;
  available: number;
  effectiveAvailable: number;
  expiryRiskQuantity: number;
  nearestExpiryAt: Date | null;
  incoming: number;
  soldLast30Days: number;
  revenueLast30Days: number;
  dailySalesAverage: number;
  baseDailySalesAverage: number;
  seasonalFactor: number;
  promotionFactor: number;
  coverageDays: number | null;
  leadTimeDays: number;
  minimumStock: number;
  suggestedQuantity: number;
  currentCost: number;
  salePrice: number;
  marginPercent: number;
  estimatedInvestment: number;
  estimatedGrossProfit: number;
  urgency: "CRITICAL" | "HIGH" | "NORMAL";
  opportunityScore: number;
  opportunityLabel: "REPOR_AGORA" | "REPOR_COM_CAUTELA" | "PLANEJAR";
  opportunityReasons: string[];
  supplier: { id: string; name: string } | null;
};

function purchaseOpportunity(input: {
  urgency: "CRITICAL" | "HIGH" | "NORMAL";
  soldLast30Days: number;
  marginPercent: number;
  coverageDays: number | null;
  leadTimeDays: number;
  expiryRiskQuantity: number;
  seasonalFactor: number;
  promotionFactor: number;
  hasSupplier: boolean;
}) {
  const shortage = input.urgency === "CRITICAL" ? 35 : input.urgency === "HIGH" ? 27 : 12;
  const demand = input.soldLast30Days >= 120 ? 25 : input.soldLast30Days >= 60 ? 21 : input.soldLast30Days >= 30 ? 16 : input.soldLast30Days > 0 ? 9 : 0;
  const margin = Math.min(20, Math.max(0, input.marginPercent / 2.5));
  const adherence = (input.hasSupplier ? 7 : 0) + (input.seasonalFactor !== 1 || input.promotionFactor !== 1 ? 8 : 3);
  const expiryAdjustment = input.expiryRiskQuantity > 0 ? -8 : 5;
  const score = Math.round(Math.min(100, Math.max(0, shortage + demand + margin + adherence + expiryAdjustment)));
  const reasons = [
    input.urgency === "CRITICAL" ? "sem saldo disponível" : input.coverageDays !== null && input.coverageDays <= input.leadTimeDays ? "cobertura menor que o prazo do fornecedor" : "reposição para manter a cobertura",
    input.soldLast30Days > 0 ? `${Number(input.soldLast30Days.toFixed(3))} unidade(s) vendidas em 30 dias` : "sem venda recente suficiente para confirmar giro",
    `margem bruta estimada de ${input.marginPercent.toFixed(1)}%`,
    ...(input.seasonalFactor !== 1 || input.promotionFactor !== 1 ? [`demanda ajustada em ${(input.seasonalFactor * input.promotionFactor).toFixed(2)}× por sazonalidade/promoção`] : []),
    ...(input.expiryRiskQuantity > 0 ? [`${Number(input.expiryRiskQuantity.toFixed(3))} unidade(s) com risco de vencimento descontadas da cobertura`] : []),
    ...(input.hasSupplier ? [] : ["fornecedor ainda não definido"]),
  ];
  return {
    score,
    label: (score >= 75 ? "REPOR_AGORA" : score >= 50 ? "REPOR_COM_CAUTELA" : "PLANEJAR") as ReorderSuggestion["opportunityLabel"],
    reasons,
  };
}

export function calculateReorderSuggestion(input: {
  product: {
    id: string; ean: string; name: string; currentCost: unknown; salePrice: unknown;
    minimumStock: unknown; dailySalesAverage: unknown; category: { name: string };
    storeStockBalances: Array<{ onHand: unknown; reserved: unknown }>;
    lots: Array<{ expiresAt: Date; storeStockBalances: Array<{ onHand: unknown; reserved: unknown }> }>;
    supplierProducts: Array<{ preferred: boolean; packageQuantity: unknown; supplier: { id: string; tradeName: string; leadTimeDays: number } }>;
  };
  soldLast30Days: number;
  revenueLast30Days: number;
  incoming: number;
  targetDays: number;
  seasonalFactor?: number;
  promotionFactor?: number;
}): ReorderSuggestion | null {
  const onHand = input.product.storeStockBalances.reduce((sum, item) => sum + quantity(item.onHand), 0);
  const reserved = input.product.storeStockBalances.reduce((sum, item) => sum + quantity(item.reserved), 0);
  const available = Math.max(0, onHand - reserved);
  const actualDailyAverage = input.soldLast30Days / 30;
  const baseDailyAverage = actualDailyAverage > 0 ? actualDailyAverage : quantity(input.product.dailySalesAverage);
  const seasonalFactor = Math.min(10, Math.max(0.1, input.seasonalFactor ?? 1));
  const promotionFactor = Math.min(5, Math.max(1, input.promotionFactor ?? 1));
  const dailyAverage = baseDailyAverage * seasonalFactor * promotionFactor;
  const preferred = input.product.supplierProducts.find((entry) => entry.preferred) ?? input.product.supplierProducts[0];
  const leadTimeDays = preferred?.supplier.leadTimeDays ?? 7;
  const minimumStock = quantity(input.product.minimumStock);
  const planningDays = input.targetDays + leadTimeDays;
  const planningEndsAt = new Date(Date.now() + planningDays * 86_400_000);
  let consumedBeforeExpiry = 0;
  let trackedAvailable = 0;
  let usableTrackedStock = 0;
  let nearestExpiryAt: Date | null = null;
  for (const lot of [...input.product.lots].sort((a, b) => a.expiresAt.getTime() - b.expiresAt.getTime())) {
    const lotAvailable = Math.max(0, lot.storeStockBalances.reduce((sum, balance) => sum + quantity(balance.onHand) - quantity(balance.reserved), 0));
    if (lotAvailable <= 0) continue;
    trackedAvailable += lotAvailable;
    if (lot.expiresAt > planningEndsAt) {
      usableTrackedStock += lotAvailable;
      continue;
    }
    const daysUntilExpiry = Math.max(0, (lot.expiresAt.getTime() - Date.now()) / 86_400_000);
    const salesCapacityUntilExpiry = dailyAverage * daysUntilExpiry;
    const usableFromLot = Math.min(lotAvailable, Math.max(0, salesCapacityUntilExpiry - consumedBeforeExpiry));
    usableTrackedStock += usableFromLot;
    consumedBeforeExpiry += usableFromLot;
    if (usableFromLot < lotAvailable && (!nearestExpiryAt || lot.expiresAt < nearestExpiryAt)) nearestExpiryAt = lot.expiresAt;
  }
  const untrackedAvailable = Math.max(0, available - trackedAvailable);
  const effectiveAvailable = Math.min(available, untrackedAvailable + usableTrackedStock);
  const expiryRiskQuantity = Math.max(0, available - effectiveAvailable);
  const targetStock = Math.max(minimumStock, dailyAverage * planningDays);
  const rawSuggestion = Math.max(0, targetStock - effectiveAvailable - input.incoming);
  if (rawSuggestion <= 0) return null;
  const packageQuantity = Math.max(1, quantity(preferred?.packageQuantity));
  const suggestedQuantity = Math.ceil(rawSuggestion / packageQuantity) * packageQuantity;
  const currentCost = quantity(input.product.currentCost);
  const salePrice = quantity(input.product.salePrice);
  const marginPercent = salePrice > 0 ? ((salePrice - currentCost) / salePrice) * 100 : 0;
  const coverageDays = dailyAverage > 0 ? effectiveAvailable / dailyAverage : null;
  const urgency = effectiveAvailable <= 0 ? "CRITICAL" : coverageDays !== null && coverageDays <= leadTimeDays ? "HIGH" : "NORMAL";
  const opportunity = purchaseOpportunity({ urgency, soldLast30Days: input.soldLast30Days, marginPercent, coverageDays, leadTimeDays, expiryRiskQuantity, seasonalFactor, promotionFactor, hasSupplier: Boolean(preferred) });
  return {
    productId: input.product.id,
    ean: input.product.ean,
    productName: input.product.name,
    categoryName: input.product.category.name,
    onHand,
    reserved,
    available,
    effectiveAvailable: Number(effectiveAvailable.toFixed(3)),
    expiryRiskQuantity: Number(expiryRiskQuantity.toFixed(3)),
    nearestExpiryAt,
    incoming: input.incoming,
    soldLast30Days: input.soldLast30Days,
    revenueLast30Days: roundMoney(input.revenueLast30Days),
    dailySalesAverage: Number(dailyAverage.toFixed(3)),
    baseDailySalesAverage: Number(baseDailyAverage.toFixed(3)),
    seasonalFactor: Number(seasonalFactor.toFixed(4)),
    promotionFactor: Number(promotionFactor.toFixed(4)),
    coverageDays: coverageDays === null ? null : Number(coverageDays.toFixed(1)),
    leadTimeDays,
    minimumStock,
    suggestedQuantity,
    currentCost,
    salePrice,
    marginPercent: Number(marginPercent.toFixed(2)),
    estimatedInvestment: roundMoney(suggestedQuantity * currentCost),
    estimatedGrossProfit: roundMoney(suggestedQuantity * Math.max(0, salePrice - currentCost)),
    urgency,
    opportunityScore: opportunity.score,
    opportunityLabel: opportunity.label,
    opportunityReasons: opportunity.reasons,
    supplier: preferred ? { id: preferred.supplier.id, name: preferred.supplier.tradeName } : null,
  };
}

export async function getPurchasingDashboard(input: { companyId: string; storeId?: string; targetDays?: number }) {
  const since = new Date();
  since.setUTCDate(since.getUTCDate() - 30);
  const policy = await prisma.purchasePolicy.upsert({
    where: { companyId: input.companyId },
    create: { companyId: input.companyId },
    update: {},
  });
  const targetDays = Math.min(90, Math.max(7, input.targetDays ?? policy.defaultCoverageDays));
  const currentMonth = new Date().getUTCMonth() + 1;
  const [suppliers, stores, products, sales, orders, availableReceivings, supplierReturns, seasonalities, measuredRecommendations] = await Promise.all([
    prisma.supplier.findMany({
      where: { companyId: input.companyId },
      include: { _count: { select: { products: true, purchaseOrders: true } } },
      orderBy: [{ status: "asc" }, { tradeName: "asc" }],
    }),
    prisma.store.findMany({ where: { companyId: input.companyId, active: true }, select: { id: true, code: true, name: true }, orderBy: { name: "asc" } }),
    prisma.product.findMany({
      where: { companyId: input.companyId, active: true },
      include: {
        category: { select: { name: true } },
        storeStockBalances: { where: input.storeId ? { storeId: input.storeId } : undefined, select: { onHand: true, reserved: true } },
        lots: {
          where: { storeStockBalances: { some: { companyId: input.companyId, ...(input.storeId ? { storeId: input.storeId } : {}) } } },
          select: {
            expiresAt: true,
            storeStockBalances: { where: { companyId: input.companyId, ...(input.storeId ? { storeId: input.storeId } : {}) }, select: { onHand: true, reserved: true } },
          },
        },
        supplierProducts: { where: { active: true, supplier: { status: "ACTIVE" } }, include: { supplier: { select: { id: true, tradeName: true, leadTimeDays: true } } }, orderBy: { preferred: "desc" } },
      },
      orderBy: { name: "asc" },
    }),
    prisma.saleItem.findMany({
      where: { productId: { not: null }, sale: { companyId: input.companyId, status: "COMPLETED", soldAt: { gte: since } } },
      select: { productId: true, quantity: true, unitPrice: true },
    }),
    prisma.purchaseOrder.findMany({
      where: { companyId: input.companyId },
      include: {
        supplier: { select: { id: true, tradeName: true, taxId: true } }, store: { select: { id: true, name: true } },
        createdBy: { select: { name: true } }, approvedBy: { select: { name: true } },
        items: { include: { product: { select: { id: true, name: true, ean: true } } } },
        receipts: { include: { dfeReceiving: { include: { document: { select: { accessKey: true, documentNumber: true, totalAmount: true } } } }, supplierReturns: { select: { id: true, code: true, status: true, totalAmount: true, createdAt: true } } } },
      },
      orderBy: { createdAt: "desc" }, take: 100,
    }),
    prisma.dfeReceiving.findMany({
      where: { companyId: input.companyId, status: "COMPLETED", purchaseReceipt: null },
      include: { document: { select: { documentNumber: true, accessKey: true, issuerTaxId: true, issuerName: true, totalAmount: true } } },
      orderBy: { completedAt: "desc" }, take: 50,
    }),
    prisma.supplierReturn.findMany({
      where: { companyId: input.companyId },
      include: {
        supplier: { select: { tradeName: true, taxId: true } }, store: { select: { name: true } }, createdBy: { select: { name: true } },
        items: { include: { product: { select: { name: true, ean: true } }, lot: { select: { code: true } } }, orderBy: { sourceItemNumber: "asc" } },
      },
      orderBy: { createdAt: "desc" }, take: 100,
    }),
    prisma.demandSeasonality.findMany({
      where: { companyId: input.companyId, month: currentMonth, ...(input.storeId ? { storeId: input.storeId } : {}) },
      select: { id: true, storeId: true, productId: true, month: true, factor: true, source: true, reason: true },
    }),
    prisma.purchaseRecommendation.findMany({
      where: { companyId: input.companyId, recommendationDate: { gte: new Date(Date.now() - 90 * 86_400_000) } },
      select: { status: true, suggestedQuantity: true, actualPurchased: true, recommendationAccuracy: true, avoidedStockout: true, avoidedLossQuantity: true, estimatedInvestment: true },
    }),
  ]);
  const salesByProduct = new Map<string, { quantity: number; revenue: number }>();
  for (const item of sales) {
    if (!item.productId) continue;
    const current = salesByProduct.get(item.productId) ?? { quantity: 0, revenue: 0 };
    current.quantity += quantity(item.quantity);
    current.revenue += quantity(item.quantity) * quantity(item.unitPrice);
    salesByProduct.set(item.productId, current);
  }
  const incomingByProduct = new Map<string, number>();
  for (const order of orders.filter((entry) => ["APPROVED", "PARTIALLY_RECEIVED"].includes(entry.status))) {
    if (input.storeId && order.storeId !== input.storeId) continue;
    for (const item of order.items) incomingByProduct.set(item.productId, (incomingByProduct.get(item.productId) ?? 0) + Math.max(0, quantity(item.requestedQuantity) - quantity(item.receivedQuantity)));
  }
  const urgencyScore = { CRITICAL: 3, HIGH: 2, NORMAL: 1 } as const;
  const seasonalFactorByProduct = new Map<string, number>();
  for (const entry of seasonalities) seasonalFactorByProduct.set(entry.productId, quantity(entry.factor));
  const now = new Date();
  const suggestions = products
    .map((product) => {
      const sold = salesByProduct.get(product.id) ?? { quantity: 0, revenue: 0 };
      const promotionActive = product.salesStrategy === "PROMOTION" && (!product.strategyStartsAt || product.strategyStartsAt <= now) && (!product.strategyEndsAt || product.strategyEndsAt >= now);
      return calculateReorderSuggestion({
        product,
        soldLast30Days: sold.quantity,
        revenueLast30Days: sold.revenue,
        incoming: incomingByProduct.get(product.id) ?? 0,
        targetDays,
        seasonalFactor: policy.seasonalityEnabled ? seasonalFactorByProduct.get(product.id) ?? 1 : 1,
        promotionFactor: promotionActive ? 1 + quantity(policy.promotionLiftPercent) : 1,
      });
    })
    .filter((entry): entry is ReorderSuggestion => Boolean(entry))
    .sort((a, b) => b.opportunityScore - a.opportunityScore || urgencyScore[b.urgency] - urgencyScore[a.urgency] || b.revenueLast30Days - a.revenueLast30Days || b.marginPercent - a.marginPercent);
  if (input.storeId) {
    const recommendationDate = new Date(); recommendationDate.setUTCHours(0, 0, 0, 0);
    for (const entry of suggestions) {
      const expectedStockoutAt = entry.dailySalesAverage > 0 ? new Date(recommendationDate.getTime() + Math.max(0, entry.effectiveAvailable / entry.dailySalesAverage) * 86_400_000) : null;
      const saved = await prisma.purchaseRecommendation.upsert({
        where: { storeId_productId_recommendationDate: { storeId: input.storeId, productId: entry.productId, recommendationDate } },
        create: {
          companyId: input.companyId, storeId: input.storeId, productId: entry.productId, recommendationDate,
          baseDailyAverage: entry.baseDailySalesAverage, seasonalFactor: entry.seasonalFactor, promotionFactor: entry.promotionFactor,
          forecastDailyAverage: entry.dailySalesAverage, effectiveAvailable: entry.effectiveAvailable, incomingQuantity: entry.incoming,
          expiryRiskQuantity: entry.expiryRiskQuantity, suggestedQuantity: entry.suggestedQuantity, estimatedInvestment: entry.estimatedInvestment,
          expectedStockoutAt, metadata: { targetDays, source: "PURCHASING_DASHBOARD" },
        },
        update: {
          baseDailyAverage: entry.baseDailySalesAverage, seasonalFactor: entry.seasonalFactor, promotionFactor: entry.promotionFactor,
          forecastDailyAverage: entry.dailySalesAverage, effectiveAvailable: entry.effectiveAvailable, incomingQuantity: entry.incoming,
          expiryRiskQuantity: entry.expiryRiskQuantity, suggestedQuantity: entry.suggestedQuantity, estimatedInvestment: entry.estimatedInvestment,
          expectedStockoutAt, metadata: { targetDays, source: "PURCHASING_DASHBOARD" },
        },
        select: { id: true },
      });
      entry.recommendationId = saved.id;
    }
  }
  const measured = measuredRecommendations.filter((entry) => entry.status === "MEASURED");
  const soldUnits = [...salesByProduct.values()].reduce((sum, entry) => sum + entry.quantity, 0);
  const availableUnits = products.reduce((sum, product) => sum + product.storeStockBalances.reduce((inner, balance) => inner + Math.max(0, quantity(balance.onHand) - quantity(balance.reserved)), 0), 0);
  return {
    indicators: {
      critical: suggestions.filter((entry) => entry.urgency === "CRITICAL").length,
      purchaseInvestment: roundMoney(suggestions.reduce((sum, entry) => sum + entry.estimatedInvestment, 0)),
      potentialGrossProfit: roundMoney(suggestions.reduce((sum, entry) => sum + entry.estimatedGrossProfit, 0)),
      openOrders: orders.filter((entry) => ["DRAFT", "APPROVED", "PARTIALLY_RECEIVED"].includes(entry.status)).length,
      returnsPendingFiscal: supplierReturns.filter((entry) => entry.status === "PENDING_FISCAL").length,
      avoidedStockouts: measured.filter((entry) => entry.avoidedStockout).length,
      avoidedLossQuantity: Number(measured.reduce((sum, entry) => sum + quantity(entry.avoidedLossQuantity), 0).toFixed(3)),
      recommendationAccuracy: measured.length ? Number((measured.reduce((sum, entry) => sum + quantity(entry.recommendationAccuracy), 0) / measured.length * 100).toFixed(1)) : null,
      stockTurnover30Days: availableUnits > 0 ? Number((soldUnits / availableUnits).toFixed(2)) : null,
    },
    targetDays, policy: { ...policy, promotionLiftPercent: quantity(policy.promotionLiftPercent), managerApprovalLimit: quantity(policy.managerApprovalLimit) }, seasonalities, suppliers, stores,
    products: products.map((entry) => ({ id: entry.id, ean: entry.ean, name: entry.name, currentCost: quantity(entry.currentCost) })),
    suggestions, orders, availableReceivings, supplierReturns,
  };
}

export async function saveSupplier(input: {
  companyId: string; supplierId?: string; taxId: string; legalName: string; tradeName: string; email?: string | null;
  phone?: string | null; contactName?: string | null; leadTimeDays: number; minimumOrderValue: number;
  paymentTerms?: string | null; status?: "ACTIVE" | "INACTIVE" | "BLOCKED"; notes?: string | null; userId: string; requestId?: string;
}) {
  const existing = input.supplierId ? await prisma.supplier.findFirst({ where: { id: input.supplierId, companyId: input.companyId } }) : null;
  if (input.supplierId && !existing) throw new Error("FORNECEDOR_NAO_ENCONTRADO");
  const duplicate = await prisma.supplier.findFirst({ where: { companyId: input.companyId, taxId: input.taxId, ...(existing ? { id: { not: existing.id } } : {}) }, select: { id: true } });
  if (duplicate) throw new Error("FORNECEDOR_CNPJ_JA_CADASTRADO");
  const data = { taxId: input.taxId, legalName: input.legalName, tradeName: input.tradeName, email: input.email ?? null, phone: input.phone ?? null, contactName: input.contactName ?? null, leadTimeDays: input.leadTimeDays, minimumOrderValue: input.minimumOrderValue, paymentTerms: input.paymentTerms ?? null, status: input.status ?? "ACTIVE" as const, notes: input.notes ?? null };
  return prisma.$transaction(async (tx) => {
    const saved = existing ? await tx.supplier.update({ where: { id: existing.id }, data }) : await tx.supplier.create({ data: { companyId: input.companyId, ...data } });
    await tx.auditLog.create({ data: { companyId: input.companyId, userId: input.userId, action: existing ? "SUPPLIER_UPDATED" : "SUPPLIER_CREATED", entity: "Supplier", entityId: saved.id, requestId: input.requestId, before: existing ? { taxId: existing.taxId, tradeName: existing.tradeName, status: existing.status } : undefined, after: { taxId: saved.taxId, tradeName: saved.tradeName, status: saved.status } } });
    return saved;
  });
}

export async function saveSupplierProduct(input: { companyId: string; supplierId: string; productId: string; supplierCode?: string | null; lastUnitCost?: number | null; minimumOrderQuantity: number; packageQuantity: number; preferred: boolean; userId: string; requestId?: string }) {
  const [supplier, product] = await Promise.all([
    prisma.supplier.findFirst({ where: { id: input.supplierId, companyId: input.companyId } }),
    prisma.product.findFirst({ where: { id: input.productId, companyId: input.companyId, active: true } }),
  ]);
  if (!supplier || !product) throw new Error("FORNECEDOR_OU_PRODUTO_NAO_ENCONTRADO");
  return prisma.$transaction(async (tx) => {
    if (input.preferred) await tx.supplierProduct.updateMany({ where: { productId: input.productId, supplier: { companyId: input.companyId } }, data: { preferred: false } });
    const saved = await tx.supplierProduct.upsert({
      where: { supplierId_productId: { supplierId: input.supplierId, productId: input.productId } },
      create: { supplierId: input.supplierId, productId: input.productId, supplierCode: input.supplierCode ?? null, lastUnitCost: input.lastUnitCost ?? null, minimumOrderQuantity: input.minimumOrderQuantity, packageQuantity: input.packageQuantity, preferred: input.preferred },
      update: { supplierCode: input.supplierCode ?? null, lastUnitCost: input.lastUnitCost ?? null, minimumOrderQuantity: input.minimumOrderQuantity, packageQuantity: input.packageQuantity, preferred: input.preferred, active: true },
    });
    await tx.auditLog.create({ data: { companyId: input.companyId, userId: input.userId, action: "SUPPLIER_PRODUCT_SAVED", entity: "SupplierProduct", entityId: saved.id, requestId: input.requestId, after: { supplierId: input.supplierId, productId: input.productId, preferred: input.preferred } } });
    return saved;
  });
}

export async function createPurchaseOrder(input: { companyId: string; supplierId: string; storeId: string; expectedAt?: Date | null; notes?: string | null; items: Array<{ productId: string; quantity: number; unitCost: number; recommendationId?: string }>; userId: string; requestId?: string }) {
  const uniqueItems = new Map(input.items.map((item) => [item.productId, item]));
  if (uniqueItems.size !== input.items.length) throw new Error("PEDIDO_COM_PRODUTO_DUPLICADO");
  const [supplier, store, products] = await Promise.all([
    prisma.supplier.findFirst({ where: { id: input.supplierId, companyId: input.companyId, status: "ACTIVE" } }),
    prisma.store.findFirst({ where: { id: input.storeId, companyId: input.companyId, active: true } }),
    prisma.product.findMany({ where: { companyId: input.companyId, active: true, id: { in: [...uniqueItems.keys()] } }, select: { id: true } }),
  ]);
  if (!supplier) throw new Error("FORNECEDOR_ATIVO_NAO_ENCONTRADO");
  if (!store) throw new Error("LOJA_ATIVA_NAO_ENCONTRADA");
  if (products.length !== uniqueItems.size) throw new Error("PRODUTO_DO_PEDIDO_NAO_ENCONTRADO");
  const totalAmount = roundMoney(input.items.reduce((sum, item) => sum + item.quantity * item.unitCost, 0));
  const code = `PC-${new Date().toISOString().slice(0, 10).replaceAll("-", "")}-${randomUUID().slice(0, 6).toUpperCase()}`;
  return prisma.$transaction(async (tx) => {
    const order = await tx.purchaseOrder.create({ data: { companyId: input.companyId, supplierId: input.supplierId, storeId: input.storeId, createdById: input.userId, code, expectedAt: input.expectedAt ?? null, notes: input.notes ?? null, totalAmount, items: { create: input.items.map((item) => ({ productId: item.productId, requestedQuantity: item.quantity, unitCost: item.unitCost, totalAmount: roundMoney(item.quantity * item.unitCost) })) } }, include: { items: true } });
    for (const item of input.items) {
      if (!item.recommendationId) continue;
      const orderItem = order.items.find((entry) => entry.productId === item.productId);
      if (!orderItem) continue;
      await tx.purchaseRecommendation.updateMany({
        where: { id: item.recommendationId, companyId: input.companyId, storeId: input.storeId, productId: item.productId, status: "OPEN" },
        data: { status: "ADOPTED", adoptedOrderItemId: orderItem.id, adoptedAt: new Date(), actualPurchased: item.quantity },
      });
    }
    await tx.auditLog.create({ data: { companyId: input.companyId, userId: input.userId, action: "PURCHASE_ORDER_CREATED", entity: "PurchaseOrder", entityId: order.id, requestId: input.requestId, after: { code, supplierId: input.supplierId, storeId: input.storeId, totalAmount, itemCount: input.items.length } } });
    return order;
  });
}

export async function approvePurchaseOrder(input: { companyId: string; orderId: string; userId: string; approverRole: string; requestId?: string }) {
  const order = await prisma.purchaseOrder.findFirst({ where: { id: input.orderId, companyId: input.companyId }, include: { supplier: true, items: true } });
  if (!order) throw new Error("PEDIDO_DE_COMPRA_NAO_ENCONTRADO");
  if (order.status === "APPROVED") return order;
  if (order.status !== "DRAFT") throw new Error("PEDIDO_DE_COMPRA_NAO_PODE_SER_APROVADO");
  if (!order.items.length) throw new Error("PEDIDO_DE_COMPRA_SEM_ITENS");
  if (quantity(order.totalAmount) < quantity(order.supplier.minimumOrderValue)) throw new Error("PEDIDO_ABAIXO_DO_MINIMO_DO_FORNECEDOR");
  const policy = await prisma.purchasePolicy.findUnique({ where: { companyId: input.companyId } });
  const approvalLimit = quantity(policy?.managerApprovalLimit ?? 5000);
  if ((policy?.ownerApprovalAboveLimit ?? true) && quantity(order.totalAmount) > approvalLimit && input.approverRole !== "OWNER") {
    throw new Error(`APROVACAO_DO_PROPRIETARIO_NECESSARIA:${approvalLimit.toFixed(2)}`);
  }
  return prisma.$transaction(async (tx) => {
    const saved = await tx.purchaseOrder.update({ where: { id: order.id }, data: { status: "APPROVED", approvedById: input.userId, approvedAt: new Date() } });
    await tx.auditLog.create({ data: { companyId: input.companyId, userId: input.userId, action: "PURCHASE_ORDER_APPROVED", entity: "PurchaseOrder", entityId: order.id, requestId: input.requestId, before: { status: order.status }, after: { status: saved.status } } });
    return saved;
  });
}

export async function savePurchasePolicy(input: { companyId: string; defaultCoverageDays: number; promotionLiftPercent: number; managerApprovalLimit: number; ownerApprovalAboveLimit: boolean; seasonalityEnabled: boolean; userId: string; requestId?: string }) {
  return prisma.$transaction(async (tx) => {
    const before = await tx.purchasePolicy.findUnique({ where: { companyId: input.companyId } });
    const saved = await tx.purchasePolicy.upsert({
      where: { companyId: input.companyId },
      create: { companyId: input.companyId, defaultCoverageDays: input.defaultCoverageDays, promotionLiftPercent: input.promotionLiftPercent, managerApprovalLimit: input.managerApprovalLimit, ownerApprovalAboveLimit: input.ownerApprovalAboveLimit, seasonalityEnabled: input.seasonalityEnabled, updatedById: input.userId },
      update: { defaultCoverageDays: input.defaultCoverageDays, promotionLiftPercent: input.promotionLiftPercent, managerApprovalLimit: input.managerApprovalLimit, ownerApprovalAboveLimit: input.ownerApprovalAboveLimit, seasonalityEnabled: input.seasonalityEnabled, updatedById: input.userId },
    });
    await tx.auditLog.create({ data: { companyId: input.companyId, userId: input.userId, action: "PURCHASE_POLICY_UPDATED", entity: "PurchasePolicy", entityId: saved.id, requestId: input.requestId, before: before ? { defaultCoverageDays: before.defaultCoverageDays, managerApprovalLimit: before.managerApprovalLimit } : undefined, after: { defaultCoverageDays: saved.defaultCoverageDays, promotionLiftPercent: saved.promotionLiftPercent, managerApprovalLimit: saved.managerApprovalLimit, ownerApprovalAboveLimit: saved.ownerApprovalAboveLimit, seasonalityEnabled: saved.seasonalityEnabled } } });
    return saved;
  });
}

export async function saveDemandSeasonality(input: { companyId: string; storeId: string; productId: string; month: number; factor: number; reason?: string | null; userId: string; requestId?: string }) {
  const [store, product] = await Promise.all([
    prisma.store.findFirst({ where: { id: input.storeId, companyId: input.companyId, active: true }, select: { id: true } }),
    prisma.product.findFirst({ where: { id: input.productId, companyId: input.companyId, active: true }, select: { id: true } }),
  ]);
  if (!store || !product) throw new Error("LOJA_OU_PRODUTO_DA_SAZONALIDADE_NAO_ENCONTRADO");
  return prisma.$transaction(async (tx) => {
    const saved = await tx.demandSeasonality.upsert({
      where: { storeId_productId_month: { storeId: input.storeId, productId: input.productId, month: input.month } },
      create: { companyId: input.companyId, storeId: input.storeId, productId: input.productId, month: input.month, factor: input.factor, reason: input.reason ?? null, updatedById: input.userId },
      update: { factor: input.factor, reason: input.reason ?? null, source: "MANUAL", updatedById: input.userId },
    });
    await tx.auditLog.create({ data: { companyId: input.companyId, userId: input.userId, action: "DEMAND_SEASONALITY_UPDATED", entity: "DemandSeasonality", entityId: saved.id, requestId: input.requestId, after: { storeId: input.storeId, productId: input.productId, month: input.month, factor: input.factor, reason: input.reason } } });
    return saved;
  });
}

export async function measurePurchaseRecommendations(referenceDate = new Date()) {
  const cutoff = new Date(referenceDate.getTime() - 30 * 86_400_000);
  const adopted = await prisma.purchaseRecommendation.findMany({
    where: { status: "ADOPTED", adoptedAt: { lte: cutoff } },
    include: { adoptedOrderItem: { select: { requestedQuantity: true, receivedQuantity: true, purchaseOrder: { select: { status: true } } } }, store: { select: { stockBalances: { select: { productId: true, onHand: true, reserved: true } } } } },
    take: 5000,
  });
  let measured = 0;
  for (const entry of adopted) {
    const actual = quantity(entry.adoptedOrderItem?.receivedQuantity ?? entry.actualPurchased ?? 0);
    const suggested = quantity(entry.suggestedQuantity);
    const denominator = Math.max(suggested, actual, 1);
    const accuracy = Math.max(0, 1 - Math.abs(actual - suggested) / denominator);
    const currentAvailable = entry.store.stockBalances.filter((balance) => balance.productId === entry.productId).reduce((sum, balance) => sum + Math.max(0, quantity(balance.onHand) - quantity(balance.reserved)), 0);
    const avoidedStockout = Boolean(entry.expectedStockoutAt && entry.expectedStockoutAt <= referenceDate && actual > 0 && currentAvailable > 0);
    await prisma.purchaseRecommendation.update({ where: { id: entry.id }, data: { status: "MEASURED", measuredAt: referenceDate, actualPurchased: actual, recommendationAccuracy: accuracy, avoidedStockout, avoidedLossQuantity: entry.expiryRiskQuantity } });
    measured += 1;
  }
  const expired = await prisma.purchaseRecommendation.updateMany({ where: { status: "OPEN", expectedStockoutAt: { lt: referenceDate }, recommendationDate: { lt: cutoff } }, data: { status: "EXPIRED", measuredAt: referenceDate, avoidedStockout: false, recommendationAccuracy: 0 } });
  const expiredSupportSessions = await prisma.supportAccessSession.updateMany({ where: { status: { in: ["APPROVED", "ACTIVE"] }, expiresAt: { lt: referenceDate } }, data: { status: "EXPIRED" } });
  return { duplicate: false, counters: { measured, expired: expired.count, expiredSupportSessions: expiredSupportSessions.count } };
}

export async function cancelPurchaseOrder(input: { companyId: string; orderId: string; userId: string; reason: string; requestId?: string }) {
  const order = await prisma.purchaseOrder.findFirst({ where: { id: input.orderId, companyId: input.companyId } });
  if (!order) throw new Error("PEDIDO_DE_COMPRA_NAO_ENCONTRADO");
  if (!["DRAFT", "APPROVED"].includes(order.status)) throw new Error("PEDIDO_DE_COMPRA_NAO_PODE_SER_CANCELADO");
  return prisma.$transaction(async (tx) => {
    const saved = await tx.purchaseOrder.update({ where: { id: order.id }, data: { status: "CANCELLED", cancelledAt: new Date(), notes: [order.notes, `Cancelamento: ${input.reason}`].filter(Boolean).join("\n") } });
    await tx.auditLog.create({ data: { companyId: input.companyId, userId: input.userId, action: "PURCHASE_ORDER_CANCELLED", entity: "PurchaseOrder", entityId: order.id, requestId: input.requestId, before: { status: order.status }, after: { status: saved.status, reason: input.reason } } });
    return saved;
  });
}

export async function linkPurchaseReceipt(input: { companyId: string; orderId: string; receivingId: string; notes?: string | null; userId: string; requestId?: string }) {
  const order = await prisma.purchaseOrder.findFirst({ where: { id: input.orderId, companyId: input.companyId }, include: { supplier: true, items: true } });
  if (!order) throw new Error("PEDIDO_DE_COMPRA_NAO_ENCONTRADO");
  if (!["APPROVED", "PARTIALLY_RECEIVED"].includes(order.status)) throw new Error("PEDIDO_DE_COMPRA_NAO_AGUARDA_RECEBIMENTO");
  const receiving = await prisma.dfeReceiving.findFirst({ where: { id: input.receivingId, companyId: input.companyId, status: "COMPLETED", purchaseReceipt: null }, include: { document: true, items: true } });
  if (!receiving) throw new Error("RECEBIMENTO_FISCAL_DISPONIVEL_NAO_ENCONTRADO");
  if (!receiving.document.accessKey) throw new Error("CHAVE_DE_ACESSO_NAO_ENCONTRADA");
  const accessKey = receiving.document.accessKey;
  if (receiving.document.issuerTaxId && receiving.document.issuerTaxId !== order.supplier.taxId) throw new Error("CNPJ_DA_NFE_DIFERE_DO_FORNECEDOR_DO_PEDIDO");
  if (receiving.storeId && receiving.storeId !== order.storeId) throw new Error("LOJA_DA_NFE_DIFERE_DO_PEDIDO");
  const receivedByProduct = new Map<string, { quantity: number; unitCost: number }>();
  for (const item of receiving.items) if (item.productId) {
    const current = receivedByProduct.get(item.productId) ?? { quantity: 0, unitCost: quantity(item.unitCost) };
    current.quantity += quantity(item.receivedQuantity);
    current.unitCost = quantity(item.unitCost);
    receivedByProduct.set(item.productId, current);
  }
  if (!order.items.some((item) => receivedByProduct.has(item.productId) && quantity(item.receivedQuantity) < quantity(item.requestedQuantity))) throw new Error("NFE_NAO_CONTEM_ITENS_PENDENTES_DO_PEDIDO");
  return prisma.$transaction(async (tx) => {
    const receipt = await tx.purchaseOrderReceipt.create({ data: { purchaseOrderId: order.id, dfeReceivingId: receiving.id, linkedById: input.userId, notes: input.notes ?? null } });
    const payable = quantity(receiving.document.totalAmount) > 0 ? await tx.accountPayable.create({
      data: {
        companyId: input.companyId, supplierId: order.supplierId, purchaseOrderId: order.id, purchaseReceiptId: receipt.id,
        dfeDocumentId: receiving.document.id, createdById: input.userId, documentNumber: receiving.document.documentNumber,
        accessKey, issuedAt: receiving.document.issuedAt, totalAmount: receiving.document.totalAmount,
        notes: "Gerado automaticamente a partir da NF-e conferida; parcelas aguardam configuração financeira.",
      },
    }) : null;
    let complete = true;
    let receivedAny = false;
    for (const item of order.items) {
      const received = receivedByProduct.get(item.productId);
      const updatedQuantity = Math.min(quantity(item.requestedQuantity), quantity(item.receivedQuantity) + (received?.quantity ?? 0));
      if (updatedQuantity > quantity(item.receivedQuantity)) receivedAny = true;
      if (updatedQuantity < quantity(item.requestedQuantity)) complete = false;
      await tx.purchaseOrderItem.update({ where: { id: item.id }, data: { receivedQuantity: updatedQuantity } });
      if (received) await tx.supplierProduct.upsert({ where: { supplierId_productId: { supplierId: order.supplierId, productId: item.productId } }, create: { supplierId: order.supplierId, productId: item.productId, lastUnitCost: received.unitCost }, update: { lastUnitCost: received.unitCost, active: true } });
    }
    const status = complete ? "RECEIVED" : receivedAny ? "PARTIALLY_RECEIVED" : order.status;
    const saved = await tx.purchaseOrder.update({ where: { id: order.id }, data: { status } });
    await tx.auditLog.create({ data: { companyId: input.companyId, userId: input.userId, action: "PURCHASE_RECEIPT_LINKED", entity: "PurchaseOrder", entityId: order.id, requestId: input.requestId, before: { status: order.status }, after: { status, receivingId: receiving.id, accessKey, accountPayableId: payable?.id ?? null } } });
    return saved;
  });
}
