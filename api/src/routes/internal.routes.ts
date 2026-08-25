import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { config } from "../config.js";
import type { Prisma } from "../generated/prisma/client.js";
import { prisma } from "../infra/prisma.js";
import { authenticate, requireSystemRoles } from "../security/auth.js";
import { runtimeSnapshot } from "../services/observability.js";
import { closeMonthlyInvoice, ensureCustomerBillingStructure, normalizeBillingPeriod } from "../services/monthly-billing.js";
import { securityActions } from "../services/security-events.js";

const money = (value: unknown) => Number(value ?? 0);
const toJson = (value: unknown) => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
const ticketUpdateSchema = z
  .object({
    status: z.enum(["OPEN", "IN_PROGRESS", "WAITING_CUSTOMER", "RESOLVED", "CLOSED"]).optional(),
    prioridade: z.enum(["LOW", "NORMAL", "HIGH", "URGENT"]).optional(),
    responsavel_id: z.string().uuid().nullable().optional(),
  })
  .refine((data) => Object.keys(data).length > 0);
const companyUpdateSchema = z
  .object({
    status: z.enum(["LEAD", "ONBOARDING", "ACTIVE", "SUSPENDED", "CANCELLED"]).optional(),
    etapa_onboarding: z.number().int().min(1).max(10).optional(),
  })
  .refine((data) => Object.keys(data).length > 0);
const incidentUpdateSchema = z.object({
  status: z.enum(["ACKNOWLEDGED", "RESOLVED"]),
});
const savingsSchema = z.object({
  empresa_id: z.string().uuid(),
  periodo: z.coerce.date(),
  economia_tributaria: z.number().min(0).max(100_000_000),
  economia_perdas_estoque: z.number().min(0).max(100_000_000),
  evidencias: z.array(z.record(z.unknown())).min(1).max(100),
});
const invoiceCloseSchema = z.object({ empresa_id: z.string().uuid(), periodo: z.coerce.date(), vencimento: z.coerce.date() });
const subscriptionSetupSchema = z.object({ plano: z.enum(["BASIC", "SMART", "FISCAL_INTELIGENTE", "ULTIMATE"]), inicio_contrato: z.coerce.date(), status: z.enum(["TRIALING", "ACTIVE"]).default("ACTIVE") });
const storeSchema = z.object({ codigo: z.string().trim().min(1).max(40), nome: z.string().trim().min(2).max(120), tipo: z.enum(["MAIN", "BRANCH"]).default("BRANCH") });
const pdvSchema = z.object({ codigo: z.string().trim().min(1).max(40), nome: z.string().trim().min(2).max(120) });
const activationSchema = z.object({ ativo: z.boolean() });
const sessionRevokeSchema = z.object({ motivo: z.string().trim().min(3).max(80).default("ADMIN_REVOKED") });

