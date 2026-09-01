import type { Prisma, PrimeOpportunityPriority, PrimeOpportunityStatus, PrimeOpportunityType } from "../generated/prisma/client.js";
import { prisma } from "../infra/prisma.js";

const activeStatuses: PrimeOpportunityStatus[] = ["NEW", "ASSIGNED", "CONTACTED", "PROPOSAL_SENT"];
const value = (input: unknown) => Number(input ?? 0);
const round = (input: number, digits = 3) => Number(input.toFixed(digits));
const addDays = (date: Date, days: number) => new Date(date.getTime() + days * 86_400_000);

type Signal = {
  companyId: string; storeId: string; productId: string; connectionId: string | null;
  type: PrimeOpportunityType; priority: PrimeOpportunityPriority; currentStock: number; minimumStock: number;
  expiringQuantity: number; salesLast30Days: number; salesPrevious30Days: number; coverageDays: number | null;
  suggestedQuantity: number; logisticsWindowDays: number; dueAt: Date; snapshot: Prisma.InputJsonValue;
};

async function companyScope(organizationId: string, kind: string, allowedStates: string[]) {
  if (kind === "PLATFORM") {
    const companies = await prisma.company.findMany({ where: { status: "ACTIVE", ...(allowedStates.length ? { state: { in: allowedStates } } : {}) }, select: { id: true } });
    return { companyIds: companies.map((item) => item.id), connectionByCompany: new Map<string, string>() };
  }
  const connections = await prisma.primeConnection.findMany({ where: { organizationId, status: "ACTIVE", company: { status: "ACTIVE", ...(allowedStates.length ? { state: { in: allowedStates } } : {}) } }, select: { id: true, companyId: true } });
  return { companyIds: connections.map((item) => item.companyId), connectionByCompany: new Map(connections.map((item) => [item.companyId, item.id])) };
}

