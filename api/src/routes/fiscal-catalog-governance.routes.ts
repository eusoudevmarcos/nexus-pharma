import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { authenticate, requireRecentMfa, requireSystemRoles } from "../security/auth.js";
import { approveDfFiscalMatrixPackage, fiscalCatalogHealth, importDfFiscalMatrix } from "../services/fiscal-catalog-governance.service.js";
import { activateOfficialCatalog, catalogReleaseDiff, importOfficialCatalog } from "../services/nfce-governance.service.js";

const officialCatalogNames = [
  "NCM", "CEST", "CST_ICMS", "CSOSN", "CST_PIS_COFINS", "PIS_COFINS", "NATUREZA_RECEITA", "CCLASS_TRIB",
  "ALIQUOTAS_IBS_CBS", "ALIQUOTAS_CBS", "MEIOS_PAGAMENTO", "DF_ICMS_ST", "DF_MVA", "DF_FCP",
  "DF_REDUCOES", "DF_BENEFICIOS", "SCHEMA_NFCE",
] as const;

const catalogImportSchema = z.object({
  catalogo: z.enum(officialCatalogNames), versao_fonte: z.string().trim().min(1).max(120),
  url_fonte: z.string().url(), publicado_em: z.string().date(), observacoes: z.string().trim().max(1000).nullable().optional(),
  itens: z.array(z.object({
    codigo: z.string().trim().min(1).max(20), codigo_pai: z.string().trim().max(40).nullable().optional(),
    descricao: z.string().trim().min(1).max(800), padroes_ncm: z.array(z.string().max(20)).max(100).optional(),
    parametros: z.record(z.unknown()).optional(), vigencia_inicio: z.string().date().nullable().optional(),
    vigencia_fim: z.string().date().nullable().optional(),
  })).min(1).max(20_000),
});

const icmsOutcomeSchema = z.object({
  st: z.boolean(), cst: z.string().trim().max(3).optional(), csosn: z.string().trim().max(3).optional(),
  cfopEntrada: z.string().trim().max(4).optional(), cfopSaida: z.string().trim().max(4).optional(),
  aliquota: z.number().min(0).max(100).optional(), fcp: z.number().min(0).max(100).optional(),
  reducaoBase: z.number().min(0).max(100).optional(), mvaOriginal: z.number().min(0).max(1000).optional(),
  mvaAjustada: z.number().min(0).max(1000).optional(), codigoBeneficio: z.string().trim().max(30).nullable().optional(),
}).refine((value) => Boolean(value.cst || value.csosn), "Informe CST ou CSOSN");

const dfMatrixImportSchema = z.object({
  versao_fonte: z.string().trim().min(1).max(30), url_fonte: z.string().url(), publicado_em: z.string().date(),
  referencia_legal: z.string().trim().min(3).max(250), observacoes: z.string().trim().max(1000).nullable().optional(),
  regras: z.array(z.object({
    codigo: z.string().trim().min(2).max(80), nome: z.string().trim().min(3).max(180),
    uf_origem: z.string().regex(/^[A-Z]{2}$/).nullable().optional(),
    regime: z.enum(["SIMPLES_NACIONAL", "LUCRO_PRESUMIDO", "LUCRO_REAL"]),
    tipo_operacao: z.string().trim().min(2).max(60).default("ENTRADA_REVENDA"),
    ncm: z.string().regex(/^[0-9.]{2,10}$/), cest: z.string().regex(/^[0-9.]{2,9}$/).nullable().optional(),
    prioridade: z.number().int().min(0).max(10_000).default(100), condicoes: z.record(z.unknown()).default({}),
    resultado: z.object({ icms: icmsOutcomeSchema }).passthrough(), vigencia_inicio: z.string().date(),
    vigencia_fim: z.string().date().nullable().optional(),
  })).min(1).max(10_000),
});

function governanceError(reply: { status: (code: number) => { send: (value: unknown) => unknown } }, error: unknown) {
  const code = error instanceof Error ? error.message : "GOVERNANCA_FISCAL_FALHOU";
  if (code.startsWith("CATALOGO_") || code.startsWith("MATRIZ_DF_")) return reply.status(409).send({ erro: code });
  throw error;
}

