import type { FastifyInstance, FastifyReply } from "fastify";
import { z } from "zod";
import type { Prisma } from "../generated/prisma/client.js";
import { prisma } from "../infra/prisma.js";
import {
  csosnCodes,
  icmsCstCodes,
  pisCofinsCstCodes,
  getIbsCbsRule,
  resolvePisCofinsRates,
  validateIbsCbsClassification,
  validateRevenueNature,
} from "../fiscal/catalogs.js";
import {
  authenticate,
  requireTenantRoles,
  tenantContext,
} from "../security/auth.js";

const regimes = ["SIMPLES_NACIONAL", "LUCRO_PRESUMIDO", "LUCRO_REAL"] as const;
const classifications = [
  "LISTA_POSITIVA",
  "LISTA_NEGATIVA",
  "LISTA_NEUTRA",
  "MONOFASICO",
  "TRIBUTACAO_NORMAL",
] as const;
const rate = z.number().min(0).max(1);
const toJson = (value: unknown) =>
  JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;

const fiscalRuleSchema = z.object({
  cfop: z.string().regex(/^[0-9]{4}$/),
  cst_icms: z.string().refine((value) => icmsCstCodes.has(value), "CST ICMS ausente da tabela interna"),
  csosn: z
    .string()
    .refine((value) => csosnCodes.has(value), "CSOSN ausente da tabela interna")
    .nullable(),
  aliquota_icms: rate.default(0),
  mva: z.number().min(0).default(0),
  cst_pis_cofins: z.string().refine((value) => pisCofinsCstCodes.has(value), "CST PIS/COFINS ausente da tabela interna"),
  natureza_receita: z.string().max(20).nullable().default(null),
  aliquota_pis: rate.default(0),
  aliquota_cofins: rate.default(0),
  cst_ibs_cbs: z.string().min(2).max(5),
  cclass_trib: z.string().regex(/^[0-9]{6}$/),
  aliquota_cbs: rate.default(0),
  aliquota_ibs: rate.default(0),
  reducao_cbs: rate.default(0),
  reducao_ibs: rate.default(0),
  compensar_cbs_pis_cofins: z.boolean().default(false),
  metadata: z.record(z.unknown()).default({}),
});

const categorySchema = z
  .object({
    codigo: z.string().min(2).max(50),
    nome: z.string().min(2).max(120),
    descricao: z.string().max(500).default(""),
    ncm: z.string().regex(/^[0-9]{8}$/),
    cest: z
      .string()
      .regex(/^[0-9]{7}$/)
      .nullable()
      .default(null),
    classificacao: z.enum(classifications),
    versao_regra: z.string().min(1).max(30),
    vigencia_inicio: z.coerce.date(),
    vigencia_fim: z.coerce.date().nullable().default(null),
    status: z
      .enum(["DRAFT", "UNDER_REVIEW", "APPROVED", "EXPIRED"])
      .default("DRAFT"),
    referencias: z.array(z.record(z.unknown())).default([]),
    ativa: z.boolean().default(true),
    regras_por_regime: z.object({
      SIMPLES_NACIONAL: fiscalRuleSchema,
      LUCRO_PRESUMIDO: fiscalRuleSchema,
      LUCRO_REAL: fiscalRuleSchema,
    }),
  })
  .refine(
    (data) => !data.vigencia_fim || data.vigencia_fim >= data.vigencia_inicio,
    {
      message: "vigencia_fim deve ser posterior à vigencia_inicio",
      path: ["vigencia_fim"],
    },
  );

function fiscalCatalogErrors(category: z.infer<typeof categorySchema>) {
  const errors: string[] = [];
  for (const regime of regimes) {
    const rule = category.regras_por_regime[regime];
    if (!validateRevenueNature(category.ncm, rule.cst_pis_cofins, rule.natureza_receita)) {
      errors.push(`${regime}: natureza da receita incompatível com o CST e o NCM`);
    }
    if (!validateIbsCbsClassification(category.ncm, rule.cst_ibs_cbs, rule.cclass_trib)) {
      errors.push(`${regime}: cClassTrib incompatível com o CST IBS/CBS ou o NCM`);
    }
    const pisCofins = resolvePisCofinsRates(regime, rule.cst_pis_cofins, rule.natureza_receita);
    if (pisCofins && (Math.abs(rule.aliquota_pis - pisCofins.pis) > 0.000001 || Math.abs(rule.aliquota_cofins - pisCofins.cofins) > 0.000001)) {
      errors.push(`${regime}: alíquotas de PIS/COFINS divergentes do CST, natureza e regime`);
    }
    const reform = getIbsCbsRule(rule.cclass_trib);
    if (reform && (Math.abs(rule.aliquota_cbs - reform.cbsRate) > 0.000001 || Math.abs(rule.aliquota_ibs - reform.ibsRate) > 0.000001 || Math.abs(rule.reducao_cbs - reform.reduction) > 0.000001 || Math.abs(rule.reducao_ibs - reform.reduction) > 0.000001)) {
      errors.push(`${regime}: alíquotas ou reduções de IBS/CBS divergentes do cClassTrib e da vigência 2026`);
    }
  }
  return errors;
}

