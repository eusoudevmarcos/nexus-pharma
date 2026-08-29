import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Prisma } from "../generated/prisma/client.js";
import { prisma } from "../infra/prisma.js";
import {
  authenticate,
  requireTenantRoles,
  tenantContext,
} from "../security/auth.js";
import {
  decideAuditableFiscalSuggestion,
  fiscalAssistantMetrics,
  generateAuditableFiscalSuggestion,
} from "../services/fiscal-assistant.service.js";

const toJson = (value: unknown) =>
  JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
const analysisSchema = z
  .object({
    produto_id: z.string().uuid().nullable().default(null),
    categoria_id: z.string().uuid().nullable().default(null),
    uf_origem: z
      .string()
      .regex(/^[A-Z]{2}$/)
      .nullable()
      .default(null),
    uf_destino: z
      .string()
      .regex(/^[A-Z]{2}$/)
      .nullable()
      .default(null),
    tipo_operacao: z.string().min(2).max(60).nullable().default(null),
    composicao_produto: z.record(z.unknown()).default({}),
    classificacao_atual: z.record(z.unknown()).default({}),
  })
  .refine((data) => data.produto_id || data.categoria_id, {
    message: "Informe produto_id ou categoria_id",
  });
const resultSchema = z.object({
  status: z.enum(["NEEDS_REVIEW", "APPROVED", "REJECTED"]),
  classificacao_sugerida: z.record(z.unknown()),
  fundamentacao_legal: z.string().min(10).max(50000),
  confianca: z.number().min(0).max(1).nullable().default(null),
  economia_estimada: z.number().min(0).nullable().default(null),
  versao_modelo: z.string().max(80).nullable().default(null),
  observacoes_revisao: z.string().max(20000).nullable().default(null),
});
const evidenceSchema = z.object({
  tipo_fonte: z.string().min(2).max(40),
  titulo: z.string().min(3).max(250),
  url: z.string().url().max(1000).nullable().default(null),
  jurisdicao: z.string().max(80).nullable().default(null),
  publicada_em: z.coerce.date().nullable().default(null),
  vigencia_inicio: z.coerce.date().nullable().default(null),
  hash_trecho: z.string().max(128).nullable().default(null),
  metadata: z.record(z.unknown()).default({}),
});
const decisionSchema = z.object({
  decisao: z.enum(["APPROVED", "REJECTED"]),
  observacoes: z.string().max(20000).nullable().default(null),
});

