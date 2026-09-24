import { createHash, randomBytes } from "node:crypto";
import type { Prisma, PrimeConnectionStatus, PrimeOpportunityPriority, PrimeOpportunityStatus, PrimeOpportunityType, PrimeRole } from "../generated/prisma/client.js";
import { prisma } from "../infra/prisma.js";
import { deliverInvitationEmail } from "./email-delivery.js";
import { productInScope, resolvePrimeProductScope, type PrimeProductScope } from "./prime-scope.js";

const activeStatuses: PrimeOpportunityStatus[] = ["NEW", "ASSIGNED", "CONTACTED", "PROPOSAL_SENT"];
const value = (input: unknown) => Number(input ?? 0);
const round = (input: number, digits = 3) => Number(input.toFixed(digits));
const addDays = (date: Date, days: number) => new Date(date.getTime() + days * 86_400_000);

/** Sinais (ruptura, cobertura, vencimento, demanda) são recalculados no máximo a cada 60 s por organização. */
export const PRIME_SIGNAL_FRESHNESS_MS = 60_000;

/** Painel da indústria é só leitura: os perfis diferem apenas em quem gerencia equipe e preferências. */
export const primeRoleLabels: Record<PrimeRole, string> = {
  OWNER: "Responsável", ADMIN: "Administrador", ANALYST: "Visualizador",
  MANAGER: "Gerente (legado)", SALES: "Comercial (legado)", LOGISTICS: "Logística (legado)",
};
export const primeManagerRoles: PrimeRole[] = ["OWNER", "ADMIN"];

export class PrimeError extends Error {
  constructor(readonly statusCode: number, code: string) {
    super(code);
  }
}

type Signal = {
  companyId: string; storeId: string; productId: string; connectionId: string | null;
  type: PrimeOpportunityType; priority: PrimeOpportunityPriority; currentStock: number; minimumStock: number;
  expiringQuantity: number; salesLast30Days: number; salesPrevious30Days: number; coverageDays: number | null;
  suggestedQuantity: number; logisticsWindowDays: number; dueAt: Date; snapshot: Prisma.InputJsonValue;
};
type SyncResult = { detected: number; resolved: number };

/** Farmácias que a organização enxerga agora: vínculo ativo + empresa ativa + UFs permitidas. */
export async function companyScope(organizationId: string, kind: string, allowedStates: string[]) {
  if (kind === "PLATFORM") {
    const companies = await prisma.company.findMany({ where: { status: "ACTIVE", ...(allowedStates.length ? { state: { in: allowedStates } } : {}) }, select: { id: true } });
    return { companyIds: companies.map((item) => item.id), connectionByCompany: new Map<string, string>() };
  }
  const connections = await prisma.primeConnection.findMany({ where: { organizationId, status: "ACTIVE", company: { status: "ACTIVE", ...(allowedStates.length ? { state: { in: allowedStates } } : {}) } }, select: { id: true, companyId: true } });
  return { companyIds: connections.map((item) => item.companyId), connectionByCompany: new Map(connections.map((item) => [item.companyId, item.id])) };
}

const lastSyncAt = new Map<string, number>();
const inFlight = new Map<string, Promise<SyncResult>>();

/**
 * Recalcula os sinais de uma organização. Chamadas simultâneas (vários usuários
 * com o painel aberto) compartilham a mesma execução. `force` espera a execução
 * em andamento e roda outra — usado quando escopo ou vínculo mudam, para que um
 * dado que deixou de ser permitido saia na hora, não na próxima rodada.
 */
export async function synchronizePrimeOpportunities(organizationId: string, options: { force?: boolean } = {}): Promise<SyncResult> {
  const running = inFlight.get(organizationId);
  if (running) {
    if (!options.force) return running;
    await running.catch(() => undefined);
  }
  const job = runSynchronization(organizationId)
    .then((result) => { lastSyncAt.set(organizationId, Date.now()); return result; })
    .finally(() => inFlight.delete(organizationId));
  inFlight.set(organizationId, job);
  return job;
}

