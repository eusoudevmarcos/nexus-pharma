import { randomBytes } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { config } from "../config.js";
import type { Prisma } from "../generated/prisma/client.js";
import { prisma } from "../infra/prisma.js";
import { authenticate, requireSystemRoles, tenantContext } from "../security/auth.js";

const DAY = 86_400_000;
const activeStatuses = ["RECEIVED", "IDENTITY_CHECK", "IN_PROGRESS", "WAITING_LEGAL_REVIEW"] as const;
const requestType = z.enum([
  "CONFIRMATION_ACCESS",
  "CORRECTION",
  "ANONYMIZATION_BLOCK_DELETION",
  "PORTABILITY",
  "CONSENT_REVOCATION",
  "DATA_SHARING_INFO",
  "AUTOMATED_DECISION_REVIEW",
]);
const createRequestSchema = z.object({ tipo: requestType, detalhes: z.string().trim().max(4000).optional() });
const updateRequestSchema = z
  .object({
    status: z.enum(["IDENTITY_CHECK", "IN_PROGRESS", "WAITING_LEGAL_REVIEW", "COMPLETED", "REJECTED", "CANCELLED"]),
    resumo: z.string().trim().max(8000).optional(),
    motivo_retencao: z.string().trim().max(4000).optional(),
  })
  .superRefine((data, context) => {
    if (["COMPLETED", "REJECTED"].includes(data.status) && (!data.resumo || data.resumo.length < 10)) {
      context.addIssue({ code: "custom", path: ["resumo"], message: "Informe uma conclusão com ao menos 10 caracteres." });
    }
  });
const createDrillSchema = z.object({
  ambiente: z.string().trim().min(2).max(40),
  objetivo: z.string().trim().min(10).max(4000),
  agendado_para: z.coerce.date(),
  referencia_backup: z.string().trim().max(200).optional(),
});
const updateDrillSchema = z
  .object({
    status: z.enum(["RUNNING", "PASSED", "FAILED", "CANCELLED"]),
    referencia_backup: z.string().trim().max(200).optional(),
    rpo_minutos: z.number().int().min(0).max(525_600).optional(),
    rto_minutos: z.number().int().min(0).max(525_600).optional(),
    verificacoes: z.array(z.object({ item: z.string().trim().min(2).max(160), resultado: z.enum(["PASS", "FAIL"]), detalhe: z.string().trim().max(500).optional() })).max(50).optional(),
    observacoes: z.string().trim().max(8000).optional(),
  })
  .superRefine((data, context) => {
    if (data.status === "PASSED" && (data.rpo_minutos === undefined || data.rto_minutos === undefined || !data.verificacoes?.length)) {
      context.addIssue({ code: "custom", message: "Um teste aprovado exige RPO, RTO e verificações." });
    }
    if (data.status === "FAILED" && (!data.observacoes || data.observacoes.length < 10)) {
      context.addIssue({ code: "custom", path: ["observacoes"], message: "Descreva a falha encontrada." });
    }
  });

const json = (value: unknown) => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
const protocol = () => `LGPD-${new Date().getUTCFullYear()}-${randomBytes(5).toString("hex").toUpperCase()}`;

