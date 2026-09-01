import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../infra/prisma.js";
import {
  authenticate,
  requireTenantRoles,
  tenantContext,
} from "../security/auth.js";
import { buildManagerialReport, closeManagerialPeriod, getManagerialSaleDetail, managerialReportCsv, managerialReportPdf, managerialReportXlsx } from "../services/managerial-report.service.js";
import { getPurchasingDashboard } from "../services/purchasing.service.js";

const periodSchema = z.object({
  inicio: z.coerce.date().optional(),
  fim: z.coerce.date().optional(),
});

const managementRoles = ["OWNER", "ADMIN", "MANAGER", "FINANCE", "VIEWER"];
const operationRoles = [
  "OWNER",
  "ADMIN",
  "MANAGER",
  "BUYER",
  "FINANCE",
  "PHARMACIST",
  "VIEWER",
];
const fiscalRoles = [
  "OWNER",
  "ADMIN",
  "MANAGER",
  "FINANCE",
  "PHARMACIST",
  "VIEWER",
];

function getPeriod(query: unknown) {
  const parsed = periodSchema.safeParse(query);
  const end = parsed.success && parsed.data.fim ? parsed.data.fim : new Date();
  const start =
    parsed.success && parsed.data.inicio
      ? parsed.data.inicio
      : new Date(end.getTime() - 29 * 86_400_000);
  if (start > end || end.getTime() - start.getTime() > 366 * 86_400_000) {
    return null;
  }
  end.setHours(23, 59, 59, 999);
  start.setHours(0, 0, 0, 0);
  return { start, end };
}

const money = (value: unknown) => Number(value ?? 0);
const analyticalFilterBaseSchema = z.object({
  inicio: z.coerce.date(), fim: z.coerce.date(), loja_id: z.string().uuid().optional(), pdv_id: z.string().uuid().optional(), categoria_id: z.string().uuid().optional(), produto_id: z.string().uuid().optional(), vendedor_id: z.string().uuid().optional(),
});
const validAnalyticalPeriod = (data: { inicio: Date; fim: Date }) => data.inicio <= data.fim && data.fim.getTime() - data.inicio.getTime() <= 366 * 86_400_000;
const analyticalFilterSchema = analyticalFilterBaseSchema.refine(validAnalyticalPeriod, { message: "período inválido" });
const analyticalExportSchema = analyticalFilterBaseSchema.extend({ formato: z.enum(["CSV", "XLSX", "PDF"]).default("CSV") }).refine(validAnalyticalPeriod, { message: "período inválido" });

function managerialFilters(value: z.infer<typeof analyticalFilterSchema>) {
  const start = new Date(value.inicio); start.setHours(0, 0, 0, 0);
  const end = new Date(value.fim); end.setHours(23, 59, 59, 999);
  return { start, end, storeId: value.loja_id, pointOfSaleId: value.pdv_id, categoryId: value.categoria_id, productId: value.produto_id, sellerId: value.vendedor_id };
}

