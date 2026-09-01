import type { FastifyInstance, FastifyReply } from "fastify";
import { z } from "zod";
import type { Prisma } from "../generated/prisma/client.js";
import { prisma } from "../infra/prisma.js";
import {
  csosnCodes,
  icmsCstCodes,
  ibsCbsRules,
  pisCofinsCstCodes,
  revenueNatureRules,
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
import { tenantRolesAtLeast } from "../security/access-control.js";
import { incrementStoreBalance } from "../services/inventory-workflow.service.js";

const regimes = ["SIMPLES_NACIONAL", "LUCRO_PRESUMIDO", "LUCRO_REAL"] as const;
const classifications = [
  "LISTA_POSITIVA",
  "LISTA_NEGATIVA",
  "LISTA_NEUTRA",
  "MONOFASICO",
  "TRIBUTACAO_NORMAL",
] as const;
const salesStrategies = ["NORMAL", "FEATURED", "PROMOTION", "HIGH_MARGIN", "FAST_MOVING", "CLEARANCE", "EXPIRY_PRIORITY", "LAUNCH"] as const;
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
  )
  .refine(
    (data) => data.status !== "APPROVED" || data.referencias.length > 0,
    {
      message: "uma categoria aprovada exige ao menos uma referência legal",
      path: ["referencias"],
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

const productControlSchema = z.object({
  nivel: z.enum(["NONE", "PRESCRIPTION_PRESENTATION", "PRESCRIPTION_RETENTION", "SPECIAL_CONTROL"]).default("NONE"),
  identificar_comprador: z.boolean().default(false),
  exigir_prescricao: z.boolean().default(false),
  exigir_farmaceutico: z.boolean().default(false),
  reter_prescricao: z.boolean().default(false),
  idade_minima: z.number().int().min(0).max(130).nullable().default(null),
  versao_regra: z.string().max(30).nullable().default(null),
  base_legal: z.string().max(500).nullable().default(null),
  metadata: z.record(z.unknown()).default({}),
}).superRefine((control, context) => {
  if (control.reter_prescricao && !control.exigir_prescricao) context.addIssue({ code: z.ZodIssueCode.custom, message: "retenção exige prescrição", path: ["reter_prescricao"] });
  if (control.nivel === "NONE" && (control.identificar_comprador || control.exigir_prescricao || control.exigir_farmaceutico || control.reter_prescricao || control.idade_minima !== null)) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "selecione um nível de controle para ativar requisitos", path: ["nivel"] });
  }
  if (control.nivel !== "NONE" && (!control.versao_regra?.trim() || (control.base_legal?.trim().length ?? 0) < 10)) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "produto controlado exige versão e base legal", path: ["base_legal"] });
  }
});

const productSchema = z.object({
  ean: z.string().regex(/^[0-9]{8,14}$/),
  nome: z.string().min(2).max(180),
  principio_ativo: z.string().max(180).default(""),
  composicao: z.string().max(1000).optional(),
  laboratorio: z.string().max(120).default(""),
  registro_anvisa: z.string().trim().max(30).nullable().optional(),
  categoria_fiscal_id: z.string().uuid(),
  valor_entrada_unitario: z.number().min(0),
  preco_venda: z.number().min(0),
  estoque_atual: z.number().min(0).default(0),
  estoque_minimo_critico: z.number().min(0).default(0),
  media_venda_diaria: z.number().min(0).default(0),
  ativo: z.boolean().default(true),
  estrategia_comercial: z.object({
    tipo: z.enum(salesStrategies).default("NORMAL"),
    preco_promocional: z.number().min(0).nullable().default(null),
    inicio: z.coerce.date().nullable().default(null),
    fim: z.coerce.date().nullable().default(null),
    motivo: z.string().trim().max(500).nullable().default(null),
    metadata: z.record(z.unknown()).default({}),
  }).default({ tipo: "NORMAL", preco_promocional: null, inicio: null, fim: null, motivo: null, metadata: {} }),
  controle_venda: productControlSchema.default({
    nivel: "NONE", identificar_comprador: false, exigir_prescricao: false, exigir_farmaceutico: false,
    reter_prescricao: false, idade_minima: null, versao_regra: null, base_legal: null, metadata: {},
  }),
  lote_inicial: lotSchema.optional(),
});