export async function synchronizePrimeOpportunities(organizationId: string) {
  const organization = await prisma.primeOrganization.findUniqueOrThrow({ where: { id: organizationId } });
  const scope = await companyScope(organizationId, organization.kind, organization.allowedStates);
  const now = new Date();
  if (!scope.companyIds.length) {
    await prisma.primeOpportunity.updateMany({ where: { organizationId, status: { in: activeStatuses } }, data: { status: "RESOLVED" } });
    return { detected: 0, resolved: 0 };
  }

  const companies = await prisma.company.findMany({
    where: { id: { in: scope.companyIds } },
    select: {
      id: true, tradeName: true, branchName: true, city: true, state: true,
      stores: { where: { active: true }, select: { id: true, name: true, type: true }, orderBy: [{ type: "asc" }, { name: "asc" }] },
      products: {
        where: { active: true },
        select: {
          id: true, ean: true, name: true, laboratory: true, minimumStock: true, stockQuantity: true, dailySalesAverage: true,
          storeStockBalances: { select: { storeId: true, onHand: true, reserved: true, lot: { select: { expiresAt: true } } } },
        },
      },
    },
  });
  const productIds = companies.flatMap((company) => company.products.map((product) => product.id));
  const soldSince = addDays(now, -60);
  const soldItems = productIds.length ? await prisma.saleItem.findMany({
    where: { productId: { in: productIds }, sale: { status: "COMPLETED", soldAt: { gte: soldSince } } },
    select: { productId: true, quantity: true, sale: { select: { soldAt: true, cashSession: { select: { storeId: true } } } } },
  }) : [];
  const sales = new Map<string, { current: number; previous: number }>();
  const thirtyDaysAgo = addDays(now, -30);
  for (const item of soldItems) {
    if (!item.productId || !item.sale.cashSession?.storeId) continue;
    const key = `${item.sale.cashSession.storeId}:${item.productId}`;
    const current = sales.get(key) ?? { current: 0, previous: 0 };
    if (item.sale.soldAt >= thirtyDaysAgo) current.current += value(item.quantity); else current.previous += value(item.quantity);
    sales.set(key, current);
  }

  const expiryLimit = addDays(now, organization.expiryWindowDays);
  const signals: Signal[] = [];
  for (const company of companies) {
    const fallbackStore = company.stores.find((store) => store.type === "MAIN") ?? company.stores[0];
    if (!fallbackStore) continue;
    for (const product of company.products) {
      const balances = new Map<string, { stock: number; expiring: number; nearestExpiry: Date | null }>();
      for (const balance of product.storeStockBalances) {
        const current = balances.get(balance.storeId) ?? { stock: 0, expiring: 0, nearestExpiry: null };
        const available = Math.max(0, value(balance.onHand) - value(balance.reserved));
        current.stock += available;
        if (balance.lot.expiresAt >= now && balance.lot.expiresAt <= expiryLimit) {
          current.expiring += available;
          if (!current.nearestExpiry || balance.lot.expiresAt < current.nearestExpiry) current.nearestExpiry = balance.lot.expiresAt;
        }
        balances.set(balance.storeId, current);
      }
      if (!balances.size) balances.set(fallbackStore.id, { stock: Math.max(0, value(product.stockQuantity)), expiring: 0, nearestExpiry: null });

      for (const [storeId, balance] of balances) {
        const store = company.stores.find((item) => item.id === storeId);
        if (!store) continue;
        const sale = sales.get(`${storeId}:${product.id}`) ?? { current: 0, previous: 0 };
        const daily = sale.current > 0 ? sale.current / 30 : value(product.dailySalesAverage);
        const coverage = daily > 0 ? balance.stock / daily : null;
        const minimum = value(product.minimumStock);
        const growth = sale.previous > 0 ? (sale.current - sale.previous) / sale.previous : sale.current >= 10 ? 1 : 0;
        const saleableStock = Math.max(0, balance.stock - balance.expiring);
        const suggested = Math.max(0, Math.ceil(Math.max(minimum, daily * organization.targetCoverageDays) - saleableStock));
        const base = {
          companyId: company.id, storeId, productId: product.id, connectionId: scope.connectionByCompany.get(company.id) ?? null,
          currentStock: round(balance.stock), minimumStock: round(minimum), expiringQuantity: round(balance.expiring),
          salesLast30Days: round(sale.current), salesPrevious30Days: round(sale.previous), coverageDays: coverage === null ? null : round(coverage, 2),
          suggestedQuantity: round(suggested), logisticsWindowDays: organization.logisticsWindowDays, dueAt: addDays(now, organization.logisticsWindowDays),
          snapshot: { companyName: company.tradeName, branchName: company.branchName, city: company.city, state: company.state, storeName: store.name, productName: product.name, ean: product.ean, laboratory: product.laboratory, salesGrowthPercent: round(growth * 100, 1), nearestExpiryAt: balance.nearestExpiry?.toISOString() ?? null },
        };
        if (organization.alertOutOfStock && balance.stock <= 0) signals.push({ ...base, type: "OUT_OF_STOCK", priority: "CRITICAL" });
        else if (organization.alertLowCoverage && (balance.stock <= minimum || (coverage !== null && coverage <= organization.lowCoverageDays))) signals.push({ ...base, type: "LOW_COVERAGE", priority: coverage !== null && coverage <= organization.logisticsWindowDays ? "CRITICAL" : "HIGH" });
        if (organization.alertExpiring && balance.expiring > 0) signals.push({ ...base, type: "EXPIRING", priority: balance.nearestExpiry && balance.nearestExpiry <= addDays(now, 30) ? "HIGH" : "MEDIUM" });
        if (organization.alertHighDemand && sale.current >= 10 && growth >= value(organization.highDemandGrowthPercent)) signals.push({ ...base, type: "HIGH_DEMAND", priority: coverage !== null && coverage <= organization.targetCoverageDays ? "HIGH" : "MEDIUM" });
      }
    }
  }

  const existing = await prisma.primeOpportunity.findMany({ where: { organizationId }, select: { id: true, companyId: true, storeId: true, productId: true, type: true, status: true } });
  const existingByKey = new Map(existing.map((item) => [`${item.companyId}:${item.storeId}:${item.productId}:${item.type}`, item]));
  const seenIds: string[] = [];
  for (let offset = 0; offset < signals.length; offset += 40) {
    const batch = signals.slice(offset, offset + 40);
    const saved = await prisma.$transaction(batch.map((signal) => {
      const previous = existingByKey.get(`${signal.companyId}:${signal.storeId}:${signal.productId}:${signal.type}`);
      return prisma.primeOpportunity.upsert({
        where: { organizationId_companyId_storeId_productId_type: { organizationId, companyId: signal.companyId, storeId: signal.storeId, productId: signal.productId, type: signal.type } },
        create: { organizationId, ...signal },
        update: { connectionId: signal.connectionId, priority: signal.priority, currentStock: signal.currentStock, minimumStock: signal.minimumStock, expiringQuantity: signal.expiringQuantity, salesLast30Days: signal.salesLast30Days, salesPrevious30Days: signal.salesPrevious30Days, coverageDays: signal.coverageDays, suggestedQuantity: signal.suggestedQuantity, logisticsWindowDays: signal.logisticsWindowDays, dueAt: signal.dueAt, lastSeenAt: now, snapshot: signal.snapshot, ...(previous?.status === "RESOLVED" ? { status: "NEW", detectedAt: now } : {}) },
        select: { id: true },
      });
    }));
    seenIds.push(...saved.map((item) => item.id));
  }
  const resolved = await prisma.primeOpportunity.updateMany({ where: { organizationId, status: { in: activeStatuses }, ...(seenIds.length ? { id: { notIn: seenIds } } : {}) }, data: { status: "RESOLVED", lastSeenAt: now } });
  return { detected: signals.length, resolved: resolved.count };
}

