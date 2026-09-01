import type { FastifyInstance } from "fastify";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { Prisma } from "../generated/prisma/client.js";
import { prisma } from "../infra/prisma.js";
import {
  authenticate,
  requireSystemRoles,
  requireTenantRoles,
  tenantContext,
} from "../security/auth.js";

const toJson = (value: unknown) =>
  JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;

const ticketSchema = z.object({
  area: z
    .enum(["SUPPORT", "FISCAL", "FINANCE", "COMMERCIAL", "TECHNICAL"])
    .default("SUPPORT"),
  prioridade: z.enum(["LOW", "NORMAL", "HIGH", "URGENT"]).default("NORMAL"),
  assunto: z.string().min(4).max(180),
  descricao: z.string().min(10).max(10000),
});

const messageSchema = z.object({
  mensagem: z.string().min(1).max(10000),
  somente_interno: z.boolean().default(false),
  anexos: z.array(z.record(z.unknown())).default([]),
});

const releaseSchema = z.object({
  versao: z.string().min(1).max(40),
  titulo: z.string().min(3).max(160),
  notas: z.string().min(3).max(30000),
  ambiente: z.string().min(2).max(40).default("production"),
});

const approvalSchema = z.object({
  area: z.enum(["PRODUCT", "TECHNICAL", "SUPPORT", "FINANCE", "COMPLIANCE"]),
  decisao: z.enum(["APPROVED", "REJECTED"]),
  observacoes: z.string().max(10000).nullable().default(null),
});
const alertUpdateSchema = z.object({ status: z.enum(["ACKNOWLEDGED", "RESOLVED", "DISMISSED"]) });

