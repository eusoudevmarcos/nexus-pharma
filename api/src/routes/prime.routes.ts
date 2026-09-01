import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { authenticate, requireRecentMfa, requireSystemRoles } from "../security/auth.js";
import { primeContext, requirePrimeRoles } from "../security/prime-access.js";
import { prisma } from "../infra/prisma.js";
import { getPrimeContext, getPrimeDashboard, synchronizePrimeOpportunities, updatePrimeOpportunity, updatePrimePreferences } from "../services/prime.service.js";

const opportunityTypes = ["OUT_OF_STOCK", "LOW_COVERAGE", "EXPIRING", "HIGH_DEMAND"] as const;
const opportunityStatuses = ["NEW", "ASSIGNED", "CONTACTED", "PROPOSAL_SENT", "WON", "DECLINED", "DISMISSED", "RESOLVED"] as const;
const uuid = z.string().uuid();

const preferencesSchema = z.object({
  logisticsWindowDays: z.number().int().min(2).max(5),
  targetCoverageDays: z.number().int().min(7).max(90),
  lowCoverageDays: z.number().int().min(1).max(45),
  expiryWindowDays: z.number().int().min(15).max(180),
  highDemandGrowthPercent: z.number().min(0).max(5),
  alertOutOfStock: z.boolean(), alertLowCoverage: z.boolean(), alertExpiring: z.boolean(), alertHighDemand: z.boolean(),
  allowedStates: z.array(z.string().trim().length(2)).max(27),
});