const lotSchema = z
  .object({
    codigo: z.string().min(1).max(60),
    quantidade: z.number().min(0),
    custo_unitario: z.number().min(0),
    data_fabricacao: z.coerce.date(),
    data_vencimento: z.coerce.date(),
  })
  .refine((data) => data.data_vencimento > data.data_fabricacao, {
    message: "data_vencimento deve ser posterior à data_fabricacao",
    path: ["data_vencimento"],
  });

const productSchema = z.object({
  ean: z.string().regex(/^[0-9]{8,14}$/),
  nome: z.string().min(2).max(180),
  principio_ativo: z.string().max(180).default(""),
  laboratorio: z.string().max(120).default(""),
  categoria_fiscal_id: z.string().uuid(),
  valor_entrada_unitario: z.number().min(0),
  preco_venda: z.number().min(0),
  estoque_atual: z.number().min(0).default(0),
  estoque_minimo_critico: z.number().min(0).default(0),
  media_venda_diaria: z.number().min(0).default(0),
  ativo: z.boolean().default(true),
  lote_inicial: lotSchema.optional(),
});

function validationError(reply: FastifyReply, error: z.ZodError) {
  return reply
    .status(400)
    .send({ erro: "CADASTRO_INVALIDO", detalhes: error.flatten() });
}

function mapRule(rule: z.infer<typeof fiscalRuleSchema>) {
  return {
    cfop: rule.cfop,
    cstIcms: rule.cst_icms,
    csosn: rule.csosn,
    icmsRate: rule.aliquota_icms,
    mvaRate: rule.mva,
    cstPis: rule.cst_pis_cofins,
    cstCofins: rule.cst_pis_cofins,
    cstPisCofins: rule.cst_pis_cofins,
    revenueNature: rule.natureza_receita,
    pisRate: rule.aliquota_pis,
    cofinsRate: rule.aliquota_cofins,
    cstIbsCbs: rule.cst_ibs_cbs,
    taxClassification: rule.cclass_trib,
    cClassTrib: rule.cclass_trib,
    cbsRate: rule.aliquota_cbs,
    ibsRate: rule.aliquota_ibs,
    cbsReduction: rule.reducao_cbs,
    ibsReduction: rule.reducao_ibs,
    offsetCbsPisCofins: rule.compensar_cbs_pis_cofins,
    metadata: toJson(rule.metadata),
  };
}

