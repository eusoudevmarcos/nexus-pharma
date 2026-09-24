import type { FastifyInstance, FastifyReply } from "fastify";
import { z } from "zod";
import { authenticate, requireRecentMfa } from "../security/auth.js";
import { primeContext, requirePrimeRoles } from "../security/prime-access.js";
import { prisma } from "../infra/prisma.js";
import { PrimeError, createPrimeInvitation, getPrimeContext, getPrimeDashboard, listPrimeTeam, updatePrimeMember, updatePrimePreferences } from "../services/prime.service.js";

// Painel da indústria/distribuição: SÓ LEITURA sobre os dados das farmácias.
// A indústria nunca altera estoque, pedido ou recomendação — nem registra
// atendimento comercial aqui. O que ela configura é a própria visão
// (preferências do radar) e a própria equipe.
const opportunityTypes = ["OUT_OF_STOCK", "LOW_COVERAGE", "EXPIRING", "HIGH_DEMAND"] as const;
const uuid = z.string().uuid();
const teamRoles = ["ADMIN", "ANALYST"] as const;

const preferencesSchema = z.object({
  logisticsWindowDays: z.number().int().min(2).max(5),
  targetCoverageDays: z.number().int().min(7).max(90),
  lowCoverageDays: z.number().int().min(1).max(45),
  expiryWindowDays: z.number().int().min(15).max(180),
  highDemandGrowthPercent: z.number().min(0).max(5),
  alertOutOfStock: z.boolean(), alertLowCoverage: z.boolean(), alertExpiring: z.boolean(), alertHighDemand: z.boolean(),
  allowedStates: z.array(z.string().trim().length(2)).max(27),
});

function sendPrimeError(reply: FastifyReply, error: unknown) {
  if (error instanceof PrimeError) return reply.status(error.statusCode).send({ erro: error.message });
  throw error;
}

export async function primeRoutes(app: FastifyInstance) {
  app.get("/contexto", { preHandler: [authenticate] }, async (request) =>
    getPrimeContext(request.user.sub, ["INTERNAL_ADMIN", "COMMERCIAL"].includes(request.user.systemRole)),
  );

  app.get("/dashboard", { preHandler: [authenticate, primeContext] }, async (request, reply) => {
    const parsed = z.object({ uf: z.string().trim().length(2).optional(), cidade: z.string().trim().max(120).optional(), tipo: z.enum(opportunityTypes).optional(), busca: z.string().trim().max(180).optional() }).safeParse(request.query);
    if (!parsed.success || !request.prime) return reply.status(400).send({ erro: "FILTROS_PRIME_INVALIDOS" });
    return getPrimeDashboard(request.prime.organizationId, { state: parsed.data.uf?.toUpperCase(), city: parsed.data.cidade, type: parsed.data.tipo, query: parsed.data.busca }, { role: request.prime.role, governance: request.prime.governance });
  });

  app.put("/configuracoes", { preHandler: [authenticate, primeContext, requirePrimeRoles(["OWNER", "ADMIN"]), requireRecentMfa()] }, async (request, reply) => {
    const parsed = preferencesSchema.safeParse(request.body);
    if (!parsed.success || !request.prime) return reply.status(400).send({ erro: "CONFIGURACAO_PRIME_INVALIDA", detalhes: parsed.success ? undefined : parsed.error.flatten() });
    const saved = await updatePrimePreferences(request.prime.organizationId, parsed.data);
    await prisma.auditLog.create({ data: { userId: request.user.sub, action: "PRIME_PREFERENCES_UPDATED", entity: "PrimeOrganization", entityId: saved.id, requestId: request.id, ipAddress: request.ip, after: parsed.data } });
    return saved;
  });

  // Equipe da própria organização: Responsável e Administrador convidam e
  // suspendem Administradores e Visualizadores. O Responsável é definido pela Nexus.
  app.get("/equipe", { preHandler: [authenticate, primeContext, requirePrimeRoles(["OWNER", "ADMIN"])] }, async (request) =>
    listPrimeTeam(request.prime!.organizationId),
  );

  app.post("/equipe/convites", { preHandler: [authenticate, primeContext, requirePrimeRoles(["OWNER", "ADMIN"]), requireRecentMfa()] }, async (request, reply) => {
    const parsed = z.object({ email: z.string().email().transform((item) => item.trim().toLowerCase()), perfil: z.enum(teamRoles) }).safeParse(request.body);
    if (!parsed.success || !request.prime) return reply.status(400).send({ erro: "CONVITE_INVALIDO" });
    try {
      const invitation = await createPrimeInvitation({ organizationId: request.prime.organizationId, email: parsed.data.email, role: parsed.data.perfil, actor: { userId: request.user.sub, requestId: request.id, ipAddress: request.ip } });
      return reply.status(201).send(invitation);
    } catch (error) { return sendPrimeError(reply, error); }
  });

  app.patch<{ Params: { userId: string } }>("/equipe/membros/:userId", { preHandler: [authenticate, primeContext, requirePrimeRoles(["OWNER", "ADMIN"]), requireRecentMfa()] }, async (request, reply) => {
    const userId = uuid.safeParse(request.params.userId);
    const parsed = z.object({ ativo: z.boolean().optional(), perfil: z.enum(teamRoles).optional() }).refine((value) => value.ativo !== undefined || value.perfil !== undefined).safeParse(request.body);
    if (!userId.success || !parsed.success || !request.prime) return reply.status(400).send({ erro: "ALTERACAO_INVALIDA" });
    try {
      return await updatePrimeMember({ organizationId: request.prime.organizationId, userId: userId.data, active: parsed.data.ativo, role: parsed.data.perfil, by: "ORGANIZATION", actor: { userId: request.user.sub, requestId: request.id, ipAddress: request.ip } });
    } catch (error) { return sendPrimeError(reply, error); }
  });
}
