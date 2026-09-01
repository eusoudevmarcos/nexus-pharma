import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../infra/prisma.js";
import { authenticate, requireRecentMfa, requireSystemRoles, requireTenantRoles, tenantContext } from "../security/auth.js";
import { tenantRolesAtLeast } from "../security/access-control.js";
import { blockNfceTransmission, nfcePublicDocument, prepareNfceDocument, type NfceValidationIssue } from "../services/nfce.service.js";
import { activateOfficialCatalog, catalogReleaseDiff, importOfficialCatalog, listOfficialCatalogReleases, nfceReadiness, publicNfceConfiguration, saveNfceConfiguration } from "../services/nfce-governance.service.js";

const environmentSchema = z.enum(["HOMOLOGATION", "PRODUCTION"]);
const paymentMethods = ["01", "02", "03", "04", "05", "10", "11", "12", "13", "15", "16", "17", "18", "19", "20", "21", "22", "90", "99"] as const;
const preparationSchema = z.object({
  ambiente: environmentSchema.default("HOMOLOGATION"),
  tipo_emissao: z.enum(["NORMAL", "OFFLINE_CONTINGENCY"]).default("NORMAL"),
  serie: z.number().int().min(1).max(999).default(1),
  meio_pagamento: z.enum(paymentMethods).default("01"),
  documento_consumidor: z.string().max(20).nullable().default(null),
});
const nullableHttpsUrl = z.string().url().refine((value) => value.startsWith("https://"), "Use HTTPS").nullable().optional();
const configurationSchema = z.object({
  ambiente: environmentSchema.default("HOMOLOGATION"), uf: z.string().trim().length(2), serie: z.number().int().min(1).max(999),
  versao_qrcode: z.union([z.literal(2), z.literal(3)]).default(3), identificador_csc: z.string().trim().max(20).nullable().optional(),
  segredo_csc: z.string().trim().min(6).max(200).nullable().optional(), url_autorizacao: nullableHttpsUrl,
  url_status: nullableHttpsUrl, url_evento: nullableHttpsUrl, url_qrcode: nullableHttpsUrl,
  url_consulta: nullableHttpsUrl, versao_schema_oficial: z.string().trim().max(40).nullable().optional(), ativa: z.boolean().default(true),
});
const catalogImportSchema = z.object({
  catalogo: z.enum([
    "NCM", "CEST", "CST_ICMS", "CSOSN", "CST_PIS_COFINS", "PIS_COFINS", "NATUREZA_RECEITA",
    "CCLASS_TRIB", "ALIQUOTAS_IBS_CBS", "ALIQUOTAS_CBS", "MEIOS_PAGAMENTO",
    "DF_ICMS_ST", "DF_MVA", "DF_FCP", "DF_REDUCOES", "DF_BENEFICIOS", "SCHEMA_NFCE",
  ]),
  versao_fonte: z.string().trim().min(1).max(120), url_fonte: z.string().url(), publicado_em: z.string().date().nullable().optional(),
  observacoes: z.string().trim().max(1000).nullable().optional(), itens: z.array(z.object({
    codigo: z.string().trim().min(1).max(20), codigo_pai: z.string().trim().max(40).nullable().optional(), descricao: z.string().trim().min(1).max(800),
    padroes_ncm: z.array(z.string().max(20)).max(100).optional(), parametros: z.record(z.unknown()).optional(),
    vigencia_inicio: z.string().date().nullable().optional(), vigencia_fim: z.string().date().nullable().optional(),
  })).min(1).max(20_000),
});