function productBusinessErrors(product: z.infer<typeof productSchema>) {
  const errors: string[] = [];
  const strategy = product.estrategia_comercial;
  if (strategy.tipo === "PROMOTION" && strategy.preco_promocional === null) errors.push("promoção exige preço promocional");
  if (strategy.preco_promocional !== null && strategy.preco_promocional > product.preco_venda) errors.push("preço promocional não pode superar o preço de venda");
  if (strategy.inicio && strategy.fim && strategy.fim < strategy.inicio) errors.push("fim da estratégia deve ser posterior ao início");
  if (strategy.tipo !== "NORMAL" && (strategy.motivo?.length ?? 0) < 5) errors.push("estratégia comercial exige um motivo");
  return errors;
}

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
  const tenantGuards = [
    authenticate,
    tenantContext,
    requireTenantRoles(tenantRolesAtLeast("PRODUCTS", "VIEW")),
  ];
  const writeGuards = [
    authenticate,
    tenantContext,
    requireTenantRoles(tenantRolesAtLeast("PRODUCTS", "OPERATE")),
  ];

  app.get("/catalogos", { preHandler: tenantGuards }, async () => ({
    regimes,
    classificacoes: classifications,
    cst_pis_cofins: [...pisCofinsCstCodes].sort(),
    cst_icms: [...icmsCstCodes].sort(),
    csosn: [...csosnCodes].sort(),
    naturezas_receita: [...revenueNatureRules.entries()].map(([codigo, rule]) => ({ codigo, csts: rule.csts, prefixos_ncm: rule.ncmPrefixes })),
    cclass_trib: [...ibsCbsRules.entries()].map(([codigo, rule]) => ({ codigo, cst: rule.cst, prefixos_ncm: rule.ncmPrefixes, aliquota_cbs: rule.cbsRate, aliquota_ibs: rule.ibsRate, reducao: rule.reduction, exige_evidencia: Boolean(rule.requiresEvidence) })),
    estrategias_comerciais: salesStrategies,
  }));

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
      const duplicate = await prisma.fiscalCategory.findFirst({ where: { companyId: request.tenant!.companyId, code: parsed.data.codigo }, select: { id: true } });
      if (duplicate) return reply.status(409).send({ erro: "CODIGO_DA_CATEGORIA_JA_EXISTE" });

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
      const duplicate = await prisma.fiscalCategory.findFirst({ where: { companyId: request.tenant!.companyId, code: parsed.data.codigo, id: { not: id.data } }, select: { id: true } });
      if (duplicate) return reply.status(409).send({ erro: "CODIGO_DA_CATEGORIA_JA_EXISTE" });
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
    const businessErrors = productBusinessErrors(parsed.data);
    if (businessErrors.length) return reply.status(400).send({ erro: "ESTRATEGIA_COMERCIAL_INVALIDA", detalhes: businessErrors });
    const duplicate = await prisma.product.findFirst({ where: { companyId: request.tenant!.companyId, ean: parsed.data.ean }, select: { id: true } });
    if (duplicate) return reply.status(409).send({ erro: "EAN_JA_CADASTRADO" });
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
          composition: parsed.data.composicao ?? "",
          laboratory: parsed.data.laboratorio,
          anvisaRegistration: parsed.data.registro_anvisa ?? null,
          currentCost: parsed.data.valor_entrada_unitario,
          salePrice: parsed.data.preco_venda,
          stockQuantity:
            parsed.data.lote_inicial?.quantidade ?? parsed.data.estoque_atual,
          minimumStock: parsed.data.estoque_minimo_critico,
          dailySalesAverage: parsed.data.media_venda_diaria,
          active: parsed.data.ativo,
          salesStrategy: parsed.data.estrategia_comercial.tipo,
          promotionPrice: parsed.data.estrategia_comercial.preco_promocional,
          strategyStartsAt: parsed.data.estrategia_comercial.inicio,
          strategyEndsAt: parsed.data.estrategia_comercial.fim,
          strategyReason: parsed.data.estrategia_comercial.motivo,
          strategyMetadata: toJson(parsed.data.estrategia_comercial.metadata),
          strategyUpdatedAt: new Date(),
          controlLevel: parsed.data.controle_venda.nivel,
          requiresBuyerId: parsed.data.controle_venda.identificar_comprador,
          requiresPrescription: parsed.data.controle_venda.exigir_prescricao,
          requiresPharmacist: parsed.data.controle_venda.exigir_farmaceutico,
          retainsPrescription: parsed.data.controle_venda.reter_prescricao,
          minimumBuyerAge: parsed.data.controle_venda.idade_minima,
          controlRuleVersion: parsed.data.controle_venda.versao_regra,
          controlLegalBasis: parsed.data.controle_venda.base_legal,
          controlMetadata: toJson(parsed.data.controle_venda.metadata),
        },
      });
      if (parsed.data.lote_inicial) {
        const destinationStore = await tx.store.findFirst({ where: { companyId: request.tenant!.companyId, active: true, type: "MAIN" }, orderBy: { createdAt: "asc" } })
          ?? await tx.store.findFirst({ where: { companyId: request.tenant!.companyId, active: true }, orderBy: { createdAt: "asc" } });
        if (!destinationStore) throw new Error("LOJA_ATIVA_NAO_ENCONTRADA");
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
          await incrementStoreBalance(tx, { companyId: request.tenant!.companyId, storeId: destinationStore.id, productId: created.id, lotId: lot.id, quantity: parsed.data.lote_inicial.quantidade });
          await tx.stockMovement.create({
            data: {
              companyId: request.tenant!.companyId,
              storeId: destinationStore.id,
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
      const businessErrors = productBusinessErrors(parsed.data);
      if (businessErrors.length) return reply.status(400).send({ erro: "ESTRATEGIA_COMERCIAL_INVALIDA", detalhes: businessErrors });
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
      const duplicate = await prisma.product.findFirst({ where: { companyId: request.tenant!.companyId, ean: parsed.data.ean, id: { not: id.data } }, select: { id: true } });
      if (duplicate) return reply.status(409).send({ erro: "EAN_JA_CADASTRADO" });

      const product = await prisma.$transaction(async (tx) => {
        const updated = await tx.product.update({
          where: { id: existing.id },
          data: {
            categoryId: category.id,
            ean: parsed.data.ean,
            name: parsed.data.nome,
            activeIngredient: parsed.data.principio_ativo,
            composition: parsed.data.composicao ?? existing.composition,
            laboratory: parsed.data.laboratorio,
            anvisaRegistration: parsed.data.registro_anvisa ?? existing.anvisaRegistration,
            currentCost: parsed.data.valor_entrada_unitario,
            salePrice: parsed.data.preco_venda,
            minimumStock: parsed.data.estoque_minimo_critico,
            dailySalesAverage: parsed.data.media_venda_diaria,
            active: parsed.data.ativo,
            salesStrategy: parsed.data.estrategia_comercial.tipo,
            promotionPrice: parsed.data.estrategia_comercial.preco_promocional,
            strategyStartsAt: parsed.data.estrategia_comercial.inicio,
            strategyEndsAt: parsed.data.estrategia_comercial.fim,
            strategyReason: parsed.data.estrategia_comercial.motivo,
            strategyMetadata: toJson(parsed.data.estrategia_comercial.metadata),
            strategyUpdatedAt: new Date(),
            controlLevel: parsed.data.controle_venda.nivel,
            requiresBuyerId: parsed.data.controle_venda.identificar_comprador,
            requiresPrescription: parsed.data.controle_venda.exigir_prescricao,
            requiresPharmacist: parsed.data.controle_venda.exigir_farmaceutico,
            retainsPrescription: parsed.data.controle_venda.reter_prescricao,
            minimumBuyerAge: parsed.data.controle_venda.idade_minima,
            controlRuleVersion: parsed.data.controle_venda.versao_regra,
            controlLegalBasis: parsed.data.controle_venda.base_legal,
            controlMetadata: toJson(parsed.data.controle_venda.metadata),
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