export async function operationsRoutes(app: FastifyInstance) {
  app.patch<{ Params: { id: string } }>(
    "/alertas/:id",
    { preHandler: [authenticate, tenantContext, requireTenantRoles(["OWNER", "ADMIN", "MANAGER", "BUYER", "FINANCE", "PHARMACIST"])] },
    async (request, reply) => {
      const id = z.string().uuid().safeParse(request.params.id);
      const parsed = alertUpdateSchema.safeParse(request.body);
      if (!id.success || !parsed.success) return reply.status(400).send({ erro: "ALERTA_INVALIDO" });
      if (request.user.systemRole === "CUSTOMER" && request.tenant!.role === "BUYER" && parsed.data.status !== "ACKNOWLEDGED") {
        return reply.status(403).send({ erro: "ACAO_DE_ALERTA_NAO_PERMITIDA" });
      }
      const alert = await prisma.businessAlert.findFirst({ where: { id: id.data, companyId: request.tenant!.companyId } });
      if (!alert) return reply.status(404).send({ erro: "ALERTA_NAO_ENCONTRADO" });
      const updated = await prisma.$transaction(async (tx) => {
        const result = await tx.businessAlert.update({
          where: { id: alert.id },
          data: {
            status: parsed.data.status,
            ...(parsed.data.status === "ACKNOWLEDGED"
              ? { acknowledgedAt: new Date(), acknowledgedById: request.user.sub, resolvedAt: null }
              : { resolvedAt: new Date(), acknowledgedAt: alert.acknowledgedAt ?? new Date(), acknowledgedById: alert.acknowledgedById ?? request.user.sub }),
          },
        });
        await tx.auditLog.create({
          data: {
            companyId: alert.companyId,
            userId: request.user.sub,
            action: "BUSINESS_ALERT_UPDATED",
            entity: "BusinessAlert",
            entityId: alert.id,
            requestId: request.id,
            ipAddress: request.ip,
            before: { status: alert.status },
            after: { status: result.status, type: result.type },
          },
        });
        return result;
      });
      return reply.send(updated);
    },
  );

  app.get("/planos", async () =>
    prisma.plan.findMany({
      where: { active: true },
      orderBy: { position: "asc" },
    }),
  );

  app.get(
    "/suporte/tickets",
    { preHandler: [authenticate, tenantContext] },
    async (request) =>
      prisma.supportTicket.findMany({
        where: { companyId: request.tenant!.companyId },
        include: {
          createdBy: { select: { id: true, name: true, email: true } },
          assignedTo: { select: { id: true, name: true, systemRole: true } },
          _count: { select: { messages: true } },
        },
        orderBy: { updatedAt: "desc" },
      }),
  );

  app.post(
    "/suporte/tickets",
    { preHandler: [authenticate, tenantContext] },
    async (request, reply) => {
      const parsed = ticketSchema.safeParse(request.body);
      if (!parsed.success)
        return reply
          .status(400)
          .send({ erro: "TICKET_INVALIDO", detalhes: parsed.error.flatten() });
      const ticket = await prisma.supportTicket.create({
        data: {
          code: `NX-${Date.now().toString(36).toUpperCase()}-${randomUUID().slice(0, 4).toUpperCase()}`,
          companyId: request.tenant!.companyId,
          createdById: request.user.sub,
          area: parsed.data.area,
          priority: parsed.data.prioridade,
          subject: parsed.data.assunto,
          description: parsed.data.descricao,
        },
      });
      return reply.status(201).send(ticket);
    },
  );

  app.post<{ Params: { id: string } }>(
    "/suporte/tickets/:id/mensagens",
    { preHandler: [authenticate, tenantContext] },
    async (request, reply) => {
      const ticketId = z.string().uuid().safeParse(request.params.id);
      const parsed = messageSchema.safeParse(request.body);
      if (!ticketId.success || !parsed.success)
        return reply.status(400).send({ erro: "MENSAGEM_INVALIDA" });
      const ticket = await prisma.supportTicket.findFirst({
        where: { id: ticketId.data, companyId: request.tenant!.companyId },
      });
      if (!ticket)
        return reply.status(404).send({ erro: "TICKET_NAO_ENCONTRADO" });
      if (
        parsed.data.somente_interno &&
        request.user.systemRole === "CUSTOMER"
      ) {
        return reply.status(403).send({ erro: "NOTA_INTERNA_NAO_PERMITIDA" });
      }
      const message = await prisma.$transaction(async (tx) => {
        const created = await tx.ticketMessage.create({
          data: {
            ticketId: ticket.id,
            authorId: request.user.sub,
            body: parsed.data.mensagem,
            internalOnly: parsed.data.somente_interno,
            attachments: toJson(parsed.data.anexos),
          },
        });
        await tx.supportTicket.update({
          where: { id: ticket.id },
          data: {
            status:
              request.user.systemRole === "CUSTOMER" ? "OPEN" : "IN_PROGRESS",
          },
        });
        return created;
      });
      return reply.status(201).send(message);
    },
  );

  app.get(
    "/financeiro/assinaturas",
    {
      preHandler: [
        authenticate,
        requireSystemRoles(["INTERNAL_ADMIN", "FINANCE", "COMMERCIAL"]),
      ],
    },
    async () =>
      prisma.subscription.findMany({
        include: {
          company: { select: { id: true, tradeName: true, status: true } },
          plan: true,
          invoices: { orderBy: { dueAt: "desc" }, take: 3 },
        },
        orderBy: { updatedAt: "desc" },
      }),
  );

  app.get(
    "/desenvolvimento/releases",
    {
      preHandler: [
        authenticate,
        requireSystemRoles([
          "INTERNAL_ADMIN",
          "DEVELOPER",
          "HELPDESK",
          "FINANCE",
        ]),
      ],
    },
    async () =>
      prisma.release.findMany({
        include: {
          approvals: {
            include: {
              approver: { select: { id: true, name: true, systemRole: true } },
            },
          },
          _count: { select: { customerAccess: true } },
        },
        orderBy: { createdAt: "desc" },
      }),
  );

  app.post(
    "/desenvolvimento/releases",
    {
      preHandler: [
        authenticate,
        requireSystemRoles(["INTERNAL_ADMIN", "DEVELOPER"]),
      ],
    },
    async (request, reply) => {
      const parsed = releaseSchema.safeParse(request.body);
      if (!parsed.success)
        return reply
          .status(400)
          .send({ erro: "RELEASE_INVALIDA", detalhes: parsed.error.flatten() });
      const release = await prisma.release.create({
        data: {
          version: parsed.data.versao,
          title: parsed.data.titulo,
          notes: parsed.data.notas,
          environment: parsed.data.ambiente,
          createdById: request.user.sub,
        },
      });
      return reply.status(201).send(release);
    },
  );

  app.post<{ Params: { id: string } }>(
    "/desenvolvimento/releases/:id/aprovacoes",
    {
      preHandler: [
        authenticate,
        requireSystemRoles([
          "INTERNAL_ADMIN",
          "DEVELOPER",
          "HELPDESK",
          "FINANCE",
        ]),
      ],
    },
    async (request, reply) => {
      const releaseId = z.string().uuid().safeParse(request.params.id);
      const parsed = approvalSchema.safeParse(request.body);
      if (!releaseId.success || !parsed.success)
        return reply.status(400).send({ erro: "APROVACAO_INVALIDA" });
      const approval = await prisma.releaseApproval.upsert({
        where: {
          releaseId_area: { releaseId: releaseId.data, area: parsed.data.area },
        },
        create: {
          releaseId: releaseId.data,
          approverId: request.user.sub,
          area: parsed.data.area,
          decision: parsed.data.decisao,
          notes: parsed.data.observacoes,
          decidedAt: new Date(),
        },
        update: {
          approverId: request.user.sub,
          decision: parsed.data.decisao,
          notes: parsed.data.observacoes,
          decidedAt: new Date(),
        },
      });
      return reply.send(approval);
    },
  );

  app.post<{ Params: { companyId: string; releaseId: string } }>(
    "/desenvolvimento/empresas/:companyId/releases/:releaseId/liberar",
    {
      preHandler: [
        authenticate,
        requireSystemRoles(["INTERNAL_ADMIN", "DEVELOPER"]),
      ],
    },
    async (request, reply) => {
      const ids = z
        .object({ companyId: z.string().uuid(), releaseId: z.string().uuid() })
        .safeParse(request.params);
      if (!ids.success)
        return reply.status(400).send({ erro: "IDENTIFICADORES_INVALIDOS" });
      const approved = await prisma.release.findFirst({
        where: {
          id: ids.data.releaseId,
          status: { in: ["APPROVED", "PUBLISHED"] },
        },
      });
      if (!approved)
        return reply.status(409).send({ erro: "RELEASE_NAO_APROVADA" });
      const access = await prisma.customerRelease.upsert({
        where: { companyId_releaseId: ids.data },
        create: { ...ids.data, enabledById: request.user.sub },
        update: {
          enabledById: request.user.sub,
          enabledAt: new Date(),
          disabledAt: null,
        },
      });
      return reply.send(access);
    },
  );
}