export async function nfceRoutes(app: FastifyInstance) {
  const read = [authenticate, tenantContext, requireTenantRoles(tenantRolesAtLeast("NFCE", "VIEW"))];
  const write = [authenticate, tenantContext, requireTenantRoles(tenantRolesAtLeast("NFCE", "OPERATE"))];

  app.get("/prontidao", { preHandler: read }, async (request) => {
    const query = z.object({ ambiente: environmentSchema.default("HOMOLOGATION") }).safeParse(request.query);
    return nfceReadiness(request.tenant!.companyId, query.success ? query.data.ambiente : "HOMOLOGATION");
  });

  app.get("/configuracao", { preHandler: read }, async (request) => {
    const query = z.object({ ambiente: environmentSchema.default("HOMOLOGATION") }).safeParse(request.query);
    const environment = query.success ? query.data.ambiente : "HOMOLOGATION";
    const value = await prisma.nfceConfiguration.findUnique({ where: { companyId_environment: { companyId: request.tenant!.companyId, environment } } });
    return value ? publicNfceConfiguration(value) : null;
  });

  app.put("/configuracao", { preHandler: [authenticate, tenantContext, requireTenantRoles(["OWNER", "ADMIN", "MANAGER"])] }, async (request, reply) => {
    const parsed = configurationSchema.safeParse(request.body ?? {});
    if (!parsed.success) return reply.status(400).send({ erro: "NFCE_CONFIGURACAO_INVALIDA", detalhes: parsed.error.flatten() });
    const company = await prisma.company.findUnique({ where: { id: request.tenant!.companyId }, select: { state: true } });
    if (company?.state && company.state !== parsed.data.uf.toUpperCase()) return reply.status(409).send({ erro: "NFCE_UF_DIVERGE_DA_EMPRESA" });
    return saveNfceConfiguration({
      companyId: request.tenant!.companyId, userId: request.user.sub, requestId: request.id,
      environment: parsed.data.ambiente, state: parsed.data.uf, series: parsed.data.serie, qrCodeVersion: parsed.data.versao_qrcode,
      cscIdentifier: parsed.data.identificador_csc, cscSecret: parsed.data.segredo_csc,
      authorizationUrl: parsed.data.url_autorizacao, statusServiceUrl: parsed.data.url_status, eventUrl: parsed.data.url_evento,
      qrCodeBaseUrl: parsed.data.url_qrcode, consultationUrl: parsed.data.url_consulta,
      officialSchemaVersion: parsed.data.versao_schema_oficial, active: parsed.data.ativa,
    });
  });

  app.get("/catalogos-oficiais", { preHandler: read }, async () => listOfficialCatalogReleases());

  app.post("/catalogos-oficiais/importar", { preHandler: [authenticate, requireSystemRoles(["INTERNAL_ADMIN", "DEVELOPER"])] }, async (request, reply) => {
    const parsed = catalogImportSchema.safeParse(request.body ?? {});
    if (!parsed.success) return reply.status(400).send({ erro: "CATALOGO_IMPORTACAO_INVALIDA", detalhes: parsed.error.flatten() });
    const release = await importOfficialCatalog({
      catalog: parsed.data.catalogo, sourceVersion: parsed.data.versao_fonte, sourceUrl: parsed.data.url_fonte,
      sourcePublishedAt: parsed.data.publicado_em, notes: parsed.data.observacoes, userId: request.user.sub, requestId: request.id,
      items: parsed.data.itens.map((item) => ({ code: item.codigo, parentCode: item.codigo_pai, description: item.descricao, ncmPatterns: item.padroes_ncm, parameters: item.parametros, validFrom: item.vigencia_inicio, validUntil: item.vigencia_fim })),
    });
    return reply.status(201).send(release);
  });

  app.get<{ Params: { id: string } }>("/catalogos-oficiais/:id/diferencas", { preHandler: [authenticate, requireSystemRoles(["INTERNAL_ADMIN", "DEVELOPER"])] }, async (request, reply) => {
    const id = z.string().uuid().safeParse(request.params.id);
    if (!id.success) return reply.status(400).send({ erro: "CATALOGO_VERSAO_INVALIDA" });
    return catalogReleaseDiff(id.data);
  });

  app.post<{ Params: { id: string } }>("/catalogos-oficiais/:id/ativar", { preHandler: [authenticate, requireSystemRoles(["INTERNAL_ADMIN"]), requireRecentMfa()] }, async (request, reply) => {
    const id = z.string().uuid().safeParse(request.params.id);
    if (!id.success) return reply.status(400).send({ erro: "CATALOGO_VERSAO_INVALIDA" });
    try {
      return await activateOfficialCatalog({ releaseId: id.data, userId: request.user.sub, requestId: request.id });
    } catch (error) {
      const code = error instanceof Error ? error.message : "CATALOGO_ATIVACAO_FALHOU";
      if (code.startsWith("CATALOGO_")) return reply.status(409).send({ erro: code });
      throw error;
    }
  });

  app.get("/vendas-disponiveis", { preHandler: read }, async (request) => {
    const query = z.object({ limite: z.coerce.number().int().min(1).max(200).default(50) }).safeParse(request.query);
    const limit = query.success ? query.data.limite : 50;
    return prisma.sale.findMany({
      where: { companyId: request.tenant!.companyId, status: "COMPLETED", invoiceModel: "NFC65" },
      select: {
        id: true, soldAt: true, grossAmount: true, taxAmount: true,
        _count: { select: { items: true } },
        nfceDocuments: { select: { id: true, environment: true, status: true, series: true, number: true, accessKey: true }, orderBy: { createdAt: "desc" } },
      },
      orderBy: { soldAt: "desc" }, take: limit,
    });
  });

  app.get("/documentos", { preHandler: read }, async (request) => {
    const query = z.object({ ambiente: environmentSchema.optional(), limite: z.coerce.number().int().min(1).max(200).default(100) }).safeParse(request.query);
    const options = query.success ? query.data : { limite: 100 };
    return prisma.nfceDocument.findMany({
      where: { companyId: request.tenant!.companyId, ...(options.ambiente ? { environment: options.ambiente } : {}) },
      select: {
        id: true, saleId: true, environment: true, emissionType: true, status: true, schemaVersion: true,
        series: true, number: true, accessKey: true, issuedAt: true, paymentMethod: true,
        payloadHash: true, validationErrors: true, protocol: true, authorizedAt: true, createdAt: true,
        sale: { select: { grossAmount: true, taxAmount: true, _count: { select: { items: true } } } },
        _count: { select: { transmissions: true } },
      },
      orderBy: { issuedAt: "desc" }, take: options.limite,
    });
  });

  app.get<{ Params: { id: string } }>("/documentos/:id", { preHandler: read }, async (request, reply) => {
    const id = z.string().uuid().safeParse(request.params.id);
    if (!id.success) return reply.status(400).send({ erro: "NFCE_ID_INVALIDO" });
    const document = await prisma.nfceDocument.findFirst({
      where: { id: id.data, companyId: request.tenant!.companyId },
      include: { transmissions: { orderBy: { createdAt: "desc" } }, sale: { select: { soldAt: true, grossAmount: true, taxAmount: true } } },
    });
    if (!document) return reply.status(404).send({ erro: "NFCE_DOCUMENTO_NAO_ENCONTRADO" });
    return nfcePublicDocument(document);
  });

  app.get<{ Params: { id: string } }>("/documentos/:id/xml", { preHandler: read }, async (request, reply) => {
    const id = z.string().uuid().safeParse(request.params.id);
    if (!id.success) return reply.status(400).send({ erro: "NFCE_ID_INVALIDO" });
    const document = await prisma.nfceDocument.findFirst({ where: { id: id.data, companyId: request.tenant!.companyId }, select: { xmlDraft: true, accessKey: true } });
    if (!document) return reply.status(404).send({ erro: "NFCE_DOCUMENTO_NAO_ENCONTRADO" });
    return reply.header("content-type", "application/xml; charset=utf-8").header("content-disposition", `attachment; filename="nfce-rascunho-${document.accessKey}.xml"`).send(document.xmlDraft);
  });

  app.post<{ Params: { saleId: string } }>("/vendas/:saleId/preparar", { preHandler: write }, async (request, reply) => {
    const saleId = z.string().uuid().safeParse(request.params.saleId);
    const parsed = preparationSchema.safeParse(request.body ?? {});
    if (!saleId.success || !parsed.success) return reply.status(400).send({ erro: "NFCE_PREPARACAO_INVALIDA", detalhes: parsed.success ? undefined : parsed.error.flatten() });
    try {
      const result = await prepareNfceDocument({
        companyId: request.tenant!.companyId, saleId: saleId.data, userId: request.user.sub, requestId: request.id,
        environment: parsed.data.ambiente, emissionType: parsed.data.tipo_emissao, series: parsed.data.serie,
        paymentMethod: parsed.data.meio_pagamento, customerTaxId: parsed.data.documento_consumidor,
      });
      return reply.status(result.idempotent ? 200 : 201).send(result);
    } catch (error) {
      const failure = error as Error & { issues?: NfceValidationIssue[] };
      if (failure.message === "NFCE_PREPARACAO_BLOQUEADA") return reply.status(409).send({ erro: failure.message, validacoes: failure.issues });
      if (failure.message === "NFCE_VENDA_NAO_ENCONTRADA" || failure.message === "NFCE_EMPRESA_NAO_ENCONTRADA") return reply.status(404).send({ erro: failure.message });
      throw error;
    }
  });

  app.post<{ Params: { id: string } }>("/documentos/:id/transmitir", { preHandler: write }, async (request, reply) => {
    const id = z.string().uuid().safeParse(request.params.id);
    if (!id.success) return reply.status(400).send({ erro: "NFCE_ID_INVALIDO" });
    await blockNfceTransmission({ companyId: request.tenant!.companyId, documentId: id.data, userId: request.user.sub, requestId: request.id });
    return reply.status(503).send({ erro: "NFCE_TRANSMISSAO_SEFAZ_DESABILITADA" });
  });
}
