import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../infra/prisma.js";
import { authenticate, requireSystemRoles } from "../security/auth.js";

const money = (value: unknown) => Number(value ?? 0);
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

export async function internalRoutes(app: FastifyInstance) {
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
      const [subscriptions, openInvoices, overdueInvoices, recentInvoices] = await Promise.all([
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
      };
    },
  );

  app.get(
    "/comercial",
    { preHandler: [authenticate, requireSystemRoles(["INTERNAL_ADMIN", "COMMERCIAL"])] },
    async () => {
      const [companies, pipeline] = await Promise.all([
        prisma.company.groupBy({ by: ["status"], _count: true }),
        prisma.company.findMany({
          include: {
            subscriptions: {
              include: { plan: { select: { name: true, monthlyPrice: true } } },
              orderBy: { updatedAt: "desc" },
              take: 1,
            },
            _count: { select: { memberships: true, products: true } },
          },
          orderBy: { updatedAt: "desc" },
          take: 30,
        }),
      ]);
      return {
        indicators: Object.fromEntries(companies.map((item) => [item.status, item._count])),
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