export async function cadastrosRoutes(app: FastifyInstance) {
  const tenantGuards = [authenticate, tenantContext];
  const writeGuards = [
    authenticate,
    tenantContext,
    requireTenantRoles(["OWNER", "ADMIN", "MANAGER", "PHARMACIST"]),
  ];

  app.get("/categorias", { preHandler: tenantGuards }, async (request) =>
    prisma.fiscalCategory.findMany({
      where: { companyId: request.tenant!.companyId },
      include: {
        rules: { orderBy: { regime: "asc" } },
        _count: { select: { products: true } },
      },
      orderBy: { name: "asc" },
    }),
  );

  app.post(
    "/categorias",
    { preHandler: writeGuards },
    async (request, reply) => {
      const parsed = categorySchema.safeParse(request.body);
      if (!parsed.success) return validationError(reply, parsed.error);
      const catalogErrors = fiscalCatalogErrors(parsed.data);
      if (catalogErrors.length) return reply.status(400).send({ erro: "REFERENCIA_FISCAL_INVALIDA", detalhes: catalogErrors });
      if (!parsed.data.regras_por_regime.SIMPLES_NACIONAL.csosn) {
        return reply.status(400).send({ erro: "CSOSN_OBRIGATORIO_NO_SIMPLES" });
      }

      const category = await prisma.$transaction(async (tx) => {
        const created = await tx.fiscalCategory.create({
          data: {
            companyId: request.tenant!.companyId,
            code: parsed.data.codigo,
            name: parsed.data.nome,
            description: parsed.data.descricao,
            ncm: parsed.data.ncm,
            cest: parsed.data.cest,
            classification: parsed.data.classificacao,
            ruleVersion: parsed.data.versao_regra,
            validFrom: parsed.data.vigencia_inicio,
            validUntil: parsed.data.vigencia_fim,
            status: parsed.data.status,
            sourceReferences: toJson(parsed.data.referencias),
            active: parsed.data.ativa,
            rules: {
              create: regimes.map((regime) => ({
                regime,
                ...mapRule(parsed.data.regras_por_regime[regime]),
              })),
            },
          },
          include: { rules: true },
        });
        await tx.auditLog.create({
          data: {
            companyId: request.tenant!.companyId,
            userId: request.user.sub,
            action: "CREATE",
            entity: "FISCAL_CATEGORY",
            entityId: created.id,
            after: toJson(created),
          },
        });
        return created;
      });
      return reply.status(201).send(category);
    },
  );

  app.put<{ Params: { id: string } }>(
    "/categorias/:id",
    { preHandler: writeGuards },
    async (request, reply) => {
      const id = z.string().uuid().safeParse(request.params.id);
      const parsed = categorySchema.safeParse(request.body);
      if (!id.success) return reply.status(400).send({ erro: "ID_INVALIDO" });
      if (!parsed.success) return validationError(reply, parsed.error);
      const catalogErrors = fiscalCatalogErrors(parsed.data);
      if (catalogErrors.length) return reply.status(400).send({ erro: "REFERENCIA_FISCAL_INVALIDA", detalhes: catalogErrors });
      if (!parsed.data.regras_por_regime.SIMPLES_NACIONAL.csosn) {
        return reply.status(400).send({ erro: "CSOSN_OBRIGATORIO_NO_SIMPLES" });
      }

      const existing = await prisma.fiscalCategory.findFirst({
        where: { id: id.data, companyId: request.tenant!.companyId },
      });
      if (!existing)
        return reply.status(404).send({ erro: "CATEGORIA_NAO_ENCONTRADA" });
      const category = await prisma.$transaction(async (tx) => {
        const updated = await tx.fiscalCategory.update({
          where: { id: id.data },
          data: {
            code: parsed.data.codigo,
            name: parsed.data.nome,
            description: parsed.data.descricao,
            ncm: parsed.data.ncm,
            cest: parsed.data.cest,
            classification: parsed.data.classificacao,
            ruleVersion: parsed.data.versao_regra,
            validFrom: parsed.data.vigencia_inicio,
            validUntil: parsed.data.vigencia_fim,
            status: parsed.data.status,
            sourceReferences: toJson(parsed.data.referencias),
            active: parsed.data.ativa,
          },
        });
        for (const regime of regimes) {
          const rule = mapRule(parsed.data.regras_por_regime[regime]);
          await tx.fiscalRule.upsert({
            where: { categoryId_regime: { categoryId: id.data, regime } },
            create: { categoryId: id.data, regime, ...rule },
            update: rule,
          });
        }
        await tx.auditLog.create({
          data: {
            companyId: request.tenant!.companyId,
            userId: request.user.sub,
            action: "UPDATE",
            entity: "FISCAL_CATEGORY",
            entityId: updated.id,
            before: toJson(existing),
            after: toJson(updated),
          },
        });
        return tx.fiscalCategory.findUnique({
          where: { id: updated.id },
          include: { rules: true },
        });
      });
      return reply.send(category);
    },
  );

  app.get("/produtos", { preHandler: tenantGuards }, async (request) =>
    prisma.product.findMany({
      where: { companyId: request.tenant!.companyId },
      include: {
        category: { include: { rules: true } },
        lots: { orderBy: { expiresAt: "asc" } },
      },
      orderBy: { name: "asc" },
    }),
  );

  app.post("/produtos", { preHandler: writeGuards }, async (request, reply) => {
    const parsed = productSchema.safeParse(request.body);
    if (!parsed.success) return validationError(reply, parsed.error);
    const category = await prisma.fiscalCategory.findFirst({
      where: {
        id: parsed.data.categoria_fiscal_id,
        companyId: request.tenant!.companyId,
        active: true,
      },
    });
    if (!category)
      return reply.status(409).send({ erro: "CATEGORIA_FISCAL_INVALIDA" });

    const product = await prisma.$transaction(async (tx) => {
      const created = await tx.product.create({
        data: {
          companyId: request.tenant!.companyId,
          categoryId: category.id,
          ean: parsed.data.ean,
          name: parsed.data.nome,
          activeIngredient: parsed.data.principio_ativo,
          laboratory: parsed.data.laboratorio,
          currentCost: parsed.data.valor_entrada_unitario,
          salePrice: parsed.data.preco_venda,
          stockQuantity:
            parsed.data.lote_inicial?.quantidade ?? parsed.data.estoque_atual,
          minimumStock: parsed.data.estoque_minimo_critico,
          dailySalesAverage: parsed.data.media_venda_diaria,
        },
      });
      if (parsed.data.lote_inicial) {
        const lot = await tx.inventoryLot.create({
          data: {
            productId: created.id,
            code: parsed.data.lote_inicial.codigo,
            manufacturedAt: parsed.data.lote_inicial.data_fabricacao,
            expiresAt: parsed.data.lote_inicial.data_vencimento,
            quantity: parsed.data.lote_inicial.quantidade,
            unitCost: parsed.data.lote_inicial.custo_unitario,
          },
        });
        if (parsed.data.lote_inicial.quantidade > 0) {
          await tx.stockMovement.create({
            data: {
              companyId: request.tenant!.companyId,
              productId: created.id,
              lotId: lot.id,
              type: "ENTRY",
              quantity: parsed.data.lote_inicial.quantidade,
              unitCost: parsed.data.lote_inicial.custo_unitario,
              originType: "INITIAL_REGISTRATION",
            },
          });
        }
      }
      await tx.auditLog.create({
        data: {
          companyId: request.tenant!.companyId,
          userId: request.user.sub,
          action: "CREATE",
          entity: "PRODUCT",
          entityId: created.id,
          after: toJson(created),
        },
      });
      return tx.product.findUnique({
        where: { id: created.id },
        include: { category: true, lots: true },
      });
    });
    return reply.status(201).send(product);
  });

  app.put<{ Params: { id: string } }>(
    "/produtos/:id",
    { preHandler: writeGuards },
    async (request, reply) => {
      const id = z.string().uuid().safeParse(request.params.id);
      const parsed = productSchema
        .omit({ lote_inicial: true })
        .safeParse(request.body);
      if (!id.success) return reply.status(400).send({ erro: "ID_INVALIDO" });
      if (!parsed.success) return validationError(reply, parsed.error);
      const [existing, category] = await Promise.all([
        prisma.product.findFirst({
          where: { id: id.data, companyId: request.tenant!.companyId },
        }),
        prisma.fiscalCategory.findFirst({
          where: {
            id: parsed.data.categoria_fiscal_id,
            companyId: request.tenant!.companyId,
            active: true,
          },
        }),
      ]);
      if (!existing)
        return reply.status(404).send({ erro: "PRODUTO_NAO_ENCONTRADO" });
      if (!category)
        return reply.status(409).send({ erro: "CATEGORIA_FISCAL_INVALIDA" });

      const product = await prisma.$transaction(async (tx) => {
        const updated = await tx.product.update({
          where: { id: existing.id },
          data: {
            categoryId: category.id,
            ean: parsed.data.ean,
            name: parsed.data.nome,
            activeIngredient: parsed.data.principio_ativo,
            laboratory: parsed.data.laboratorio,
            currentCost: parsed.data.valor_entrada_unitario,
            salePrice: parsed.data.preco_venda,
            stockQuantity: parsed.data.estoque_atual,
            minimumStock: parsed.data.estoque_minimo_critico,
            dailySalesAverage: parsed.data.media_venda_diaria,
            active: parsed.data.ativo,
          },
        });
        await tx.auditLog.create({
          data: {
            companyId: request.tenant!.companyId,
            userId: request.user.sub,
            action: "UPDATE",
            entity: "PRODUCT",
            entityId: updated.id,
            before: toJson(existing),
            after: toJson(updated),
          },
        });
        return updated;
      });
      return reply.send(product);
    },
  );
}
