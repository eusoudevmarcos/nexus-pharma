import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { authenticate, requireTenantRoles, tenantContext } from "../security/auth.js";
import { listProductImports, previewProductImport, productImportTemplateHeaders, reviewProductImport, submitProductImport } from "../services/product-import.service.js";

const uuid = z.string().uuid();
const rowsSchema = z.object({
  nome_arquivo: z.string().trim().min(1).max(255), tipo_arquivo: z.enum(["CSV", "XLSX"]),
  linhas: z.array(z.record(z.unknown())).min(1).max(1000),
});

export async function productImportRoutes(app: FastifyInstance) {
  const read = [authenticate, tenantContext, requireTenantRoles(["OWNER", "ADMIN", "MANAGER", "PHARMACIST"])];
  const write = [authenticate, tenantContext, requireTenantRoles(["OWNER", "ADMIN", "MANAGER", "PHARMACIST"])];
  const review = [authenticate, tenantContext, requireTenantRoles(["OWNER", "ADMIN", "MANAGER"])];

  app.get("/modelo", { preHandler: read }, async () => ({ colunas: productImportTemplateHeaders, limite_linhas: 1000, altera_estoque: false }));
  app.get("/", { preHandler: read }, async (request) => listProductImports(request.tenant!.companyId));

  app.post("/pre-validar", { preHandler: write, bodyLimit: 5_500_000 }, async (request, reply) => {
    const parsed = rowsSchema.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ erro: "ARQUIVO_DE_IMPORTACAO_INVALIDO", detalhes: parsed.error.flatten() });
    try {
      return reply.status(201).send(await previewProductImport({ companyId: request.tenant!.companyId, userId: request.user.sub, fileName: parsed.data.nome_arquivo, fileType: parsed.data.tipo_arquivo, rows: parsed.data.linhas, requestId: request.id }));
    } catch (cause) {
      return reply.status(409).send({ erro: cause instanceof Error ? cause.message : "IMPORTACAO_NAO_VALIDADA" });
    }
  });

  app.post<{ Params: { id: string } }>("/:id/enviar", { preHandler: write }, async (request, reply) => {
    const id = uuid.safeParse(request.params.id);
    if (!id.success) return reply.status(400).send({ erro: "IMPORTACAO_INVALIDA" });
    try {
      return reply.send(await submitProductImport({ companyId: request.tenant!.companyId, batchId: id.data, userId: request.user.sub, requestId: request.id }));
    } catch (cause) {
      return reply.status(409).send({ erro: cause instanceof Error ? cause.message : "IMPORTACAO_NAO_ENVIADA" });
    }
  });

  app.put<{ Params: { id: string } }>("/:id/revisar", { preHandler: review }, async (request, reply) => {
    const id = uuid.safeParse(request.params.id);
    const parsed = z.object({ decisao: z.enum(["APPROVED", "REJECTED"]), justificativa: z.string().trim().max(1000).nullable().optional() }).safeParse(request.body);
    if (!id.success || !parsed.success) return reply.status(400).send({ erro: "REVISAO_DA_IMPORTACAO_INVALIDA" });
    try {
      return reply.send(await reviewProductImport({ companyId: request.tenant!.companyId, batchId: id.data, userId: request.user.sub, decision: parsed.data.decisao, reason: parsed.data.justificativa, requestId: request.id }));
    } catch (cause) {
      return reply.status(409).send({ erro: cause instanceof Error ? cause.message : "IMPORTACAO_NAO_REVISADA" });
    }
  });
}