export async function internalRoutes(app: FastifyInstance) {
  app.get(
    "/seguranca",
    { preHandler: [authenticate, requireSystemRoles(["INTERNAL_ADMIN", "DEVELOPER"])] },
    async () => {
      const now = new Date();
      const last24Hours = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const last7Days = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      const last30Days = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      const [sessions, activeSessions, failedLogins, refreshReuse, revokedSessions, events] = await Promise.all([
        prisma.authSession.findMany({ select: { id: true, userId: true, userAgent: true, ipAddress: true, expiresAt: true, lastSeenAt: true, rotatedAt: true, revokedAt: true, revokedReason: true, createdAt: true, user: { select: { name: true, email: true, systemRole: true } } }, orderBy: { lastSeenAt: "desc" }, take: 80 }),
        prisma.authSession.count({ where: { revokedAt: null, expiresAt: { gt: now } } }),
        prisma.auditLog.count({ where: { action: "AUTH_LOGIN_FAILED", createdAt: { gte: last24Hours } } }),
        prisma.auditLog.count({ where: { action: "AUTH_REFRESH_REUSE_DETECTED", createdAt: { gte: last30Days } } }),
        prisma.authSession.count({ where: { revokedAt: { gte: last7Days } } }),
        prisma.auditLog.findMany({ where: { action: { in: [...securityActions] } }, select: { id: true, action: true, entityId: true, requestId: true, ipAddress: true, metadata: true, createdAt: true, user: { select: { name: true, email: true } }, company: { select: { tradeName: true } } }, orderBy: { createdAt: "desc" }, take: 100 }),
      ]);
      return {
        generatedAt: now,
        indicators: { activeSessions, failedLogins, refreshReuse, revokedSessions },
        sessions: sessions.map((session) => ({ ...session, status: session.revokedAt ? "REVOKED" : session.expiresAt <= now ? "EXPIRED" : "ACTIVE" })),
        events: events.map((event) => ({ ...event, severity: event.action === "AUTH_REFRESH_REUSE_DETECTED" ? "CRITICAL" : ["AUTH_LOGIN_FAILED", "AUTH_REFRESH_FAILED", "AUTH_TENANT_ACCESS_DENIED"].includes(event.action) ? "WARNING" : "INFO" })),
      };
    },
  );

  app.patch<{ Params: { id: string } }>(
    "/seguranca/sessoes/:id",
    { preHandler: [authenticate, requireSystemRoles(["INTERNAL_ADMIN", "DEVELOPER"])] },
    async (request, reply) => {
      const id = z.string().uuid().safeParse(request.params.id);
      const parsed = sessionRevokeSchema.safeParse(request.body);
      if (!id.success || !parsed.success) return reply.status(400).send({ erro: "REVOGACAO_INVALIDA" });
      const session = await prisma.authSession.findUnique({ where: { id: id.data }, select: { id: true, userId: true, revokedAt: true } });
      if (!session) return reply.status(404).send({ erro: "SESSAO_NAO_ENCONTRADA" });
      if (session.revokedAt) return reply.send({ revoked: true, duplicate: true });
      await prisma.$transaction(async (tx) => {
        await tx.authSession.update({ where: { id: session.id }, data: { revokedAt: new Date(), revokedReason: parsed.data.motivo } });
        await tx.auditLog.create({ data: { userId: session.userId, action: "AUTH_SESSION_REVOKED", entity: "AuthSession", entityId: session.id, requestId: request.id, ipAddress: request.ip, metadata: { reason: parsed.data.motivo, revokedBy: request.user.sub } } });
      });
      return reply.send({ revoked: true, duplicate: false });
    },
  );

  app.get(
    "/faturamento",
    { preHandler: [authenticate, requireSystemRoles(["INTERNAL_ADMIN", "FINANCE"])] },
    async () => {
      const currentPeriod = normalizeBillingPeriod(new Date());
      const [plans, subscriptions, recentInvoices, savingsPending] = await Promise.all([
        prisma.plan.findMany({ where: { active: true }, orderBy: { position: "asc" } }),
        prisma.subscription.findMany({
          where: { status: { in: ["ACTIVE", "TRIALING", "PAST_DUE"] } },
          include: {
            company: { include: { stores: { include: { pointsOfSale: true } } } },
            plan: true,
            onboarding: { include: { installments: { orderBy: { number: "asc" } } } },
          },
          orderBy: { updatedAt: "desc" },
        }),
        prisma.invoice.findMany({
          include: { items: { orderBy: { createdAt: "asc" } }, chargeRequests: { orderBy: { createdAt: "desc" }, take: 1 }, subscription: { include: { company: { select: { tradeName: true } }, plan: { select: { name: true } } } } },
          orderBy: { createdAt: "desc" },
          take: 40,
        }),
        prisma.monthlySavingsLedger.count({ where: { period: currentPeriod, status: "DRAFT" } }),
      ]);
      return {
        currentPeriod,
        plans: plans.map((plan) => ({ ...plan, monthlyPrice: money(plan.monthlyPrice), setupPrice: money(plan.setupPrice), successFeeRate: money(plan.successFeeRate), additionalStorePrice: money(plan.additionalStorePrice), extraPdvPrice: money(plan.extraPdvPrice) })),
        indicators: {
          subscriptions: subscriptions.length,
          stores: subscriptions.reduce((sum, item) => sum + item.company.stores.filter((store) => store.active).length, 0),
          pdvs: subscriptions.reduce((sum, item) => sum + item.company.stores.reduce((total, store) => total + store.pointsOfSale.filter((pdv) => pdv.active).length, 0), 0),
          savingsPending,
          draftInvoices: recentInvoices.filter((invoice) => invoice.requiresReview).length,
        },
        subscriptions: subscriptions.map((subscription) => ({
          ...subscription,
          plan: { ...subscription.plan, monthlyPrice: money(subscription.plan.monthlyPrice), setupPrice: money(subscription.plan.setupPrice), successFeeRate: money(subscription.plan.successFeeRate) },
          onboarding: subscription.onboarding ? {
            ...subscription.onboarding,
            setupTotal: money(subscription.onboarding.setupTotal),
            entryAmount: money(subscription.onboarding.entryAmount),
            installmentAmount: money(subscription.onboarding.installmentAmount),
            installments: subscription.onboarding.installments.map((installment) => ({ ...installment, amount: money(installment.amount) })),
          } : null,
          stores: subscription.company.stores.map((store) => ({ ...store, pdvs: store.pointsOfSale })),
        })),
        invoices: recentInvoices.map((invoice) => ({ ...invoice, amount: money(invoice.amount), items: invoice.items.map((item) => ({ ...item, quantity: money(item.quantity), unitAmount: money(item.unitAmount), totalAmount: money(item.totalAmount) })) })),
      };
    },
  );

  app.post(
    "/faturamento/economias",
    { preHandler: [authenticate, requireSystemRoles(["INTERNAL_ADMIN", "FINANCE"])] },
    async (request, reply) => {
      const parsed = savingsSchema.safeParse(request.body);
      if (!parsed.success) return reply.status(400).send({ erro: "ECONOMIA_INVALIDA", detalhes: parsed.error.flatten() });
      const period = normalizeBillingPeriod(parsed.data.periodo);
      const existing = await prisma.monthlySavingsLedger.findUnique({ where: { companyId_period: { companyId: parsed.data.empresa_id, period } } });
      if (existing?.status === "LOCKED") return reply.status(409).send({ erro: "ECONOMIA_JA_FATURADA" });
      const company = await prisma.company.findUnique({ where: { id: parsed.data.empresa_id }, select: { id: true } });
      if (!company) return reply.status(404).send({ erro: "EMPRESA_NAO_ENCONTRADA" });
      const ledger = await prisma.$transaction(async (tx) => {
        const saved = await tx.monthlySavingsLedger.upsert({
          where: { companyId_period: { companyId: company.id, period } },
          create: { companyId: company.id, period, taxSavings: parsed.data.economia_tributaria, inventoryLossSavings: parsed.data.economia_perdas_estoque, evidence: toJson(parsed.data.evidencias), status: "VERIFIED", verifiedById: request.user.sub, verifiedAt: new Date() },
          update: { taxSavings: parsed.data.economia_tributaria, inventoryLossSavings: parsed.data.economia_perdas_estoque, evidence: toJson(parsed.data.evidencias), status: "VERIFIED", verifiedById: request.user.sub, verifiedAt: new Date() },
        });
        await tx.auditLog.create({ data: { companyId: company.id, userId: request.user.sub, action: "MONTHLY_SAVINGS_VERIFIED", entity: "MonthlySavingsLedger", entityId: saved.id, requestId: request.id, ipAddress: request.ip, before: existing ? { taxSavings: money(existing.taxSavings), inventoryLossSavings: money(existing.inventoryLossSavings), status: existing.status } : undefined, after: { taxSavings: parsed.data.economia_tributaria, inventoryLossSavings: parsed.data.economia_perdas_estoque, evidenceCount: parsed.data.evidencias.length, status: "VERIFIED" } } });
        return saved;
      });
      return reply.send(ledger);
    },
  );

  app.post(
    "/faturamento/fechar",
    { preHandler: [authenticate, requireSystemRoles(["INTERNAL_ADMIN", "FINANCE"])] },
    async (request, reply) => {
      const parsed = invoiceCloseSchema.safeParse(request.body);
      if (!parsed.success) return reply.status(400).send({ erro: "FECHAMENTO_INVALIDO" });
      try {
        const result = await closeMonthlyInvoice({ companyId: parsed.data.empresa_id, period: parsed.data.periodo, dueAt: parsed.data.vencimento, requestedById: request.user.sub });
        return reply.send(result);
      } catch (error) {
        const message = error instanceof Error ? error.message : "FECHAMENTO_FALHOU";
        if (["ASSINATURA_ATIVA_NAO_ENCONTRADA", "ASSINATURA_NAO_ENCONTRADA"].includes(message)) return reply.status(409).send({ erro: message });
        throw error;
      }
    },
  );

  app.put<{ Params: { id: string } }>(
    "/comercial/empresas/:id/assinatura",
    { preHandler: [authenticate, requireSystemRoles(["INTERNAL_ADMIN", "COMMERCIAL"])] },
    async (request, reply) => {
      const companyId = z.string().uuid().safeParse(request.params.id);
      const parsed = subscriptionSetupSchema.safeParse(request.body);
      if (!companyId.success || !parsed.success) return reply.status(400).send({ erro: "ASSINATURA_INVALIDA" });
      const plan = await prisma.plan.findUnique({ where: { code: parsed.data.plano } });
      const company = await prisma.company.findUnique({ where: { id: companyId.data } });
      if (!plan?.active || !company) return reply.status(404).send({ erro: "EMPRESA_OU_PLANO_NAO_ENCONTRADO" });
      const current = await prisma.subscription.findFirst({ where: { companyId: company.id, status: { not: "CANCELLED" } }, include: { onboarding: { select: { id: true } }, _count: { select: { invoices: true } } } });
      if (current && current.planId !== plan.id && current._count.invoices > 0) return reply.status(409).send({ erro: "PLANO_COM_FATURAS_NAO_PODE_SER_SUBSTITUIDO" });
      if (current?.onboarding && (current.planId !== plan.id || current.contractStartedAt.getTime() !== parsed.data.inicio_contrato.getTime())) return reply.status(409).send({ erro: "ONBOARDING_INICIADO_NAO_PODE_SER_RECALCULADO" });
      const subscription = current
        ? await prisma.subscription.update({ where: { id: current.id }, data: { planId: plan.id, status: parsed.data.status, contractStartedAt: parsed.data.inicio_contrato } })
        : await prisma.subscription.create({ data: { companyId: company.id, planId: plan.id, status: parsed.data.status, contractStartedAt: parsed.data.inicio_contrato } });
      await ensureCustomerBillingStructure(subscription.id);
      await prisma.auditLog.create({ data: { companyId: company.id, userId: request.user.sub, action: "SUBSCRIPTION_CONFIGURED", entity: "Subscription", entityId: subscription.id, requestId: request.id, ipAddress: request.ip, after: { plan: plan.code, status: subscription.status, contractStartedAt: subscription.contractStartedAt } } });
      return reply.send(subscription);
    },
  );

  app.post<{ Params: { id: string } }>(
    "/comercial/empresas/:id/lojas",
    { preHandler: [authenticate, requireSystemRoles(["INTERNAL_ADMIN", "COMMERCIAL"])] },
    async (request, reply) => {
      const companyId = z.string().uuid().safeParse(request.params.id);
      const parsed = storeSchema.safeParse(request.body);
      if (!companyId.success || !parsed.success) return reply.status(400).send({ erro: "LOJA_INVALIDA" });
      const company = await prisma.company.findUnique({ where: { id: companyId.data }, select: { id: true } });
      if (!company) return reply.status(404).send({ erro: "EMPRESA_NAO_ENCONTRADA" });
      const store = await prisma.$transaction(async (tx) => {
        const saved = await tx.store.create({ data: { companyId: company.id, code: parsed.data.codigo, name: parsed.data.nome, type: parsed.data.tipo } });
        await tx.auditLog.create({ data: { companyId: company.id, userId: request.user.sub, action: "STORE_ACTIVATED", entity: "Store", entityId: saved.id, requestId: request.id, ipAddress: request.ip, after: { code: saved.code, name: saved.name, type: saved.type } } });
        return saved;
      });
      return reply.status(201).send(store);
    },
  );

  app.post<{ Params: { id: string } }>(
    "/comercial/lojas/:id/pdvs",
    { preHandler: [authenticate, requireSystemRoles(["INTERNAL_ADMIN", "COMMERCIAL"])] },
    async (request, reply) => {
      const storeId = z.string().uuid().safeParse(request.params.id);
      const parsed = pdvSchema.safeParse(request.body);
      if (!storeId.success || !parsed.success) return reply.status(400).send({ erro: "PDV_INVALIDO" });
      const store = await prisma.store.findUnique({ where: { id: storeId.data }, select: { id: true, companyId: true } });
      if (!store) return reply.status(404).send({ erro: "LOJA_NAO_ENCONTRADA" });
      const pdv = await prisma.$transaction(async (tx) => {
        const saved = await tx.pointOfSale.create({ data: { storeId: store.id, code: parsed.data.codigo, name: parsed.data.nome } });
        await tx.auditLog.create({ data: { companyId: store.companyId, userId: request.user.sub, action: "POINT_OF_SALE_ACTIVATED", entity: "PointOfSale", entityId: saved.id, requestId: request.id, ipAddress: request.ip, after: { storeId: store.id, code: saved.code, name: saved.name } } });
        return saved;
      });
      return reply.status(201).send(pdv);
    },
  );

  app.patch<{ Params: { type: string; id: string } }>(
    "/comercial/ativacao/:type/:id",
    { preHandler: [authenticate, requireSystemRoles(["INTERNAL_ADMIN", "COMMERCIAL"])] },
    async (request, reply) => {
      const parsed = activationSchema.safeParse(request.body);
      const id = z.string().uuid().safeParse(request.params.id);
      if (!parsed.success || !id.success || !["loja", "pdv"].includes(request.params.type)) return reply.status(400).send({ erro: "ATIVACAO_INVALIDA" });
      if (parsed.data.ativo) return reply.status(409).send({ erro: "REATIVACAO_REQUER_NOVO_REGISTRO" });
      const target = request.params.type === "loja"
        ? await prisma.store.findUnique({ where: { id: id.data }, select: { id: true, companyId: true } })
        : await prisma.pointOfSale.findUnique({ where: { id: id.data }, select: { id: true, store: { select: { companyId: true } } } });
      if (!target) return reply.status(404).send({ erro: "RECURSO_NAO_ENCONTRADO" });
      const companyId = "companyId" in target ? target.companyId : target.store.companyId;
      const updated = await prisma.$transaction(async (tx) => {
        const saved = request.params.type === "loja"
          ? await tx.store.update({ where: { id: id.data }, data: { active: false, deactivatedAt: new Date() } })
          : await tx.pointOfSale.update({ where: { id: id.data }, data: { active: false, deactivatedAt: new Date() } });
        await tx.auditLog.create({ data: { companyId, userId: request.user.sub, action: request.params.type === "loja" ? "STORE_DEACTIVATED" : "POINT_OF_SALE_DEACTIVATED", entity: request.params.type === "loja" ? "Store" : "PointOfSale", entityId: id.data, requestId: request.id, ipAddress: request.ip } });
        return saved;
      });
      return reply.send(updated);
    },
  );

  app.get(
    "/monitoramento",
    { preHandler: [authenticate, requireSystemRoles(["INTERNAL_ADMIN", "DEVELOPER"])] },
    async () => {
      const now = new Date();
      const last24Hours = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const databaseStarted = performance.now();
      await prisma.$queryRaw`SELECT 1`;
      const databaseLatencyMs = Math.round(performance.now() - databaseStarted);
      const [incidents, openIncidents, criticalIncidents, failedEmails, failedBillingEvents, activeSessions, lastAutomation, failedAutomations] = await Promise.all([
        prisma.operationalIncident.findMany({
          include: { resolvedBy: { select: { name: true } } },
          orderBy: [{ status: "asc" }, { severity: "desc" }, { lastSeenAt: "desc" }],
          take: 40,
        }),
        prisma.operationalIncident.count({ where: { status: { not: "RESOLVED" } } }),
        prisma.operationalIncident.count({ where: { status: { not: "RESOLVED" }, severity: "CRITICAL" } }),
        prisma.emailDelivery.count({ where: { status: "FAILED", createdAt: { gte: last24Hours } } }),
        prisma.billingWebhookEvent.count({ where: { status: "FAILED", receivedAt: { gte: last24Hours } } }),
        prisma.authSession.count({ where: { revokedAt: null, expiresAt: { gt: now } } }),
        prisma.backgroundJobRun.findFirst({ where: { jobName: "DAILY_BUSINESS_AUTOMATION" }, orderBy: { startedAt: "desc" } }),
        prisma.backgroundJobRun.count({ where: { status: "FAILED", startedAt: { gte: last24Hours } } }),
      ]);
      return {
        generatedAt: now,
        runtime: runtimeSnapshot(),
        indicators: { databaseLatencyMs, openIncidents, criticalIncidents, failedEmails, failedBillingEvents, activeSessions, failedAutomations },
        services: [
          { name: "API", status: "UP", detail: `versão ${config.SERVICE_VERSION}` },
          { name: "PostgreSQL", status: "UP", detail: `${databaseLatencyMs} ms` },
          { name: "E-mail transacional", status: config.EMAIL_RELAY_URL ? "CONFIGURED" : "PENDING", detail: config.EMAIL_RELAY_URL ? "relay conectado" : "aguardando credencial" },
          { name: "Cobrança", status: config.BILLING_WEBHOOK_SECRET ? "CONFIGURED" : "PENDING", detail: config.BILLING_WEBHOOK_SECRET ? "assinatura ativa" : "aguardando segredo" },
          { name: "Automação diária", status: lastAutomation?.status === "COMPLETED" ? "UP" : lastAutomation?.status === "FAILED" ? "ERROR" : "PENDING", detail: lastAutomation?.finishedAt ? `última execução ${lastAutomation.finishedAt.toISOString()}` : "aguardando primeira execução" },
        ],
        incidents,
      };
    },
  );

  app.patch<{ Params: { id: string } }>(
    "/monitoramento/incidentes/:id",
    { preHandler: [authenticate, requireSystemRoles(["INTERNAL_ADMIN", "DEVELOPER"])] },
    async (request, reply) => {
      const id = z.string().uuid().safeParse(request.params.id);
      const parsed = incidentUpdateSchema.safeParse(request.body);
      if (!id.success || !parsed.success) return reply.status(400).send({ erro: "INCIDENTE_INVALIDO" });
      const incident = await prisma.operationalIncident.findUnique({ where: { id: id.data } });
      if (!incident) return reply.status(404).send({ erro: "INCIDENTE_NAO_ENCONTRADO" });
      const updated = await prisma.$transaction(async (tx) => {
        const result = await tx.operationalIncident.update({
          where: { id: incident.id },
          data: {
            status: parsed.data.status,
            ...(parsed.data.status === "RESOLVED" ? { resolvedAt: new Date(), resolvedById: request.user.sub } : { resolvedAt: null, resolvedById: null }),
          },
        });
        await tx.auditLog.create({
          data: {
            userId: request.user.sub,
            action: "OPERATIONAL_INCIDENT_UPDATED",
            entity: "OperationalIncident",
            entityId: incident.id,
            requestId: request.id,
            ipAddress: request.ip,
            before: { status: incident.status },
            after: { status: result.status },
          },
        });
        return result;
      });
      return reply.send(updated);
    },
  );

  app.get(
    "/suporte",
    { preHandler: [authenticate, requireSystemRoles(["INTERNAL_ADMIN", "HELPDESK"])] },
    async () => {
      const now = new Date();
      const [open, urgent, overdue, resolvedToday, tickets, agents] = await Promise.all([
        prisma.supportTicket.count({ where: { status: { in: ["OPEN", "IN_PROGRESS", "WAITING_CUSTOMER"] } } }),
        prisma.supportTicket.count({ where: { priority: "URGENT", status: { in: ["OPEN", "IN_PROGRESS"] } } }),
        prisma.supportTicket.count({ where: { slaDueAt: { lt: now }, status: { in: ["OPEN", "IN_PROGRESS", "WAITING_CUSTOMER"] } } }),
        prisma.supportTicket.count({ where: { resolvedAt: { gte: new Date(now.getFullYear(), now.getMonth(), now.getDate()) } } }),
        prisma.supportTicket.findMany({
          include: {
            company: { select: { id: true, tradeName: true } },
            createdBy: { select: { name: true, email: true } },
            assignedTo: { select: { id: true, name: true } },
            _count: { select: { messages: true } },
          },
          orderBy: [{ priority: "desc" }, { updatedAt: "desc" }],
          take: 30,
        }),
        prisma.user.findMany({
          where: { systemRole: { in: ["INTERNAL_ADMIN", "HELPDESK"] }, status: "ACTIVE" },
          select: { id: true, name: true, email: true },
          orderBy: { name: "asc" },
        }),
      ]);
      return { indicators: { open, urgent, overdue, resolvedToday }, tickets, agents };
    },
  );

  app.patch<{ Params: { id: string } }>(
    "/suporte/tickets/:id",
    { preHandler: [authenticate, requireSystemRoles(["INTERNAL_ADMIN", "HELPDESK"])] },
    async (request, reply) => {
      const id = z.string().uuid().safeParse(request.params.id);
      const parsed = ticketUpdateSchema.safeParse(request.body);
      if (!id.success || !parsed.success) return reply.status(400).send({ erro: "ALTERACAO_INVALIDA" });
      const ticket = await prisma.supportTicket.findUnique({ where: { id: id.data } });
      if (!ticket) return reply.status(404).send({ erro: "TICKET_NAO_ENCONTRADO" });
      if (parsed.data.responsavel_id) {
        const agent = await prisma.user.findFirst({
          where: { id: parsed.data.responsavel_id, systemRole: { in: ["INTERNAL_ADMIN", "HELPDESK"] }, status: "ACTIVE" },
        });
        if (!agent) return reply.status(400).send({ erro: "RESPONSAVEL_INVALIDO" });
      }
      const resolved = parsed.data.status === "RESOLVED" || parsed.data.status === "CLOSED";
      const updated = await prisma.$transaction(async (tx) => {
        const result = await tx.supportTicket.update({
          where: { id: ticket.id },
          data: {
            ...(parsed.data.status && { status: parsed.data.status }),
            ...(parsed.data.prioridade && { priority: parsed.data.prioridade }),
            ...(parsed.data.responsavel_id !== undefined && { assignedToId: parsed.data.responsavel_id }),
            ...(resolved && !ticket.resolvedAt && { resolvedAt: new Date() }),
            ...(parsed.data.status && !resolved && { resolvedAt: null }),
          },
        });
        await tx.auditLog.create({
          data: {
            companyId: ticket.companyId,
            userId: request.user.sub,
            action: "SUPPORT_TICKET_UPDATED",
            entity: "SupportTicket",
            entityId: ticket.id,
            requestId: request.id,
            ipAddress: request.ip,
            before: { status: ticket.status, priority: ticket.priority, assignedToId: ticket.assignedToId },
            after: { status: result.status, priority: result.priority, assignedToId: result.assignedToId },
          },
        });
        return result;
      });
      return reply.send(updated);
    },
  );

  app.get(
    "/financeiro",
    { preHandler: [authenticate, requireSystemRoles(["INTERNAL_ADMIN", "FINANCE"])] },
    async () => {
      const now = new Date();
      const [subscriptions, openInvoices, overdueInvoices, recentInvoices, emailStatuses, failedBillingEvents, recentDeliveries, recentBillingEvents] = await Promise.all([
        prisma.subscription.groupBy({ by: ["status"], _count: true }),
        prisma.invoice.aggregate({ where: { status: "OPEN" }, _count: true, _sum: { amount: true } }),
        prisma.invoice.aggregate({ where: { status: "OPEN", dueAt: { lt: now } }, _count: true, _sum: { amount: true } }),
        prisma.invoice.findMany({
          include: {
            subscription: { include: { company: { select: { tradeName: true } }, plan: { select: { name: true } } } },
          },
          orderBy: { dueAt: "asc" },
          take: 30,
        }),
        prisma.emailDelivery.groupBy({ by: ["status"], _count: true }),
        prisma.billingWebhookEvent.count({ where: { status: "FAILED" } }),
        prisma.emailDelivery.findMany({
          select: { id: true, recipient: true, template: true, provider: true, status: true, attempts: true, lastError: true, createdAt: true, sentAt: true },
          orderBy: { createdAt: "desc" },
          take: 10,
        }),
        prisma.billingWebhookEvent.findMany({
          select: { id: true, provider: true, eventType: true, status: true, externalEventId: true, lastError: true, receivedAt: true, processedAt: true },
          orderBy: { receivedAt: "desc" },
          take: 10,
        }),
      ]);
      const recurringRevenue = await prisma.subscription.findMany({
        where: { status: "ACTIVE" },
        include: { plan: { select: { monthlyPrice: true } } },
      });
      return {
        indicators: {
          activeSubscriptions: subscriptions.filter((item) => item.status === "ACTIVE").reduce((sum, item) => sum + item._count, 0),
          trials: subscriptions.filter((item) => item.status === "TRIALING").reduce((sum, item) => sum + item._count, 0),
          monthlyRecurringRevenue: recurringRevenue.reduce((sum, item) => sum + money(item.plan.monthlyPrice), 0),
          openAmount: money(openInvoices._sum.amount),
          openInvoices: openInvoices._count,
          overdueAmount: money(overdueInvoices._sum.amount),
          overdueInvoices: overdueInvoices._count,
        },
        subscriptions: subscriptions.map((item) => ({ status: item.status, count: item._count })),
        invoices: recentInvoices.map((invoice) => ({ ...invoice, amount: money(invoice.amount) })),
        automation: {
          email: Object.fromEntries(emailStatuses.map((item) => [item.status, item._count])),
          failedBillingEvents,
          recentDeliveries,
          recentBillingEvents,
        },
      };
    },
  );

  app.get(
    "/comercial",
    { preHandler: [authenticate, requireSystemRoles(["INTERNAL_ADMIN", "COMMERCIAL"])] },
    async () => {
      const [companies, pipeline, plans] = await Promise.all([
        prisma.company.groupBy({ by: ["status"], _count: true }),
        prisma.company.findMany({
          include: {
            subscriptions: {
              include: { plan: { select: { code: true, name: true, monthlyPrice: true } } },
              orderBy: { updatedAt: "desc" },
              take: 1,
            },
            _count: { select: { memberships: true, products: true } },
          },
          orderBy: { updatedAt: "desc" },
          take: 30,
        }),
        prisma.plan.findMany({ where: { active: true }, select: { code: true, name: true, monthlyPrice: true, setupPrice: true, hasFineTuning: true }, orderBy: { position: "asc" } }),
      ]);
      return {
        indicators: Object.fromEntries(companies.map((item) => [item.status, item._count])),
        plans: plans.map((plan) => ({ ...plan, monthlyPrice: money(plan.monthlyPrice), setupPrice: money(plan.setupPrice) })),
        pipeline: pipeline.map((company) => ({
          id: company.id,
          tradeName: company.tradeName,
          legalName: company.legalName,
          status: company.status,
          onboardingStep: company.onboardingStep,
          city: company.city,
          state: company.state,
          updatedAt: company.updatedAt,
          members: company._count.memberships,
          products: company._count.products,
          subscription: company.subscriptions[0]
            ? { ...company.subscriptions[0], plan: { ...company.subscriptions[0].plan, monthlyPrice: money(company.subscriptions[0].plan.monthlyPrice) } }
            : null,
        })),
      };
    },
  );

  app.patch<{ Params: { id: string } }>(
    "/comercial/empresas/:id",
    { preHandler: [authenticate, requireSystemRoles(["INTERNAL_ADMIN", "COMMERCIAL"])] },
    async (request, reply) => {
      const id = z.string().uuid().safeParse(request.params.id);
      const parsed = companyUpdateSchema.safeParse(request.body);
      if (!id.success || !parsed.success) return reply.status(400).send({ erro: "ALTERACAO_INVALIDA" });
      const company = await prisma.company.findUnique({ where: { id: id.data } });
      if (!company) return reply.status(404).send({ erro: "EMPRESA_NAO_ENCONTRADA" });
      const updated = await prisma.$transaction(async (tx) => {
        const result = await tx.company.update({
          where: { id: company.id },
          data: {
            ...(parsed.data.status && { status: parsed.data.status }),
            ...(parsed.data.etapa_onboarding && { onboardingStep: parsed.data.etapa_onboarding }),
          },
        });
        await tx.auditLog.create({
          data: {
            companyId: company.id,
            userId: request.user.sub,
            action: "COMPANY_PIPELINE_UPDATED",
            entity: "Company",
            entityId: company.id,
            requestId: request.id,
            ipAddress: request.ip,
            before: { status: company.status, onboardingStep: company.onboardingStep },
            after: { status: result.status, onboardingStep: result.onboardingStep },
          },
        });
        return result;
      });
      return reply.send(updated);
    },
  );

  app.get(
    "/desenvolvimento",
    { preHandler: [authenticate, requireSystemRoles(["INTERNAL_ADMIN", "DEVELOPER"])] },
    async () => {
      const [releases, published, pendingApprovals, activeCompanies] = await Promise.all([
        prisma.release.findMany({
          include: {
            createdBy: { select: { name: true } },
            approvals: { include: { approver: { select: { name: true } } } },
            _count: { select: { customerAccess: true } },
          },
          orderBy: { createdAt: "desc" },
          take: 20,
        }),
        prisma.release.count({ where: { status: "PUBLISHED" } }),
        prisma.releaseApproval.count({ where: { decision: "PENDING" } }),
        prisma.company.count({ where: { status: "ACTIVE" } }),
      ]);
      return {
        indicators: {
          totalReleases: releases.length,
          published,
          pendingApprovals,
          activeCompanies,
        },
        releases,
      };
    },
  );
}