export async function getPrimeContext(userId: string, internal: boolean) {
  const organizations = internal
    ? await prisma.primeOrganization.findMany({ where: { status: "ACTIVE" }, select: { id: true, code: true, tradeName: true, kind: true }, orderBy: [{ kind: "asc" }, { tradeName: "asc" }] })
    : (await prisma.primeMembership.findMany({ where: { userId, active: true, organization: { status: "ACTIVE" } }, select: { role: true, organization: { select: { id: true, code: true, tradeName: true, kind: true } } }, orderBy: { createdAt: "asc" } })).map((item) => ({ ...item.organization, role: item.role }));
  return { organizations };
}

export async function getPrimeDashboard(organizationId: string, filters: { state?: string; city?: string; type?: PrimeOpportunityType; query?: string }) {
  const organization = await prisma.primeOrganization.findUniqueOrThrow({ where: { id: organizationId } });
  const latest = await prisma.primeOpportunity.findFirst({ where: { organizationId }, select: { lastSeenAt: true }, orderBy: { lastSeenAt: "desc" } });
  if (!latest || latest.lastSeenAt.getTime() < Date.now() - 15 * 60 * 1000) await synchronizePrimeOpportunities(organizationId);
  const opportunities = await prisma.primeOpportunity.findMany({
    where: {
      organizationId, status: { in: activeStatuses }, ...(filters.type ? { type: filters.type } : {}),
      ...(filters.state ? { company: { state: filters.state } } : {}),
      ...(filters.city ? { company: { city: { contains: filters.city, mode: "insensitive" } } } : {}),
      ...(filters.query ? { OR: [{ product: { name: { contains: filters.query, mode: "insensitive" } } }, { product: { laboratory: { contains: filters.query, mode: "insensitive" } } }, { company: { tradeName: { contains: filters.query, mode: "insensitive" } } }] } : {}),
    },
    select: { id: true, type: true, status: true, priority: true, currentStock: true, minimumStock: true, expiringQuantity: true, salesLast30Days: true, salesPrevious30Days: true, coverageDays: true, suggestedQuantity: true, logisticsWindowDays: true, detectedAt: true, dueAt: true, contactedAt: true, outcome: true, snapshot: true, assignedTo: { select: { id: true, name: true } }, company: { select: { id: true, tradeName: true, city: true, state: true } }, store: { select: { id: true, name: true } }, product: { select: { id: true, name: true, ean: true, laboratory: true } } },
    orderBy: [{ priority: "asc" }, { dueAt: "asc" }, { salesLast30Days: "desc" }], take: 300,
  });
  const clientIds = new Set(opportunities.map((item) => item.company.id));
  const suggestedUnits = opportunities.reduce((sum, item) => sum + value(item.suggestedQuantity), 0);
  const expiringUnits = opportunities.reduce((sum, item) => sum + value(item.expiringQuantity), 0);
  const regions = new Map<string, { state: string; city: string; opportunities: number; clients: Set<string>; suggestedUnits: number }>();
  for (const item of opportunities) {
    const key = `${item.company.state ?? "--"}:${item.company.city ?? "Não informado"}`;
    const region = regions.get(key) ?? { state: item.company.state ?? "--", city: item.company.city ?? "Não informado", opportunities: 0, clients: new Set<string>(), suggestedUnits: 0 };
    region.opportunities += 1; region.clients.add(item.company.id); region.suggestedUnits += value(item.suggestedQuantity); regions.set(key, region);
  }
  return {
    generatedAt: new Date(), organization: { id: organization.id, code: organization.code, tradeName: organization.tradeName, kind: organization.kind },
    preferences: { logisticsWindowDays: organization.logisticsWindowDays, targetCoverageDays: organization.targetCoverageDays, lowCoverageDays: organization.lowCoverageDays, expiryWindowDays: organization.expiryWindowDays, highDemandGrowthPercent: value(organization.highDemandGrowthPercent), alertOutOfStock: organization.alertOutOfStock, alertLowCoverage: organization.alertLowCoverage, alertExpiring: organization.alertExpiring, alertHighDemand: organization.alertHighDemand, allowedStates: organization.allowedStates },
    indicators: { opportunities: opportunities.length, critical: opportunities.filter((item) => item.priority === "CRITICAL").length, clients: clientIds.size, suggestedUnits: round(suggestedUnits), expiringUnits: round(expiringUnits), contacted: opportunities.filter((item) => ["CONTACTED", "PROPOSAL_SENT", "WON"].includes(item.status)).length },
    regions: [...regions.values()].map((item) => ({ ...item, clients: item.clients.size, suggestedUnits: round(item.suggestedUnits) })).sort((a, b) => b.opportunities - a.opportunities),
    opportunities,
  };
}