export async function fiscalRoutes(app: FastifyInstance) {
  const guards = [authenticate, tenantContext];
  const reviewGuards = [
    authenticate,
    tenantContext,
    requireTenantRoles(["OWNER", "ADMIN", "MANAGER", "PHARMACIST"]),
  ];
  const requestGuards = [
    authenticate,
    tenantContext,
    requireTenantRoles(["OWNER", "ADMIN", "MANAGER", "PHARMACIST", "OPERATOR"]),
  ];

  app.get("/analises", { preHandler: guards }, async (request) =>
    prisma.taxAnalysis.findMany({
      where: { companyId: request.tenant!.companyId },
      include: {
        product: { select: { id: true, ean: true, name: true } },
        category: { select: { id: true, code: true, name: true, ncm: true } },
        evidence: true,
        requestedBy: { select: { id: true, name: true } },
        reviewedBy: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
  );

  app.post("/analises", { preHandler: requestGuards }, async (request, reply) => {
    const parsed = analysisSchema.safeParse(request.body);
    if (!parsed.success)
      return reply
        .status(400)
        .send({ erro: "ANALISE_INVALIDA", detalhes: parsed.error.flatten() });
    if (parsed.data.produto_id) {
      const product = await prisma.product.findFirst({
        where: {
          id: parsed.data.produto_id,
          companyId: request.tenant!.companyId,
        },
      });
      if (!product)
        return reply.status(404).send({ erro: "PRODUTO_NAO_ENCONTRADO" });
    }
    if (parsed.data.categoria_id) {
      const category = await prisma.fiscalCategory.findFirst({
        where: {
          id: parsed.data.categoria_id,
          companyId: request.tenant!.companyId,
        },
      });
      if (!category)
        return reply.status(404).send({ erro: "CATEGORIA_NAO_ENCONTRADA" });
    }
    const analysis = await prisma.taxAnalysis.create({
      data: {
        companyId: request.tenant!.companyId,
        productId: parsed.data.produto_id,
        categoryId: parsed.data.categoria_id,
        requestedById: request.user.sub,
        originState: parsed.data.uf_origem,
        destinationState: parsed.data.uf_destino,
        operationType: parsed.data.tipo_operacao,
        productComposition: toJson(parsed.data.composicao_produto),
        currentClassification: toJson(parsed.data.classificacao_atual),
      },
    });
    return reply.status(201).send(analysis);
  });

  app.post<{ Params: { id: string } }>(
    "/analises/:id/sugerir",
    { preHandler: requestGuards },
    async (request, reply) => {
      const id = z.string().uuid().safeParse(request.params.id);
      if (!id.success) return reply.status(400).send({ erro: "ANALISE_INVALIDA" });
      const suggestion = await generateAuditableFiscalSuggestion({
        companyId: request.tenant!.companyId,
        analysisId: id.data,
        userId: request.user.sub,
      });
      return reply.send(suggestion);
    },
  );

  app.put<{ Params: { id: string } }>(
    "/analises/:id/decisao",
    { preHandler: reviewGuards },
    async (request, reply) => {
      const id = z.string().uuid().safeParse(request.params.id);
      const parsed = decisionSchema.safeParse(request.body);
      if (!id.success || !parsed.success) return reply.status(400).send({ erro: "DECISAO_FISCAL_INVALIDA" });
      return reply.send(await decideAuditableFiscalSuggestion({
        companyId: request.tenant!.companyId,
        analysisId: id.data,
        userId: request.user.sub,
        decision: parsed.data.decisao,
        notes: parsed.data.observacoes,
      }));
    },
  );

  app.get("/assistente/metricas", { preHandler: guards }, async (request) =>
    fiscalAssistantMetrics(request.tenant!.companyId),
  );

  app.put<{ Params: { id: string } }>(
    "/analises/:id/revisao",
    { preHandler: reviewGuards },
    async (request, reply) => {
      const id = z.string().uuid().safeParse(request.params.id);
      const parsed = resultSchema.safeParse(request.body);
      if (!id.success || !parsed.success)
        return reply.status(400).send({ erro: "REVISAO_INVALIDA" });
      const analysis = await prisma.taxAnalysis.findFirst({
        where: { id: id.data, companyId: request.tenant!.companyId },
        include: { _count: { select: { evidence: true } } },
      });
      if (!analysis)
        return reply.status(404).send({ erro: "ANALISE_NAO_ENCONTRADA" });
      if (["APPROVED", "REJECTED", "SUPERSEDED"].includes(analysis.status))
        return reply.status(409).send({ erro: "ANALISE_FINALIZADA_NAO_PODE_SER_REPROCESSADA" });
      if (parsed.data.status === "APPROVED" && analysis._count.evidence === 0)
        return reply.status(409).send({ erro: "SUGESTAO_SEM_FONTE_NAO_PODE_SER_APROVADA" });
      const updated = await prisma.$transaction(async (tx) => {
        const result = await tx.taxAnalysis.update({
          where: { id: analysis.id },
          data: {
            status: parsed.data.status,
            suggestedClassification: toJson(parsed.data.classificacao_sugerida),
            legalReasoning: parsed.data.fundamentacao_legal,
            confidence: parsed.data.confianca,
            estimatedSavings: parsed.data.economia_estimada,
            modelVersion: parsed.data.versao_modelo,
            reviewNotes: parsed.data.observacoes_revisao,
            reviewedById: request.user.sub,
          },
        });
        await tx.auditLog.create({ data: {
          companyId: request.tenant!.companyId,
          userId: request.user.sub,
          action: "FISCAL_ANALYSIS_MANUAL_REVIEWED",
          entity: "TaxAnalysis",
          entityId: analysis.id,
          before: toJson({ status: analysis.status }),
          after: toJson({ status: result.status, modelVersion: result.modelVersion, evidenceCount: analysis._count.evidence }),
        } });
        return result;
      });
      return reply.send(updated);
    },
  );

  app.post<{ Params: { id: string } }>(
    "/analises/:id/evidencias",
    { preHandler: reviewGuards },
    async (request, reply) => {
      const id = z.string().uuid().safeParse(request.params.id);
      const parsed = evidenceSchema.safeParse(request.body);
      if (!id.success || !parsed.success)
        return reply.status(400).send({ erro: "EVIDENCIA_INVALIDA" });
      const analysis = await prisma.taxAnalysis.findFirst({
        where: { id: id.data, companyId: request.tenant!.companyId },
      });
      if (!analysis)
        return reply.status(404).send({ erro: "ANALISE_NAO_ENCONTRADA" });
      const evidence = await prisma.taxEvidence.create({
        data: {
          analysisId: analysis.id,
          sourceType: parsed.data.tipo_fonte,
          title: parsed.data.titulo,
          sourceUrl: parsed.data.url,
          jurisdiction: parsed.data.jurisdicao,
          publishedAt: parsed.data.publicada_em,
          effectiveFrom: parsed.data.vigencia_inicio,
          excerptHash: parsed.data.hash_trecho,
          metadata: toJson(parsed.data.metadata),
        },
      });
      return reply.status(201).send(evidence);
    },
  );
}