export async function reportsRoutes(app: FastifyInstance) {
  app.get("/gerencial/opcoes", { preHandler: [authenticate, tenantContext, requireTenantRoles(managementRoles)] }, async (request) => {
    const companyId = request.tenant!.companyId;
    const [stores, categories, products, sellers] = await Promise.all([
      prisma.store.findMany({ where: { companyId, active: true }, select: { id: true, code: true, name: true, pointsOfSale: { where: { active: true }, select: { id: true, code: true, name: true } } }, orderBy: { name: "asc" } }),
      prisma.fiscalCategory.findMany({ where: { companyId, active: true }, select: { id: true, code: true, name: true }, orderBy: { name: "asc" } }),
      prisma.product.findMany({ where: { companyId, active: true }, select: { id: true, ean: true, name: true, categoryId: true }, orderBy: { name: "asc" } }),
      prisma.membership.findMany({ where: { companyId, active: true, role: { in: ["OWNER", "ADMIN", "MANAGER", "PHARMACIST", "ATTENDANT", "OPERATOR"] } }, select: { role: true, user: { select: { id: true, name: true } } }, orderBy: { user: { name: "asc" } } }),
    ]);
    return { stores, categories, products, sellers: sellers.map((entry) => ({ ...entry.user, role: entry.role })) };
  });

  app.get("/gerencial", { preHandler: [authenticate, tenantContext, requireTenantRoles(managementRoles)] }, async (request, reply) => {
    const parsed = analyticalFilterSchema.safeParse(request.query);
    if (!parsed.success) return reply.status(400).send({ erro: "FILTROS_GERENCIAIS_INVALIDOS", detalhes: parsed.error.flatten() });
    return reply.send(await buildManagerialReport(request.tenant!.companyId, managerialFilters(parsed.data)));
  });

  app.post("/gerencial/exportar", { preHandler: [authenticate, tenantContext, requireTenantRoles(managementRoles)] }, async (request, reply) => {
    const parsed = analyticalExportSchema.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ erro: "FILTROS_GERENCIAIS_INVALIDOS" });
    const report = await buildManagerialReport(request.tenant!.companyId, managerialFilters(parsed.data));
    const format = parsed.data.formato;
    await prisma.auditLog.create({ data: { companyId: request.tenant!.companyId, userId: request.user.sub, action: "MANAGERIAL_REPORT_EXPORTED", entity: "ManagerialReport", requestId: request.id, after: { filters: parsed.data, rows: report.sales.length, format } } });
    const baseName = `nexus-gerencial-${parsed.data.inicio.toISOString().slice(0, 10)}-${parsed.data.fim.toISOString().slice(0, 10)}`;
    if (format === "XLSX") return reply.header("content-type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet").header("content-disposition", `attachment; filename="${baseName}.xlsx"`).send(await managerialReportXlsx(report));
    if (format === "PDF") return reply.header("content-type", "application/pdf").header("content-disposition", `attachment; filename="${baseName}.pdf"`).send(await managerialReportPdf(report));
    return reply.header("content-type", "text/csv; charset=utf-8").header("content-disposition", `attachment; filename="${baseName}.csv"`).send(managerialReportCsv(report));
  });

  app.get<{ Params: { id: string } }>("/gerencial/vendas/:id", { preHandler: [authenticate, tenantContext, requireTenantRoles(managementRoles)] }, async (request, reply) => {
    const id = z.string().uuid().safeParse(request.params.id);
    if (!id.success) return reply.status(400).send({ erro: "VENDA_INVALIDA" });
    try { return reply.send(await getManagerialSaleDetail(request.tenant!.companyId, id.data)); }
    catch (error) { return reply.status(404).send({ erro: error instanceof Error ? error.message : "VENDA_NAO_ENCONTRADA" }); }
  });

  app.post("/gerencial/fechar", { preHandler: [authenticate, tenantContext, requireTenantRoles(["OWNER", "ADMIN", "MANAGER"])] }, async (request, reply) => {
    const parsed = z.object({ competencia: z.string().regex(/^\d{4}-\d{2}$/), observacao: z.string().trim().min(10).max(1000) }).safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ erro: "FECHAMENTO_GERENCIAL_INVALIDO", detalhes: parsed.error.flatten() });
    const period = new Date(`${parsed.data.competencia}-01T00:00:00.000Z`);
    return reply.status(201).send(await closeManagerialPeriod({ companyId: request.tenant!.companyId, period, note: parsed.data.observacao, userId: request.user.sub, requestId: request.id }));
  });

  app.get(
    "/alertas",
    { preHandler: [authenticate, tenantContext, requireTenantRoles(operationRoles)] },
    async (request) => {
      const companyId = request.tenant!.companyId;
      const [summary, alerts, lastRun] = await Promise.all([
        prisma.businessAlert.groupBy({ by: ["type", "status"], where: { companyId }, _count: true }),
        prisma.businessAlert.findMany({
          where: { companyId, status: { in: ["OPEN", "ACKNOWLEDGED"] } },
          include: {
            product: { select: { name: true, ean: true, stockQuantity: true, salePrice: true } },
            lot: { select: { code: true, quantity: true, expiresAt: true } },
            invoice: { select: { amount: true, dueAt: true, status: true } },
            acknowledgedBy: { select: { name: true } },
          },
          orderBy: [{ severity: "desc" }, { dueAt: "asc" }, { detectedAt: "desc" }],
          take: 80,
        }),
        prisma.backgroundJobRun.findFirst({ where: { jobName: "DAILY_BUSINESS_AUTOMATION" }, orderBy: { startedAt: "desc" } }),
      ]);
      return {
        indicators: {
          open: alerts.filter((alert) => alert.status === "OPEN").length,
          acknowledged: alerts.filter((alert) => alert.status === "ACKNOWLEDGED").length,
          critical: alerts.filter((alert) => alert.severity === "CRITICAL").length,
          purchaseOpportunities: alerts.filter((alert) => alert.type === "HIGH_MARGIN_REORDER").length,
        },
        summary,
        alerts: alerts.map((alert) => ({
          ...alert,
          product: alert.product ? { ...alert.product, stockQuantity: money(alert.product.stockQuantity), salePrice: money(alert.product.salePrice) } : null,
          lot: alert.lot ? { ...alert.lot, quantity: money(alert.lot.quantity) } : null,
          invoice: alert.invoice ? { ...alert.invoice, amount: money(alert.invoice.amount) } : null,
        })),
        lastRun,
      };
    },
  );

  app.get(
    "/gestao",
    {
      preHandler: [
        authenticate,
        tenantContext,
        requireTenantRoles(managementRoles),
      ],
    },
    async (request, reply) => {
      const period = getPeriod(request.query);
      if (!period) return reply.status(400).send({ erro: "PERIODO_INVALIDO" });
      const companyId = request.tenant!.companyId;
      const days =
        Math.floor((period.end.getTime() - period.start.getTime()) / 86_400_000) +
        1;
      const previousEnd = new Date(period.start.getTime() - 1);
      const previousStart = new Date(previousEnd.getTime() - (days - 1) * 86_400_000);

      const [company, sales, previousSales, dailySales, topItems, alerts, expiringLots, pendingAnalyses] =
        await Promise.all([
          prisma.company.findUnique({
            where: { id: companyId },
            select: { id: true, tradeName: true, taxRegime: true, status: true },
          }),
          prisma.sale.aggregate({
            where: {
              companyId,
              status: "COMPLETED",
              soldAt: { gte: period.start, lte: period.end },
            },
            _count: true,
            _sum: {
              grossAmount: true,
              costAmount: true,
              taxAmount: true,
              netProfit: true,
            },
          }),
          prisma.sale.aggregate({
            where: {
              companyId,
              status: "COMPLETED",
              soldAt: { gte: previousStart, lte: previousEnd },
            },
            _sum: { grossAmount: true, netProfit: true },
          }),
          prisma.sale.findMany({
            where: {
              companyId,
              status: "COMPLETED",
              soldAt: { gte: period.start, lte: period.end },
            },
            select: { soldAt: true, grossAmount: true, netProfit: true },
            orderBy: { soldAt: "asc" },
          }),
          prisma.saleItem.groupBy({
            by: ["productName"],
            where: {
              sale: {
                companyId,
                status: "COMPLETED",
                soldAt: { gte: period.start, lte: period.end },
              },
            },
            _sum: { quantity: true, profitAmount: true },
            orderBy: { _sum: { quantity: "desc" } },
            take: 5,
          }),
          prisma.reorderAlert.count({
            where: { companyId, status: { in: ["OPEN", "ACKNOWLEDGED"] } },
          }),
          prisma.inventoryLot.count({
            where: {
              product: { companyId },
              quantity: { gt: 0 },
              expiresAt: {
                gte: new Date(),
                lte: new Date(Date.now() + 90 * 86_400_000),
              },
            },
          }),
          prisma.taxAnalysis.count({
            where: {
              companyId,
              status: { in: ["PENDING", "PROCESSING", "NEEDS_REVIEW"] },
            },
          }),
        ]);

      const daily = new Map<string, { revenue: number; profit: number }>();
      for (const sale of dailySales) {
        const key = sale.soldAt.toISOString().slice(0, 10);
        const current = daily.get(key) ?? { revenue: 0, profit: 0 };
        current.revenue += money(sale.grossAmount);
        current.profit += money(sale.netProfit);
        daily.set(key, current);
      }
      const revenue = money(sales._sum.grossAmount);
      const previousRevenue = money(previousSales._sum.grossAmount);

      return {
        company,
        period: { start: period.start, end: period.end },
        indicators: {
          salesCount: sales._count,
          revenue,
          cost: money(sales._sum.costAmount),
          tax: money(sales._sum.taxAmount),
          netProfit: money(sales._sum.netProfit),
          margin: revenue ? money(sales._sum.netProfit) / revenue : 0,
          revenueVariation: previousRevenue
            ? (revenue - previousRevenue) / previousRevenue
            : null,
          reorderAlerts: alerts,
          expiringLots,
          pendingTaxAnalyses: pendingAnalyses,
        },
        daily: [...daily.entries()].map(([date, values]) => ({ date, ...values })),
        topProducts: topItems.map((item) => ({
          name: item.productName,
          quantity: money(item._sum.quantity),
          profit: money(item._sum.profitAmount),
        })),
      };
    },
  );

  app.get(
    "/operacao",
    {
      preHandler: [
        authenticate,
        tenantContext,
        requireTenantRoles(operationRoles),
      ],
    },
    async (request) => {
      const companyId = request.tenant!.companyId;
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const in90Days = new Date(Date.now() + 90 * 86_400_000);
      const [products, todaySales, alerts, expiringLots, movements] =
        await Promise.all([
          prisma.product.count({ where: { companyId, active: true } }),
          prisma.sale.aggregate({
            where: { companyId, status: "COMPLETED", soldAt: { gte: today } },
            _count: true,
            _sum: { grossAmount: true },
          }),
          getPurchasingDashboard({ companyId, targetDays: 30 }),
          prisma.inventoryLot.findMany({
            where: {
              product: { companyId },
              quantity: { gt: 0 },
              expiresAt: { lte: in90Days },
            },
            include: { product: { select: { name: true, ean: true } } },
            orderBy: { expiresAt: "asc" },
            take: 8,
          }),
          prisma.stockMovement.count({
            where: { companyId, occurredAt: { gte: today } },
          }),
        ]);

      return {
        indicators: {
          activeProducts: products,
          todaySalesCount: todaySales._count,
          todayRevenue: money(todaySales._sum.grossAmount),
          openReorderAlerts: alerts.suggestions.length,
          expiringLots: expiringLots.length,
          todayMovements: movements,
        },
        reorderAlerts: alerts.suggestions.slice(0, 8).map((alert) => ({
          id: alert.productId,
          reason: alert.expiryRiskQuantity > 0
            ? `${money(alert.expiryRiskQuantity)} unidade(s) podem vencer antes de serem vendidas; a sugestão considera somente o saldo aproveitável.`
            : `Cobertura calculada pelo giro, prazo do fornecedor, reservas e mercadoria já a receber.`,
          suggestedQuantity: money(alert.suggestedQuantity),
          estimatedMargin: money(alert.marginPercent) / 100,
          product: {
            name: alert.productName,
            ean: alert.ean,
            stockQuantity: money(alert.effectiveAvailable),
            dailySalesAverage: money(alert.dailySalesAverage),
            salePrice: money(alert.salePrice),
          },
        })),
        expiringLots: expiringLots.map((lot) => ({
          id: lot.id,
          code: lot.code,
          expiresAt: lot.expiresAt,
          quantity: money(lot.quantity),
          product: lot.product,
          expired: lot.expiresAt < new Date(),
        })),
      };
    },
  );

  app.get(
    "/fiscal",
    {
      preHandler: [
        authenticate,
        tenantContext,
        requireTenantRoles(fiscalRoles),
      ],
    },
    async (request) => {
      const companyId = request.tenant!.companyId;
      const [categories, approvedCategories, rules, uncoveredCategories, analysisSummary, recent] =
        await Promise.all([
          prisma.fiscalCategory.count({ where: { companyId, active: true } }),
          prisma.fiscalCategory.count({
            where: { companyId, active: true, status: "APPROVED" },
          }),
          prisma.fiscalRule.count({ where: { category: { companyId } } }),
          prisma.fiscalCategory.count({
            where: { companyId, active: true, rules: { none: {} } },
          }),
          prisma.taxAnalysis.groupBy({
            by: ["status"],
            where: { companyId },
            _count: true,
            _sum: { estimatedSavings: true },
          }),
          prisma.taxAnalysis.findMany({
            where: { companyId },
            include: {
              product: { select: { name: true, ean: true } },
              category: { select: { name: true, ncm: true } },
              requestedBy: { select: { name: true } },
              _count: { select: { evidence: true } },
            },
            orderBy: { createdAt: "desc" },
            take: 8,
          }),
        ]);
      const pendingStatuses = new Set(["PENDING", "PROCESSING", "NEEDS_REVIEW"]);

      return {
        indicators: {
          activeCategories: categories,
          approvedCategories,
          fiscalRules: rules,
          uncoveredCategories,
          pendingAnalyses: analysisSummary
            .filter((item) => pendingStatuses.has(item.status))
            .reduce((total, item) => total + item._count, 0),
          approvedSavings: analysisSummary
            .filter((item) => item.status === "APPROVED")
            .reduce((total, item) => total + money(item._sum.estimatedSavings), 0),
        },
        status: analysisSummary.map((item) => ({
          status: item.status,
          count: item._count,
          estimatedSavings: money(item._sum.estimatedSavings),
        })),
        recentAnalyses: recent.map((analysis) => ({
          id: analysis.id,
          status: analysis.status,
          operationType: analysis.operationType,
          originState: analysis.originState,
          destinationState: analysis.destinationState,
          confidence: money(analysis.confidence),
          estimatedSavings: money(analysis.estimatedSavings),
          createdAt: analysis.createdAt,
          product: analysis.product,
          category: analysis.category,
          requestedBy: analysis.requestedBy,
          evidenceCount: analysis._count.evidence,
        })),
      };
    },
  );

  app.get(
    "/usuarios",
    {
      preHandler: [
        authenticate,
        tenantContext,
        requireTenantRoles(["OWNER", "ADMIN", "MANAGER"]),
      ],
    },
    async (request) => {
      const companyId = request.tenant!.companyId;
      const since = new Date(Date.now() - 30 * 86_400_000);
      const [memberships, activity] = await Promise.all([
        prisma.membership.findMany({
          where: { companyId },
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
                status: true,
                lastLoginAt: true,
              },
            },
          },
          orderBy: { createdAt: "asc" },
        }),
        prisma.auditLog.groupBy({
          by: ["userId"],
          where: { companyId, userId: { not: null }, createdAt: { gte: since } },
          _count: true,
          _max: { createdAt: true },
        }),
      ]);
      const activityByUser = new Map(activity.map((row) => [row.userId, row]));

      return {
        indicators: {
          total: memberships.length,
          active: memberships.filter((membership) => membership.active).length,
          administrators: memberships.filter((membership) =>
            ["OWNER", "ADMIN"].includes(membership.role),
          ).length,
          activeInLast30Days: activity.length,
        },
        users: memberships.map((membership) => {
          const userActivity = activityByUser.get(membership.userId);
          return {
            membershipId: membership.id,
            role: membership.role,
            active: membership.active,
            createdAt: membership.createdAt,
            user: membership.user,
            activityCount: userActivity?._count ?? 0,
            lastActivityAt: userActivity?._max.createdAt ?? null,
          };
        }),
      };
    },
  );
}