export async function updatePrimePreferences(organizationId: string, data: { logisticsWindowDays: number; targetCoverageDays: number; lowCoverageDays: number; expiryWindowDays: number; highDemandGrowthPercent: number; alertOutOfStock: boolean; alertLowCoverage: boolean; alertExpiring: boolean; alertHighDemand: boolean; allowedStates: string[] }) {
  return prisma.primeOrganization.update({ where: { id: organizationId }, data: { ...data, allowedStates: data.allowedStates.map((state) => state.toUpperCase()) } });
}

export async function updatePrimeOpportunity(input: { organizationId: string; opportunityId: string; userId: string; status: PrimeOpportunityStatus; note?: string }) {
  const opportunity = await prisma.primeOpportunity.findFirst({ where: { id: input.opportunityId, organizationId: input.organizationId } });
  if (!opportunity) throw new Error("OPORTUNIDADE_PRIME_NAO_ENCONTRADA");
  const now = new Date();
  return prisma.$transaction(async (tx) => {
    const saved = await tx.primeOpportunity.update({ where: { id: opportunity.id }, data: { status: input.status, ...(input.status === "ASSIGNED" ? { assignedToId: input.userId, assignedAt: now } : {}), ...(["CONTACTED", "PROPOSAL_SENT", "WON"].includes(input.status) ? { contactedAt: opportunity.contactedAt ?? now } : {}), ...(input.note ? { outcome: input.note } : {}) } });
    await tx.primeOpportunityEvent.create({ data: { opportunityId: opportunity.id, actorId: input.userId, action: `STATUS_${input.status}`, note: input.note, metadata: { previousStatus: opportunity.status } } });
    return saved;
  });
}
