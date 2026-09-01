import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { authenticate, requireRecentMfa, requireTenantRoles, tenantContext } from "../security/auth.js";
import { completeAccessReview, createAccessReview, decideAccessReviewItem, exportAccessReviewCsv, getAccessReview, listAccessReviews } from "../services/access-review.service.js";

const read = [authenticate, tenantContext, requireTenantRoles(["OWNER", "ADMIN", "MANAGER"])];
const manage = [authenticate, tenantContext, requireTenantRoles(["OWNER", "ADMIN"]), requireRecentMfa()];
const idSchema = z.string().uuid();

function controlledError(reply: import("fastify").FastifyReply, cause: unknown) {
  const code = cause instanceof Error ? cause.message : "REVISAO_DE_ACESSO_NAO_CONCLUIDA";
  return reply.status(code.includes("NAO_ENCONTRAD") ? 404 : 409).send({ erro: code });
}

export async function accessReviewRoutes(app: FastifyInstance) {
  app.get("/", { preHandler: read }, async (request) => listAccessReviews(request.tenant!.companyId));
  app.get<{ Params: { id: string } }>("/:id", { preHandler: read }, async (request, reply) => {
    const id = idSchema.safeParse(request.params.id);
    if (!id.success) return reply.status(400).send({ erro: "REVISAO_DE_ACESSO_INVALIDA" });
    const review = await getAccessReview(request.tenant!.companyId, id.data);
    return review ? reply.send(review) : reply.status(404).send({ erro: "REVISAO_DE_ACESSO_NAO_ENCONTRADA" });
  });
  app.post("/", { preHandler: manage }, async (request, reply) => {
    const parsed = z.object({ periodo: z.string().trim().min(3).max(80), prazo: z.coerce.date().min(new Date()), observacoes: z.string().trim().max(2000).nullable().optional(), confirmacao: z.literal("INICIAR REVISAO") }).safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ erro: "ABERTURA_DE_REVISAO_INVALIDA", detalhes: parsed.error.flatten() });
    try { return reply.status(201).send(await createAccessReview({ companyId: request.tenant!.companyId, periodLabel: parsed.data.periodo, dueAt: parsed.data.prazo, notes: parsed.data.observacoes, userId: request.user.sub, requestId: request.id, ipAddress: request.ip })); }
    catch (cause) { return controlledError(reply, cause); }
  });
  app.put<{ Params: { id: string; itemId: string } }>("/:id/itens/:itemId", { preHandler: manage }, async (request, reply) => {
    const ids = z.object({ id: idSchema, itemId: idSchema }).safeParse(request.params);
    const parsed = z.object({ decisao: z.enum(["CONFIRMED", "ADJUSTMENT_REQUIRED", "REVOKED"]), justificativa: z.string().trim().max(2000).nullable().optional(), confirmacao: z.string().trim().max(40).optional() }).safeParse(request.body);
    if (!ids.success || !parsed.success) return reply.status(400).send({ erro: "DECISAO_DE_REVISAO_INVALIDA" });
    try { return reply.send(await decideAccessReviewItem({ companyId: request.tenant!.companyId, campaignId: ids.data.id, itemId: ids.data.itemId, decision: parsed.data.decisao, justification: parsed.data.justificativa, confirmation: parsed.data.confirmacao, userId: request.user.sub, requestId: request.id, ipAddress: request.ip })); }
    catch (cause) { return controlledError(reply, cause); }
  });
  app.post<{ Params: { id: string } }>("/:id/concluir", { preHandler: manage }, async (request, reply) => {
    const id = idSchema.safeParse(request.params.id);
    const parsed = z.object({ confirmacao: z.literal("CONCLUIR REVISAO"), observacoes: z.string().trim().max(2000).nullable().optional() }).safeParse(request.body);
    if (!id.success || !parsed.success) return reply.status(400).send({ erro: "CONCLUSAO_DE_REVISAO_INVALIDA" });
    try { return reply.send(await completeAccessReview({ companyId: request.tenant!.companyId, campaignId: id.data, confirmation: parsed.data.confirmacao, notes: parsed.data.observacoes, userId: request.user.sub, requestId: request.id, ipAddress: request.ip })); }
    catch (cause) { return controlledError(reply, cause); }
  });
  app.get<{ Params: { id: string } }>("/:id/exportar.csv", { preHandler: read }, async (request, reply) => {
    const id = idSchema.safeParse(request.params.id);
    if (!id.success) return reply.status(400).send({ erro: "REVISAO_DE_ACESSO_INVALIDA" });
    const csv = await exportAccessReviewCsv(request.tenant!.companyId, id.data);
    if (!csv) return reply.status(404).send({ erro: "REVISAO_DE_ACESSO_NAO_ENCONTRADA" });
    return reply.header("content-type", "text/csv; charset=utf-8").header("content-disposition", `attachment; filename="revisao-acessos-${id.data}.csv"`).send(csv);
  });
}