async function runSynchronization(organizationId: string): Promise<SyncResult> {
  const organization = await prisma.primeOrganization.findUniqueOrThrow({ where: { id: organizationId } });
  const scope = await companyScope(organizationId, organization.kind, organization.allowedStates);
  const productScope = resolvePrimeProductScope(organization.kind, organization.settings);
  const now = new Date();
  if (!scope.companyIds.length) {
    const resolved = await prisma.primeOpportunity.updateMany({ where: { organizationId, status: { in: activeStatuses } }, data: { status: "RESOLVED", lastSeenAt: now } });
    return { detected: 0, resolved: resolved.count };
  }

  const [companies, allProducts] = await Promise.all([
    prisma.company.findMany({
      where: { id: { in: scope.companyIds } },
      select: { id: true, tradeName: true, branchName: true, city: true, state: true, stores: { where: { active: true }, select: { id: true, name: true, type: true }, orderBy: [{ type: "asc" }, { name: "asc" }] } },
    }),
    prisma.product.findMany({
      where: { companyId: { in: scope.companyIds }, active: true },
      select: { id: true, companyId: true, ean: true, name: true, laboratory: true, minimumStock: true, stockQuantity: true, dailySalesAverage: true },
    }),
  ]);
  // Fora do escopo nem é carregado: saldo e vendas de produto de concorrente não
  // passam por aqui para um laboratório.
  const products = allProducts.filter((product) => productInScope(productScope, product.ean));
  const productIds = products.map((product) => product.id);
  const soldSince = addDays(now, -60);
  const [balances, soldItems] = productIds.length ? await Promise.all([
    prisma.storeStockBalance.findMany({ where: { productId: { in: productIds } }, select: { productId: true, storeId: true, onHand: true, reserved: true, lot: { select: { expiresAt: true } } } }),
    prisma.saleItem.findMany({
      where: { productId: { in: productIds }, sale: { status: "COMPLETED", soldAt: { gte: soldSince } } },
      select: { productId: true, quantity: true, sale: { select: { soldAt: true, cashSession: { select: { storeId: true } } } } },
    }),
  ]) : [[], []];
  const balancesByProduct = new Map<string, typeof balances>();
  for (const balance of balances) balancesByProduct.set(balance.productId, [...(balancesByProduct.get(balance.productId) ?? []), balance]);
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
  const companyById = new Map(companies.map((company) => [company.id, company]));
  const signals: Signal[] = [];
  for (const product of products) {
    const company = companyById.get(product.companyId);
    const fallbackStore = company?.stores.find((store) => store.type === "MAIN") ?? company?.stores[0];
    if (!company || !fallbackStore) continue;
    const perStore = new Map<string, { stock: number; expiring: number; nearestExpiry: Date | null }>();
    for (const balance of balancesByProduct.get(product.id) ?? []) {
      const current = perStore.get(balance.storeId) ?? { stock: 0, expiring: 0, nearestExpiry: null };
      const available = Math.max(0, value(balance.onHand) - value(balance.reserved));
      current.stock += available;
      if (balance.lot.expiresAt >= now && balance.lot.expiresAt <= expiryLimit) {
        current.expiring += available;
        if (!current.nearestExpiry || balance.lot.expiresAt < current.nearestExpiry) current.nearestExpiry = balance.lot.expiresAt;
      }
      perStore.set(balance.storeId, current);
    }
    if (!perStore.size) perStore.set(fallbackStore.id, { stock: Math.max(0, value(product.stockQuantity)), expiring: 0, nearestExpiry: null });

    for (const [storeId, balance] of perStore) {
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

  const existing = await prisma.primeOpportunity.findMany({ where: { organizationId }, select: { id: true, companyId: true, storeId: true, productId: true, type: true, status: true } });
  const existingByKey = new Map(existing.map((item) => [`${item.companyId}:${item.storeId}:${item.productId}:${item.type}`, item]));
  const seenIds: string[] = [];
  for (let offset = 0; offset < signals.length; offset += 40) {
    const batch = signals.slice(offset, offset + 40);
    const saved = await prisma.$transaction(batch.map((signal) => {
      const previous = existingByKey.get(`${signal.companyId}:${signal.storeId}:${signal.productId}:${signal.type}`);
      // Painel só leitura: sinal presente é sinal visível. Status fechados de
      // versões antigas (fila comercial) reabrem se a condição continua.
      const reopen = previous && !activeStatuses.includes(previous.status);
      return prisma.primeOpportunity.upsert({
        where: { organizationId_companyId_storeId_productId_type: { organizationId, companyId: signal.companyId, storeId: signal.storeId, productId: signal.productId, type: signal.type } },
        create: { organizationId, ...signal },
        update: { connectionId: signal.connectionId, priority: signal.priority, currentStock: signal.currentStock, minimumStock: signal.minimumStock, expiringQuantity: signal.expiringQuantity, salesLast30Days: signal.salesLast30Days, salesPrevious30Days: signal.salesPrevious30Days, coverageDays: signal.coverageDays, suggestedQuantity: signal.suggestedQuantity, logisticsWindowDays: signal.logisticsWindowDays, dueAt: signal.dueAt, lastSeenAt: now, snapshot: signal.snapshot, ...(reopen ? { status: "NEW", detectedAt: now } : {}) },
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

/** Dia civil em São Paulo ("AAAA-MM-DD") — "hoje" da farmácia, não o do servidor em UTC. */
const saoPauloDay = (date: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);

/**
 * Visão ao vivo: sell-out e estoque dos produtos no escopo, nas farmácias com
 * vínculo ativo. Calculada a cada leitura (sem cache) — é o "tempo real" do
 * painel. Só quantidades: nunca preço, margem, consumidor ou financeiro.
 */
export async function getPrimeLiveOverview(companyIds: string[], productScope: PrimeProductScope) {
  const now = new Date();
  const days = Array.from({ length: 30 }, (_, index) => saoPauloDay(addDays(now, -index)));
  const today = days[0]!;
  const last7 = new Set(days.slice(0, 7));
  const last30 = new Set(days);
  const trendDays = days.slice(0, 14).reverse();
  const empty = { today, sellOut: { today: 0, last7Days: 0, last30Days: 0 }, stockUnits: 0, pharmacies: 0, productsTracked: 0, ruptures: 0, daily: trendDays.map((day) => ({ day, units: 0 })), products: [] as unknown[], pharmacyRows: [] as unknown[] };
  if (!companyIds.length) return empty;

  const [companies, allProducts] = await Promise.all([
    prisma.company.findMany({ where: { id: { in: companyIds } }, select: { id: true, tradeName: true, city: true, state: true } }),
    prisma.product.findMany({ where: { companyId: { in: companyIds }, active: true }, select: { id: true, companyId: true, ean: true, name: true, laboratory: true } }),
  ]);
  const products = allProducts.filter((product) => productInScope(productScope, product.ean));
  if (!products.length) return { ...empty, pharmacies: companies.length };
  const productIds = products.map((product) => product.id);
  const [balances, items] = await Promise.all([
    prisma.storeStockBalance.groupBy({ by: ["productId"], where: { productId: { in: productIds } }, _sum: { onHand: true, reserved: true } }),
    prisma.saleItem.findMany({
      where: { productId: { in: productIds }, sale: { status: "COMPLETED", soldAt: { gte: addDays(now, -31) } } },
      select: { productId: true, quantity: true, sale: { select: { soldAt: true } } },
    }),
  ]);
  const stockByProduct = new Map(balances.map((row) => [row.productId, Math.max(0, value(row._sum.onHand) - value(row._sum.reserved))]));
  const soldByProduct = new Map<string, { today: number; last7: number; last30: number }>();
  const dailyUnits = new Map<string, number>();
  for (const item of items) {
    if (!item.productId) continue;
    const day = saoPauloDay(item.sale.soldAt);
    if (!last30.has(day)) continue;
    const quantity = value(item.quantity);
    const sold = soldByProduct.get(item.productId) ?? { today: 0, last7: 0, last30: 0 };
    sold.last30 += quantity;
    if (last7.has(day)) sold.last7 += quantity;
    if (day === today) sold.today += quantity;
    soldByProduct.set(item.productId, sold);
    dailyUnits.set(day, (dailyUnits.get(day) ?? 0) + quantity);
  }

  // A mesma EAN é um cadastro por farmácia; para a indústria o produto é a EAN.
  const byEan = new Map<string, { ean: string; name: string; laboratory: string; stockUnits: number; today: number; last7: number; last30: number; pharmacies: number; pharmaciesInRupture: number }>();
  const byCompany = new Map<string, { stockUnits: number; today: number; last30: number; ruptures: number; products: number }>();
  let ruptures = 0;
  for (const product of products) {
    const stock = stockByProduct.get(product.id) ?? 0;
    const sold = soldByProduct.get(product.id) ?? { today: 0, last7: 0, last30: 0 };
    const rupture = stock <= 0;
    if (rupture) ruptures += 1;
    const row = byEan.get(product.ean) ?? { ean: product.ean, name: product.name, laboratory: product.laboratory, stockUnits: 0, today: 0, last7: 0, last30: 0, pharmacies: 0, pharmaciesInRupture: 0 };
    row.stockUnits += stock; row.today += sold.today; row.last7 += sold.last7; row.last30 += sold.last30; row.pharmacies += 1; if (rupture) row.pharmaciesInRupture += 1;
    byEan.set(product.ean, row);
    const company = byCompany.get(product.companyId) ?? { stockUnits: 0, today: 0, last30: 0, ruptures: 0, products: 0 };
    company.stockUnits += stock; company.today += sold.today; company.last30 += sold.last30; company.products += 1; if (rupture) company.ruptures += 1;
    byCompany.set(product.companyId, company);
  }
  const productRows = [...byEan.values()]
    .map((row) => ({ ...row, stockUnits: round(row.stockUnits), today: round(row.today), last7: round(row.last7), last30: round(row.last30), coverageDays: row.last30 > 0 ? round(row.stockUnits / (row.last30 / 30), 1) : null }))
    .sort((a, b) => b.last30 - a.last30 || a.name.localeCompare(b.name));
  const pharmacyRows = companies
    .map((company) => {
      const totals = byCompany.get(company.id) ?? { stockUnits: 0, today: 0, last30: 0, ruptures: 0, products: 0 };
      return { companyId: company.id, tradeName: company.tradeName, city: company.city, state: company.state, stockUnits: round(totals.stockUnits), today: round(totals.today), last30: round(totals.last30), ruptures: totals.ruptures, products: totals.products };
    })
    .sort((a, b) => b.last30 - a.last30 || a.tradeName.localeCompare(b.tradeName));
  const sum = (key: "today" | "last7" | "last30") => round(productRows.reduce((total, row) => total + row[key], 0));
  return {
    today,
    sellOut: { today: sum("today"), last7Days: sum("last7"), last30Days: sum("last30") },
    stockUnits: round(productRows.reduce((total, row) => total + row.stockUnits, 0)),
    pharmacies: companies.length,
    productsTracked: productRows.length,
    ruptures,
    daily: trendDays.map((day) => ({ day, units: round(dailyUnits.get(day) ?? 0) })),
    products: productRows.slice(0, 50),
    pharmacyRows: pharmacyRows.slice(0, 50),
  };
}

export async function getPrimeDashboard(organizationId: string, filters: { state?: string; city?: string; type?: PrimeOpportunityType; query?: string }, viewer: { role: PrimeRole; governance: boolean }) {
  const lastSync = lastSyncAt.get(organizationId);
  if (!lastSync || Date.now() - lastSync > PRIME_SIGNAL_FRESHNESS_MS) await synchronizePrimeOpportunities(organizationId);
  const organization = await prisma.primeOrganization.findUniqueOrThrow({ where: { id: organizationId } });
  const productScope = resolvePrimeProductScope(organization.kind, organization.settings);
  const { companyIds } = await companyScope(organizationId, organization.kind, organization.allowedStates);
  const companyFilter: Prisma.CompanyWhereInput = {
    ...(filters.state ? { state: filters.state } : {}),
    ...(filters.city ? { city: { contains: filters.city, mode: "insensitive" } } : {}),
  };
  // Defesa em profundidade: mesmo entre duas sincronizações, a leitura só
  // devolve farmácias com vínculo ativo AGORA e produtos dentro do escopo.
  const opportunities = companyIds.length ? (await prisma.primeOpportunity.findMany({
    where: {
      organizationId, companyId: { in: companyIds }, status: { in: activeStatuses }, ...(filters.type ? { type: filters.type } : {}),
      ...(Object.keys(companyFilter).length ? { company: companyFilter } : {}),
      ...(filters.query ? { OR: [{ product: { name: { contains: filters.query, mode: "insensitive" } } }, { product: { laboratory: { contains: filters.query, mode: "insensitive" } } }, { company: { tradeName: { contains: filters.query, mode: "insensitive" } } }] } : {}),
    },
    select: { id: true, type: true, priority: true, currentStock: true, minimumStock: true, expiringQuantity: true, salesLast30Days: true, salesPrevious30Days: true, coverageDays: true, suggestedQuantity: true, logisticsWindowDays: true, detectedAt: true, dueAt: true, snapshot: true, company: { select: { id: true, tradeName: true, city: true, state: true } }, store: { select: { id: true, name: true } }, product: { select: { id: true, name: true, ean: true, laboratory: true } } },
    orderBy: [{ priority: "asc" }, { dueAt: "asc" }, { salesLast30Days: "desc" }], take: 300,
  })).filter((item) => productInScope(productScope, item.product.ean)) : [];
  const clientIds = new Set(opportunities.map((item) => item.company.id));
  const regions = new Map<string, { state: string; city: string; opportunities: number; clients: Set<string>; suggestedUnits: number }>();
  for (const item of opportunities) {
    const key = `${item.company.state ?? "--"}:${item.company.city ?? "Não informado"}`;
    const region = regions.get(key) ?? { state: item.company.state ?? "--", city: item.company.city ?? "Não informado", opportunities: 0, clients: new Set<string>(), suggestedUnits: 0 };
    region.opportunities += 1; region.clients.add(item.company.id); region.suggestedUnits += value(item.suggestedQuantity); regions.set(key, region);
  }
  const live = await getPrimeLiveOverview(companyIds, productScope);
  return {
    generatedAt: new Date(),
    signalsSyncedAt: new Date(lastSyncAt.get(organizationId) ?? Date.now()),
    organization: { id: organization.id, code: organization.code, tradeName: organization.tradeName, kind: organization.kind },
    viewer: { role: viewer.role, roleLabel: primeRoleLabels[viewer.role], governance: viewer.governance, canManage: primeManagerRoles.includes(viewer.role) },
    scope: productScope.mode === "ALL" ? { mode: "ALL" as const } : { mode: "OWN" as const, gs1Prefixes: productScope.gs1Prefixes },
    preferences: { logisticsWindowDays: organization.logisticsWindowDays, targetCoverageDays: organization.targetCoverageDays, lowCoverageDays: organization.lowCoverageDays, expiryWindowDays: organization.expiryWindowDays, highDemandGrowthPercent: value(organization.highDemandGrowthPercent), alertOutOfStock: organization.alertOutOfStock, alertLowCoverage: organization.alertLowCoverage, alertExpiring: organization.alertExpiring, alertHighDemand: organization.alertHighDemand, allowedStates: organization.allowedStates },
    indicators: { opportunities: opportunities.length, critical: opportunities.filter((item) => item.priority === "CRITICAL").length, clients: clientIds.size, suggestedUnits: round(opportunities.reduce((sum, item) => sum + value(item.suggestedQuantity), 0)), expiringUnits: round(opportunities.reduce((sum, item) => sum + value(item.expiringQuantity), 0)) },
    regions: [...regions.values()].map((item) => ({ ...item, clients: item.clients.size, suggestedUnits: round(item.suggestedUnits) })).sort((a, b) => b.opportunities - a.opportunities),
    opportunities,
    live,
  };
}

export async function updatePrimePreferences(organizationId: string, data: { logisticsWindowDays: number; targetCoverageDays: number; lowCoverageDays: number; expiryWindowDays: number; highDemandGrowthPercent: number; alertOutOfStock: boolean; alertLowCoverage: boolean; alertExpiring: boolean; alertHighDemand: boolean; allowedStates: string[] }) {
  const saved = await prisma.primeOrganization.update({ where: { id: organizationId }, data: { ...data, allowedStates: data.allowedStates.map((state) => state.toUpperCase()) } });
  await synchronizePrimeOpportunities(organizationId, { force: true });
  return saved;
}

// ---------------------------------------------------------------------------
// Equipe da organização (convites e membros)
// ---------------------------------------------------------------------------

type Actor = { userId: string; requestId: string; ipAddress: string };

export async function listPrimeTeam(organizationId: string) {
  const [members, invites] = await Promise.all([
    prisma.primeMembership.findMany({ where: { organizationId }, select: { role: true, active: true, createdAt: true, user: { select: { id: true, name: true, email: true, status: true } } }, orderBy: { createdAt: "asc" } }),
    prisma.invitation.findMany({ where: { primeOrganizationId: organizationId, acceptedAt: null, expiresAt: { gt: new Date() } }, select: { id: true, email: true, primeRole: true, expiresAt: true, createdAt: true }, orderBy: { createdAt: "desc" } }),
  ]);
  return {
    members: members.map((member) => ({ userId: member.user.id, name: member.user.name, email: member.user.email, role: member.role, roleLabel: primeRoleLabels[member.role], active: member.active && member.user.status === "ACTIVE", since: member.createdAt })),
    invites: invites.map((invite) => ({ ...invite, roleLabel: invite.primeRole ? primeRoleLabels[invite.primeRole] : null })),
  };
}

export async function createPrimeInvitation(input: { organizationId: string; email: string; role: PrimeRole; actor: Actor }) {
  const organization = await prisma.primeOrganization.findUnique({ where: { id: input.organizationId }, select: { id: true, tradeName: true, kind: true, status: true } });
  if (!organization || organization.kind === "PLATFORM") throw new PrimeError(404, "ORGANIZACAO_PRIME_NAO_ENCONTRADA");
  if (organization.status !== "ACTIVE") throw new PrimeError(409, "ORGANIZACAO_PRIME_INATIVA");
  const now = new Date();
  const member = await prisma.primeMembership.findFirst({ where: { organizationId: organization.id, active: true, user: { email: input.email } } });
  if (member) throw new PrimeError(409, "USUARIO_JA_VINCULADO");
  const pending = await prisma.invitation.findFirst({ where: { primeOrganizationId: organization.id, email: input.email, acceptedAt: null, expiresAt: { gt: now } } });
  if (pending) throw new PrimeError(409, "CONVITE_JA_ENVIADO");
  const token = randomBytes(36).toString("base64url");
  const invitation = await prisma.$transaction(async (tx) => {
    const created = await tx.invitation.create({
      data: { email: input.email, primeOrganizationId: organization.id, primeRole: input.role, tokenHash: createHash("sha256").update(token).digest("hex"), invitedById: input.actor.userId, expiresAt: new Date(now.getTime() + 72 * 60 * 60 * 1000) },
      select: { id: true, email: true, primeRole: true, expiresAt: true },
    });
    await tx.auditLog.create({ data: { userId: input.actor.userId, action: "PRIME_INVITATION_CREATED", entity: "Invitation", entityId: created.id, requestId: input.actor.requestId, ipAddress: input.actor.ipAddress, after: { email: created.email, primeOrganizationId: organization.id, primeRole: input.role } } });
    return created;
  });
  const delivery = await deliverInvitationEmail({ invitationId: invitation.id, companyId: null, companyName: organization.tradeName, recipient: invitation.email, role: primeRoleLabels[input.role], token, audience: "PRIME" });
  return { ...invitation, inviteUrl: delivery.inviteUrl, delivery: { status: delivery.delivery.status, automatic: delivery.automatic } };
}

/**
 * Altera perfil/situação de um membro. Pela organização (OWNER/ADMIN): só
 * Administrador e Visualizador, nunca o Responsável nem a si mesmo. Pela Nexus:
 * qualquer membro.
 */
export async function updatePrimeMember(input: { organizationId: string; userId: string; active?: boolean; role?: PrimeRole; by: "NEXUS" | "ORGANIZATION"; actor: Actor }) {
  const membership = await prisma.primeMembership.findUnique({ where: { organizationId_userId: { organizationId: input.organizationId, userId: input.userId } } });
  if (!membership) throw new PrimeError(404, "MEMBRO_PRIME_NAO_ENCONTRADO");
  if (input.by === "ORGANIZATION") {
    if (input.userId === input.actor.userId) throw new PrimeError(409, "AUTO_ALTERACAO_NAO_PERMITIDA");
    if (membership.role === "OWNER" || input.role === "OWNER") throw new PrimeError(403, "RESPONSAVEL_SO_PELA_NEXUS");
  }
  return prisma.$transaction(async (tx) => {
    const saved = await tx.primeMembership.update({ where: { id: membership.id }, data: { ...(input.active !== undefined && { active: input.active }), ...(input.role && { role: input.role }) } });
    await tx.auditLog.create({ data: { userId: input.actor.userId, action: "PRIME_MEMBER_UPDATED", entity: "PrimeMembership", entityId: membership.id, requestId: input.actor.requestId, ipAddress: input.actor.ipAddress, before: { role: membership.role, active: membership.active }, after: { role: saved.role, active: saved.active, by: input.by } } });
    return { userId: saved.userId, role: saved.role, roleLabel: primeRoleLabels[saved.role], active: saved.active };
  });
}

// ---------------------------------------------------------------------------
// Vínculo farmácia ⇄ organização (quem vê os dados de quem)
// ---------------------------------------------------------------------------

const suspendedByOf = (settings: unknown) => (settings && typeof settings === "object" && !Array.isArray(settings) ? (settings as Record<string, unknown>).suspendedBy : undefined);

/**
 * Liga, suspende ou encerra o compartilhamento dos dados de uma farmácia com uma
 * organização. Quem suspendeu é quem reativa: a Nexus não religa o que a
 * farmácia desligou, e vice-versa. Encerrado não volta por aqui.
 */
export async function setPrimeConnection(input: { organizationId: string; companyId: string; status: PrimeConnectionStatus; by: "NEXUS" | "PHARMACY"; actor: Actor }) {
  const existing = await prisma.primeConnection.findUnique({ where: { organizationId_companyId: { organizationId: input.organizationId, companyId: input.companyId } } });
  if (input.by === "PHARMACY" && !existing) throw new PrimeError(404, "COMPARTILHAMENTO_NAO_ENCONTRADO");
  if (existing?.status === "TERMINATED" && input.status !== "TERMINATED" && input.by === "PHARMACY") throw new PrimeError(409, "COMPARTILHAMENTO_ENCERRADO");
  if (input.by === "PHARMACY" && input.status === "TERMINATED") throw new PrimeError(403, "ENCERRAMENTO_SO_PELA_NEXUS");
  const suspendedBy = suspendedByOf(existing?.settings);
  if (input.status === "ACTIVE" && existing?.status === "SUSPENDED") {
    if (input.by === "NEXUS" && suspendedBy === "PHARMACY") throw new PrimeError(409, "COMPARTILHAMENTO_SUSPENSO_PELA_FARMACIA");
    if (input.by === "PHARMACY" && suspendedBy !== "PHARMACY") throw new PrimeError(409, "COMPARTILHAMENTO_SUSPENSO_PELA_NEXUS");
  }
  if (input.by === "NEXUS") {
    const [organization, company] = await Promise.all([
      prisma.primeOrganization.findUnique({ where: { id: input.organizationId }, select: { kind: true } }),
      prisma.company.findUnique({ where: { id: input.companyId }, select: { id: true } }),
    ]);
    if (!organization || organization.kind === "PLATFORM") throw new PrimeError(404, "ORGANIZACAO_PRIME_NAO_ENCONTRADA");
    if (!company) throw new PrimeError(404, "EMPRESA_NAO_ENCONTRADA");
  }
  const baseSettings = existing?.settings && typeof existing.settings === "object" && !Array.isArray(existing.settings) ? (existing.settings as Record<string, unknown>) : {};
  const { suspendedBy: _previousSuspendedBy, ...otherSettings } = baseSettings;
  void _previousSuspendedBy;
  const settings = (input.status === "SUSPENDED" ? { ...otherSettings, suspendedBy: input.by } : otherSettings) as Prisma.InputJsonValue;
  const data = { status: input.status, settings, endsAt: input.status === "TERMINATED" ? new Date() : null };
  const saved = await prisma.$transaction(async (tx) => {
    const result = existing
      ? await tx.primeConnection.update({ where: { id: existing.id }, data })
      : await tx.primeConnection.create({ data: { organizationId: input.organizationId, companyId: input.companyId, ...data } });
    await tx.auditLog.create({ data: { companyId: input.companyId, userId: input.actor.userId, action: "PRIME_CONNECTION_UPDATED", entity: "PrimeConnection", entityId: result.id, requestId: input.actor.requestId, ipAddress: input.actor.ipAddress, ...(existing && { before: { status: existing.status, suspendedBy: typeof suspendedBy === "string" ? suspendedBy : null } }), after: { organizationId: input.organizationId, status: result.status, by: input.by } } });
    return result;
  });
  // Tira (ou põe) os dados da farmácia no painel na hora, sem esperar a próxima rodada.
  await synchronizePrimeOpportunities(input.organizationId, { force: true });
  return { id: saved.id, organizationId: saved.organizationId, companyId: saved.companyId, status: saved.status, suspendedBy: suspendedByOf(saved.settings) ?? null };
}