export async function primeRoutes(app: FastifyInstance) {
  app.get("/contexto", { preHandler: [authenticate] }, async (request) =>
    getPrimeContext(request.user.sub, ["INTERNAL_ADMIN", "COMMERCIAL"].includes(request.user.systemRole)),
  );

  app.get("/dashboard", { preHandler: [authenticate, primeContext] }, async (request, reply) => {
    const parsed = z.object({ uf: z.string().trim().length(2).optional(), cidade: z.string().trim().max(120).optional(), tipo: z.enum(opportunityTypes).optional(), busca: z.string().trim().max(180).optional() }).safeParse(request.query);
    if (!parsed.success || !request.prime) return reply.status(400).send({ erro: "FILTROS_PRIME_INVALIDOS" });
    return getPrimeDashboard(request.prime.organizationId, { state: parsed.data.uf?.toUpperCase(), city: parsed.data.cidade, type: parsed.data.tipo, query: parsed.data.busca });
  });

  app.post("/sincronizar", { preHandler: [authenticate, primeContext, requirePrimeRoles(["OWNER", "ADMIN", "MANAGER", "LOGISTICS"])] }, async (request, reply) => {
    if (!request.prime) return reply.status(403).send({ erro: "SEM_ACESSO_AO_PAINEL_PRIME" });
    return synchronizePrimeOpportunities(request.prime.organizationId);
  });

  app.put("/configuracoes", { preHandler: [authenticate, primeContext, requirePrimeRoles(["OWNER", "ADMIN"]), requireRecentMfa()] }, async (request, reply) => {
    const parsed = preferencesSchema.safeParse(request.body);
    if (!parsed.success || !request.prime) return reply.status(400).send({ erro: "CONFIGURACAO_PRIME_INVALIDA", detalhes: parsed.success ? undefined : parsed.error.flatten() });
    const saved = await updatePrimePreferences(request.prime.organizationId, parsed.data);
    await prisma.auditLog.create({ data: { userId: request.user.sub, action: "PRIME_PREFERENCES_UPDATED", entity: "PrimeOrganization", entityId: saved.id, requestId: request.id, ipAddress: request.ip, after: parsed.data } });
    return saved;
  });

  app.patch<{ Params: { id: string } }>("/oportunidades/:id", { preHandler: [authenticate, primeContext, requirePrimeRoles(["OWNER", "ADMIN", "MANAGER", "SALES", "LOGISTICS"])] }, async (request, reply) => {
    const id = uuid.safeParse(request.params.id);
    const parsed = z.object({ status: z.enum(opportunityStatuses), nota: z.string().trim().max(500).optional() }).safeParse(request.body);
    if (!id.success || !parsed.success || !request.prime) return reply.status(400).send({ erro: "ATUALIZACAO_DA_OPORTUNIDADE_INVALIDA" });
    try { return await updatePrimeOpportunity({ organizationId: request.prime.organizationId, opportunityId: id.data, userId: request.user.sub, status: parsed.data.status, note: parsed.data.nota }); }
    catch (cause) { return reply.status(404).send({ erro: cause instanceof Error ? cause.message : "OPORTUNIDADE_PRIME_NAO_ENCONTRADA" }); }
  });

  app.post("/organizacoes", { preHandler: [authenticate, requireSystemRoles(["INTERNAL_ADMIN"]), requireRecentMfa()] }, async (request, reply) => {
    const parsed = z.object({ codigo: z.string().trim().min(2).max(50).transform((item) => item.toUpperCase()), razao_social: z.string().trim().min(2).max(180), nome_fantasia: z.string().trim().min(2).max(180), cnpj: z.string().regex(/^\d{14}$/).optional(), tipo: z.enum(["LABORATORY", "DISTRIBUTOR", "WHOLESALER"]) }).safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ erro: "ORGANIZACAO_PRIME_INVALIDA" });
    const saved = await prisma.primeOrganization.create({ data: { code: parsed.data.codigo, legalName: parsed.data.razao_social, tradeName: parsed.data.nome_fantasia, taxId: parsed.data.cnpj, kind: parsed.data.tipo } });
    return reply.status(201).send(saved);
  });

  app.put<{ Params: { id: string } }>("/organizacoes/:id/conexoes", { preHandler: [authenticate, requireSystemRoles(["INTERNAL_ADMIN"]), requireRecentMfa()] }, async (request, reply) => {
    const organizationId = uuid.safeParse(request.params.id);
    const parsed = z.object({ empresa_id: z.string().uuid(), status: z.enum(["ACTIVE", "SUSPENDED", "TERMINATED"]).default("ACTIVE") }).safeParse(request.body);
    if (!organizationId.success || !parsed.success) return reply.status(400).send({ erro: "CONEXAO_PRIME_INVALIDA" });
    return prisma.primeConnection.upsert({ where: { organizationId_companyId: { organizationId: organizationId.data, companyId: parsed.data.empresa_id } }, create: { organizationId: organizationId.data, companyId: parsed.data.empresa_id, status: parsed.data.status }, update: { status: parsed.data.status, endsAt: parsed.data.status === "TERMINATED" ? new Date() : null } });
  });

  app.put<{ Params: { id: string } }>("/organizacoes/:id/membros", { preHandler: [authenticate, requireSystemRoles(["INTERNAL_ADMIN"]), requireRecentMfa()] }, async (request, reply) => {
    const organizationId = uuid.safeParse(request.params.id);
    const parsed = z.object({ email: z.string().email().transform((item) => item.trim().toLowerCase()), perfil: z.enum(["OWNER", "ADMIN", "MANAGER", "SALES", "LOGISTICS", "ANALYST"]), ativo: z.boolean().default(true) }).safeParse(request.body);
    if (!organizationId.success || !parsed.success) return reply.status(400).send({ erro: "MEMBRO_PRIME_INVALIDO" });
    const user = await prisma.user.findUnique({ where: { email: parsed.data.email }, select: { id: true } });
    if (!user) return reply.status(404).send({ erro: "USUARIO_PRIME_NAO_ENCONTRADO" });
    return prisma.primeMembership.upsert({ where: { organizationId_userId: { organizationId: organizationId.data, userId: user.id } }, create: { organizationId: organizationId.data, userId: user.id, role: parsed.data.perfil, active: parsed.data.ativo }, update: { role: parsed.data.perfil, active: parsed.data.ativo } });
  });
}