export async function privacyRoutes(app: FastifyInstance) {
  app.get(
    "/privacidade/solicitacoes",
    { preHandler: [authenticate, tenantContext] },
    async (request) =>
      prisma.privacyRequest.findMany({
        where: { companyId: request.tenant!.companyId, subjectUserId: request.user.sub },
        select: { id: true, protocol: true, type: true, status: true, details: true, dueAt: true, resolutionSummary: true, retentionReason: true, completedAt: true, createdAt: true, updatedAt: true },
        orderBy: { createdAt: "desc" },
      }),
  );

  app.post(
    "/privacidade/solicitacoes",
    { preHandler: [authenticate, tenantContext] },
    async (request, reply) => {
      const parsed = createRequestSchema.safeParse(request.body);
      if (!parsed.success) return reply.status(400).send({ erro: "SOLICITACAO_DE_PRIVACIDADE_INVALIDA", detalhes: parsed.error.flatten() });
      const duplicate = await prisma.privacyRequest.findFirst({
        where: { companyId: request.tenant!.companyId, subjectUserId: request.user.sub, type: parsed.data.tipo, status: { in: [...activeStatuses] } },
        select: { protocol: true },
      });
      if (duplicate) return reply.status(409).send({ erro: "SOLICITACAO_DE_PRIVACIDADE_EM_ANDAMENTO", protocolo: duplicate.protocol });
      const created = await prisma.$transaction(async (tx) => {
        const saved = await tx.privacyRequest.create({
          data: {
            protocol: protocol(),
            companyId: request.tenant!.companyId,
            subjectUserId: request.user.sub,
            requestedById: request.user.sub,
            type: parsed.data.tipo,
            details: parsed.data.detalhes,
            identityVerifiedAt: new Date(),
            dueAt: new Date(Date.now() + config.PRIVACY_REQUEST_SLA_DAYS * DAY),
          },
        });
        await tx.auditLog.create({ data: { companyId: saved.companyId, userId: request.user.sub, action: "PRIVACY_REQUEST_CREATED", entity: "PrivacyRequest", entityId: saved.id, requestId: request.id, ipAddress: request.ip, after: { protocol: saved.protocol, type: saved.type, dueAt: saved.dueAt } } });
        return saved;
      });
      return reply.status(201).send(created);
    },
  );

  app.get(
    "/interno/privacidade",
    { preHandler: [authenticate, requireSystemRoles(["INTERNAL_ADMIN"])] },
    async () => {
      const now = new Date();
      const threeDays = new Date(now.getTime() + 3 * DAY);
      const thirtyDaysAgo = new Date(now.getTime() - 30 * DAY);
      const drillLimit = new Date(now.getTime() - 90 * DAY);
      const [open, dueSoon, overdue, completed, requests, drills, recentPassed] = await Promise.all([
        prisma.privacyRequest.count({ where: { status: { in: [...activeStatuses] } } }),
        prisma.privacyRequest.count({ where: { status: { in: [...activeStatuses] }, dueAt: { gte: now, lte: threeDays } } }),
        prisma.privacyRequest.count({ where: { status: { in: [...activeStatuses] }, dueAt: { lt: now } } }),
        prisma.privacyRequest.count({ where: { status: "COMPLETED", completedAt: { gte: thirtyDaysAgo } } }),
        prisma.privacyRequest.findMany({ include: { company: { select: { tradeName: true } }, subject: { select: { name: true, email: true } }, handledBy: { select: { name: true } } }, orderBy: [{ dueAt: "asc" }, { createdAt: "desc" }], take: 100 }),
        prisma.recoveryDrill.findMany({ include: { performedBy: { select: { name: true } } }, orderBy: { scheduledAt: "desc" }, take: 30 }),
        prisma.recoveryDrill.findFirst({ where: { status: "PASSED", completedAt: { gte: drillLimit } }, orderBy: { completedAt: "desc" } }),
      ]);
      const recoveryConfigured = config.DATABASE_RECOVERY_MODE === "PITR" && config.DATABASE_RECOVERY_WINDOW_DAYS > 0;
      return {
        generatedAt: now,
        indicators: { open, dueSoon, overdue, completed },
        requests,
        drills,
        recovery: {
          declaredMode: config.DATABASE_RECOVERY_MODE,
          declaredWindowDays: config.DATABASE_RECOVERY_WINDOW_DAYS,
          configured: recoveryConfigured,
          recentPassedDrill: Boolean(recentPassed),
          productionReady: recoveryConfigured && Boolean(recentPassed),
        },
      };
    },
  );

  app.patch<{ Params: { id: string } }>(
    "/interno/privacidade/solicitacoes/:id",
    { preHandler: [authenticate, requireSystemRoles(["INTERNAL_ADMIN"])] },
    async (request, reply) => {
      const id = z.string().uuid().safeParse(request.params.id);
      const parsed = updateRequestSchema.safeParse(request.body);
      if (!id.success || !parsed.success) return reply.status(400).send({ erro: "ATUALIZACAO_DE_PRIVACIDADE_INVALIDA" });
      const current = await prisma.privacyRequest.findUnique({ where: { id: id.data } });
      if (!current) return reply.status(404).send({ erro: "SOLICITACAO_NAO_ENCONTRADA" });
      if (["COMPLETED", "REJECTED", "CANCELLED"].includes(current.status)) return reply.status(409).send({ erro: "SOLICITACAO_JA_ENCERRADA" });
      if (current.type === "ANONYMIZATION_BLOCK_DELETION" && parsed.data.status === "REJECTED" && !parsed.data.motivo_retencao) {
        return reply.status(400).send({ erro: "MOTIVO_DE_RETENCAO_OBRIGATORIO" });
      }
      const updated = await prisma.$transaction(async (tx) => {
        const saved = await tx.privacyRequest.update({ where: { id: current.id }, data: { status: parsed.data.status, handledById: request.user.sub, resolutionSummary: parsed.data.resumo, retentionReason: parsed.data.motivo_retencao, ...(parsed.data.status === "IDENTITY_CHECK" ? { identityVerifiedAt: null } : {}), ...(["COMPLETED", "REJECTED", "CANCELLED"].includes(parsed.data.status) ? { completedAt: new Date() } : {}) } });
        await tx.auditLog.create({ data: { companyId: current.companyId, userId: request.user.sub, action: "PRIVACY_REQUEST_UPDATED", entity: "PrivacyRequest", entityId: current.id, requestId: request.id, ipAddress: request.ip, before: { status: current.status }, after: { status: saved.status, resolutionSummary: saved.resolutionSummary, retentionReason: saved.retentionReason } } });
        return saved;
      });
      return reply.send(updated);
    },
  );

  app.post(
    "/interno/privacidade/recuperacao/testes",
    { preHandler: [authenticate, requireSystemRoles(["INTERNAL_ADMIN"])] },
    async (request, reply) => {
      const parsed = createDrillSchema.safeParse(request.body);
      if (!parsed.success) return reply.status(400).send({ erro: "TESTE_DE_RECUPERACAO_INVALIDO", detalhes: parsed.error.flatten() });
      const drill = await prisma.recoveryDrill.create({ data: { environment: parsed.data.ambiente, objective: parsed.data.objetivo, scheduledAt: parsed.data.agendado_para, backupReference: parsed.data.referencia_backup, performedById: request.user.sub } });
      await prisma.auditLog.create({ data: { userId: request.user.sub, action: "RECOVERY_DRILL_SCHEDULED", entity: "RecoveryDrill", entityId: drill.id, requestId: request.id, ipAddress: request.ip, after: { environment: drill.environment, scheduledAt: drill.scheduledAt } } });
      return reply.status(201).send(drill);
    },
  );

  app.patch<{ Params: { id: string } }>(
    "/interno/privacidade/recuperacao/testes/:id",
    { preHandler: [authenticate, requireSystemRoles(["INTERNAL_ADMIN"])] },
    async (request, reply) => {
      const id = z.string().uuid().safeParse(request.params.id);
      const parsed = updateDrillSchema.safeParse(request.body);
      if (!id.success || !parsed.success) return reply.status(400).send({ erro: "ATUALIZACAO_DE_RECUPERACAO_INVALIDA" });
      const current = await prisma.recoveryDrill.findUnique({ where: { id: id.data } });
      if (!current) return reply.status(404).send({ erro: "TESTE_NAO_ENCONTRADO" });
      if (["PASSED", "FAILED", "CANCELLED"].includes(current.status)) return reply.status(409).send({ erro: "TESTE_JA_ENCERRADO" });
      const terminal = ["PASSED", "FAILED", "CANCELLED"].includes(parsed.data.status);
      const drill = await prisma.recoveryDrill.update({ where: { id: current.id }, data: { status: parsed.data.status, performedById: request.user.sub, backupReference: parsed.data.referencia_backup ?? current.backupReference, rpoMinutes: parsed.data.rpo_minutos, rtoMinutes: parsed.data.rto_minutos, integrityChecks: json(parsed.data.verificacoes ?? []), notes: parsed.data.observacoes, ...(parsed.data.status === "RUNNING" ? { startedAt: current.startedAt ?? new Date() } : {}), ...(terminal ? { completedAt: new Date() } : {}) } });
      await prisma.auditLog.create({ data: { userId: request.user.sub, action: "RECOVERY_DRILL_UPDATED", entity: "RecoveryDrill", entityId: drill.id, requestId: request.id, ipAddress: request.ip, before: { status: current.status }, after: { status: drill.status, rpoMinutes: drill.rpoMinutes, rtoMinutes: drill.rtoMinutes } } });
      return reply.send(drill);
    },
  );
}
