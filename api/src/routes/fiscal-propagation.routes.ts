import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { authenticate, requireTenantRoles, tenantContext } from "../security/auth.js";
import { tenantRolesAtLeast } from "../security/access-control.js";
import { listFiscalPropagations, reviewFiscalPropagation, simulateFiscalPropagation, submitFiscalPropagation } from "../services/fiscal-propagation.service.js";

const uuid = z.string().uuid();
export async function fiscalPropagationRoutes(app: FastifyInstance) {
  const read = [authenticate, tenantContext, requireTenantRoles(tenantRolesAtLeast("FISCAL", "VIEW"))];
  const write = [authenticate, tenantContext, requireTenantRoles(tenantRolesAtLeast("FISCAL", "OPERATE"))];
  const review = [authenticate, tenantContext, requireTenantRoles(tenantRolesAtLeast("FISCAL", "APPROVE"))];
  app.get("/", { preHandler: read }, async (request) => listFiscalPropagations(request.tenant!.companyId));
  app.post("/simular", { preHandler: write }, async (request, reply) => {
    const parsed = z.object({ categoria_origem_id: uuid, categoria_destino_id: uuid }).safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ erro: "SIMULACAO_FISCAL_INVALIDA" });
    try { return reply.status(201).send(await simulateFiscalPropagation({ companyId: request.tenant!.companyId, sourceCategoryId: parsed.data.categoria_origem_id, targetCategoryId: parsed.data.categoria_destino_id, userId: request.user.sub, requestId: request.id })); }
    catch (cause) { return reply.status(409).send({ erro: cause instanceof Error ? cause.message : "SIMULACAO_FISCAL_NAO_CRIADA" }); }
  });
  app.post<{ Params: { id: string } }>("/:id/enviar", { preHandler: write }, async (request, reply) => {
    const id = uuid.safeParse(request.params.id); if (!id.success) return reply.status(400).send({ erro: "SIMULACAO_FISCAL_INVALIDA" });
    try { return reply.send(await submitFiscalPropagation({ companyId: request.tenant!.companyId, proposalId: id.data, userId: request.user.sub, requestId: request.id })); }
    catch (cause) { return reply.status(409).send({ erro: cause instanceof Error ? cause.message : "SIMULACAO_FISCAL_NAO_ENVIADA" }); }
  });
  app.put<{ Params: { id: string } }>("/:id/revisar", { preHandler: review }, async (request, reply) => {
    const id = uuid.safeParse(request.params.id); const parsed = z.object({ decisao: z.enum(["APPROVED", "REJECTED"]), justificativa: z.string().trim().max(1000).nullable().optional() }).safeParse(request.body);
    if (!id.success || !parsed.success) return reply.status(400).send({ erro: "REVISAO_FISCAL_INVALIDA" });
    try { return reply.send(await reviewFiscalPropagation({ companyId: request.tenant!.companyId, proposalId: id.data, userId: request.user.sub, decision: parsed.data.decisao, reason: parsed.data.justificativa, requestId: request.id })); }
    catch (cause) { return reply.status(409).send({ erro: cause instanceof Error ? cause.message : "SIMULACAO_FISCAL_NAO_REVISADA" }); }
  });
}