export async function fiscalCatalogGovernanceRoutes(app: FastifyInstance) {
  const read = [authenticate, requireSystemRoles(["INTERNAL_ADMIN", "DEVELOPER"] )];

  app.get("/saude", { preHandler: read }, async () => fiscalCatalogHealth());

  app.post("/catalogos/importar", { preHandler: read }, async (request, reply) => {
    const parsed = catalogImportSchema.safeParse(request.body ?? {});
    if (!parsed.success) return reply.status(400).send({ erro: "CATALOGO_IMPORTACAO_INVALIDA", detalhes: parsed.error.flatten() });
    try {
      const release = await importOfficialCatalog({
        catalog: parsed.data.catalogo, sourceVersion: parsed.data.versao_fonte, sourceUrl: parsed.data.url_fonte,
        sourcePublishedAt: parsed.data.publicado_em, notes: parsed.data.observacoes, userId: request.user.sub, requestId: request.id,
        items: parsed.data.itens.map((item) => ({ code: item.codigo, parentCode: item.codigo_pai, description: item.descricao, ncmPatterns: item.padroes_ncm, parameters: item.parametros, validFrom: item.vigencia_inicio, validUntil: item.vigencia_fim })),
      });
      return reply.status(201).send(release);
    } catch (error) { return governanceError(reply, error); }
  });

  app.get<{ Params: { id: string } }>("/catalogos/:id/diferencas", { preHandler: read }, async (request, reply) => {
    const id = z.string().uuid().safeParse(request.params.id);
    if (!id.success) return reply.status(400).send({ erro: "CATALOGO_VERSAO_INVALIDA" });
    try { return await catalogReleaseDiff(id.data); } catch (error) { return governanceError(reply, error); }
  });

  app.post<{ Params: { id: string } }>("/catalogos/:id/ativar", { preHandler: [authenticate, requireSystemRoles(["INTERNAL_ADMIN"]), requireRecentMfa()] }, async (request, reply) => {
    const id = z.string().uuid().safeParse(request.params.id);
    if (!id.success) return reply.status(400).send({ erro: "CATALOGO_VERSAO_INVALIDA" });
    try { return await activateOfficialCatalog({ releaseId: id.data, userId: request.user.sub, requestId: request.id }); } catch (error) { return governanceError(reply, error); }
  });

  app.post("/matriz-df/importar", { preHandler: read }, async (request, reply) => {
    const parsed = dfMatrixImportSchema.safeParse(request.body ?? {});
    if (!parsed.success) return reply.status(400).send({ erro: "MATRIZ_DF_IMPORTACAO_INVALIDA", detalhes: parsed.error.flatten() });
    try {
      const result = await importDfFiscalMatrix({
        sourceVersion: parsed.data.versao_fonte, sourceUrl: parsed.data.url_fonte, sourcePublishedAt: parsed.data.publicado_em,
        sourceReference: parsed.data.referencia_legal, notes: parsed.data.observacoes, userId: request.user.sub, requestId: request.id,
        rows: parsed.data.regras.map((rule) => ({
          code: rule.codigo, name: rule.nome, originState: rule.uf_origem, regime: rule.regime, operationType: rule.tipo_operacao,
          ncmPattern: rule.ncm, cestPattern: rule.cest, priority: rule.prioridade, conditions: rule.condicoes,
          outcome: rule.resultado, validFrom: rule.vigencia_inicio, validUntil: rule.vigencia_fim,
        })),
      });
      return reply.status(201).send(result);
    } catch (error) { return governanceError(reply, error); }
  });

  app.post<{ Params: { hash: string } }>("/matriz-df/pacotes/:hash/aprovar", { preHandler: [authenticate, requireSystemRoles(["INTERNAL_ADMIN"]), requireRecentMfa()] }, async (request, reply) => {
    const hash = z.string().regex(/^[a-f0-9]{64}$/).safeParse(request.params.hash);
    const body = z.object({ parecer: z.string().trim().min(10).max(1000) }).safeParse(request.body ?? {});
    if (!hash.success || !body.success) return reply.status(400).send({ erro: "MATRIZ_DF_APROVACAO_INVALIDA" });
    try { return await approveDfFiscalMatrixPackage({ evidenceHash: hash.data, userId: request.user.sub, requestId: request.id, reviewNotes: body.data.parecer }); } catch (error) { return governanceError(reply, error); }
  });
}
