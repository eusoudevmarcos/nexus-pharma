import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Prisma } from "../generated/prisma/client.js";
import { prisma } from "../infra/prisma.js";
import { authenticate, requireTenantRoles, tenantContext } from "../security/auth.js";
import { tenantRolesAtLeast } from "../security/access-control.js";

const toJson = (value: unknown) => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
const matrixSchema = z.object({
  codigo: z.string().min(2).max(80),
  nome: z.string().min(3).max(180),
  uf_origem: z.string().regex(/^[A-Z]{2}$/).nullable().default(null),
  uf_destino: z.string().regex(/^[A-Z]{2}$/),
  regime: z.enum(["SIMPLES_NACIONAL", "LUCRO_PRESUMIDO", "LUCRO_REAL"]),
  tipo_operacao: z.string().min(2).max(60).default("ENTRADA_REVENDA"),
  ncm: z.string().regex(/^[0-9]{2,8}$/),
  cest: z.string().regex(/^[0-9]{2,7}$/).nullable().default(null),
  prioridade: z.number().int().min(0).max(10000).default(100),
  condicoes: z.record(z.unknown()).default({}),
  resultado: z.record(z.unknown()),
  fontes: z.array(z.object({
    titulo: z.string().min(3).max(250),
    url: z.string().url().max(1000),
    publicado_em: z.string().max(30).optional(),
    referencia: z.string().max(250).optional(),
  })).default([]),
  versao: z.string().min(1).max(30),
  vigencia_inicio: z.coerce.date(),
  vigencia_fim: z.coerce.date().nullable().default(null),
  status: z.enum(["DRAFT", "UNDER_REVIEW", "APPROVED", "EXPIRED"]).default("DRAFT"),
}).superRefine((value, context) => {
  if (value.status === "APPROVED" && value.fontes.length === 0) {
    context.addIssue({ code: "custom", path: ["fontes"], message: "Regra aprovada exige ao menos uma fonte legal." });
  }
  if (value.vigencia_fim && value.vigencia_fim < value.vigencia_inicio) {
    context.addIssue({ code: "custom", path: ["vigencia_fim"], message: "Vigência final anterior à inicial." });
  }
});

export async function fiscalMatrixRoutes(app: FastifyInstance) {
  const read = [authenticate, tenantContext, requireTenantRoles(tenantRolesAtLeast("FISCAL", "VIEW"))];
  const write = [authenticate, tenantContext, requireTenantRoles(tenantRolesAtLeast("FISCAL", "OPERATE"))];

  app.get("/", { preHandler: read }, async (request) => {
    const query = z.object({ uf: z.string().regex(/^[A-Z]{2}$/).optional(), status: z.enum(["DRAFT", "UNDER_REVIEW", "APPROVED", "EXPIRED"]).optional() }).safeParse(request.query);
    const companyId = request.tenant!.companyId;
    return prisma.fiscalMatrixRule.findMany({
      where: {
        OR: [{ companyId: null }, { companyId }],
        ...(query.success && query.data.uf ? { destinationState: query.data.uf } : {}),
        ...(query.success && query.data.status ? { status: query.data.status } : {}),
      },
      orderBy: [{ destinationState: "asc" }, { priority: "desc" }, { ncmPattern: "asc" }],
    });
  });

  app.post("/", { preHandler: write }, async (request, reply) => {
    const parsed = matrixSchema.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ erro: "REGRA_MATRIZ_INVALIDA", detalhes: parsed.error.flatten() });
    const data = parsed.data;
    const created = await prisma.fiscalMatrixRule.create({
      data: {
        companyId: request.tenant!.companyId,
        code: data.codigo,
        name: data.nome,
        originState: data.uf_origem,
        destinationState: data.uf_destino,
        regime: data.regime,
        operationType: data.tipo_operacao,
        ncmPattern: data.ncm,
        cestPattern: data.cest,
        priority: data.prioridade,
        conditions: toJson(data.condicoes),
        outcome: toJson(data.resultado),
        sourceReferences: toJson(data.fontes),
        ruleVersion: data.versao,
        validFrom: data.vigencia_inicio,
        validUntil: data.vigencia_fim,
        status: data.status,
      },
    });
    await prisma.auditLog.create({ data: { companyId: request.tenant!.companyId, userId: request.user.sub, action: "FISCAL_MATRIX_RULE_CREATED", entity: "FiscalMatrixRule", entityId: created.id, after: toJson({ code: created.code, version: created.ruleVersion, status: created.status }) } });
    return reply.status(201).send(created);
  });

  app.put<{ Params: { id: string } }>("/:id", { preHandler: write }, async (request, reply) => {
    const id = z.string().uuid().safeParse(request.params.id);
    const parsed = matrixSchema.safeParse(request.body);
    if (!id.success || !parsed.success) return reply.status(400).send({ erro: "REGRA_MATRIZ_INVALIDA", detalhes: parsed.success ? undefined : parsed.error.flatten() });
    const current = await prisma.fiscalMatrixRule.findFirst({ where: { id: id.data, companyId: request.tenant!.companyId } });
    if (!current) return reply.status(404).send({ erro: "REGRA_MATRIZ_NAO_ENCONTRADA" });
    if (current.status === "APPROVED" && current.ruleVersion === parsed.data.versao) {
      return reply.status(409).send({ erro: "REGRA_APROVADA_EXIGE_NOVA_VERSAO" });
    }
    const data = parsed.data;
    const updated = await prisma.fiscalMatrixRule.update({ where: { id: current.id }, data: {
      code: data.codigo, name: data.nome, originState: data.uf_origem, destinationState: data.uf_destino,
      regime: data.regime, operationType: data.tipo_operacao, ncmPattern: data.ncm, cestPattern: data.cest,
      priority: data.prioridade, conditions: toJson(data.condicoes), outcome: toJson(data.resultado),
      sourceReferences: toJson(data.fontes), ruleVersion: data.versao, validFrom: data.vigencia_inicio,
      validUntil: data.vigencia_fim, status: data.status,
    } });
    await prisma.auditLog.create({ data: { companyId: request.tenant!.companyId, userId: request.user.sub, action: "FISCAL_MATRIX_RULE_UPDATED", entity: "FiscalMatrixRule", entityId: updated.id, before: toJson({ version: current.ruleVersion, status: current.status }), after: toJson({ version: updated.ruleVersion, status: updated.status }) } });
    return updated;
  });
}
