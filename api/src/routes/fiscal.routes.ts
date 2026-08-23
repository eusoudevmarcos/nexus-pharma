import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Prisma } from "../generated/prisma/client.js";
import { prisma } from "../infra/prisma.js";
import {
  authenticate,
  requireTenantRoles,
  tenantContext,
} from "../security/auth.js";

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

export async function fiscalRoutes(app: FastifyInstance) {
  const guards = [authenticate, tenantContext];
  const reviewGuards = [
    authenticate,
    tenantContext,
    requireTenantRoles(["OWNER", "ADMIN", "MANAGER", "PHARMACIST"]),
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

  app.post("/analises", { preHandler: guards }, async (request, reply) => {
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
      });
      if (!analysis)
        return reply.status(404).send({ erro: "ANALISE_NAO_ENCONTRADA" });
      const updated = await prisma.taxAnalysis.update({
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
