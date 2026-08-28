import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Prisma } from "../generated/prisma/client.js";
import { prisma } from "../infra/prisma.js";
import {
  authenticate,
  requireTenantRoles,
  tenantContext,
} from "../security/auth.js";
import { evaluateTaxExit } from "../services/tax-chain.service.js";

const creditTreatments = [
  "NOT_APPLICABLE",
  "ALLOWED",
  "PROHIBITED",
  "PENDING_REVIEW",
] as const;

const toJson = (value: unknown) =>
  JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;

const provenanceSchema = z
  .object({
    produto_id: z.string().uuid(),
    lote_id: z.string().uuid(),
    chave_acesso: z
      .string()
      .regex(/^[0-9]{44}$/)
      .nullable()
      .default(null),
    numero_item: z.number().int().positive().nullable().default(null),
    numero_documento: z.string().max(60).nullable().default(null),
    cnpj_fornecedor: z
      .string()
      .regex(/^[0-9]{14}$/)
      .nullable()
      .default(null),
    uf_origem: z.string().regex(/^[A-Z]{2}$/),
    uf_destino: z.string().regex(/^[A-Z]{2}$/),
    data_operacao: z.coerce.date(),
    quantidade: z.number().positive().max(10_000_000),
    cfop_entrada: z.string().regex(/^[0-9]{4}$/),
    cst_icms_entrada: z.string().min(2).max(3),
    csosn_entrada: z
      .string()
      .regex(/^[0-9]{3}$/)
      .nullable()
      .default(null),
    valor_icms: z.number().min(0).default(0),
    base_icms_st: z.number().min(0).default(0),
    valor_icms_st: z.number().min(0).default(0),
    valor_fcp_st: z.number().min(0).default(0),
    st_recolhido_anteriormente: z.boolean().default(false),
    cst_pis_cofins_entrada: z.string().regex(/^[0-9]{2}$/),
    valor_pis: z.number().min(0).default(0),
    valor_cofins: z.number().min(0).default(0),
    monofasico_aplicavel: z.boolean().default(false),
    natureza_receita: z.string().max(20).nullable().default(null),
    tratamento_credito_pis: z
      .enum(creditTreatments)
      .default("PENDING_REVIEW"),
    tratamento_credito_cofins: z
      .enum(creditTreatments)
      .default("PENDING_REVIEW"),
    cst_ibs_cbs_entrada: z.string().max(5).nullable().default(null),
    cclass_trib_entrada: z
      .string()
      .regex(/^[0-9]{6}$/)
      .nullable()
      .default(null),
    valor_cbs: z.number().min(0).default(0),
    valor_ibs: z.number().min(0).default(0),
    snapshot_original: z.record(z.unknown()).default({}),
    evidencias: z.array(z.record(z.unknown())).default([]),
    hash_origem: z.string().regex(/^[a-fA-F0-9]{64}$/),
    versao_regra: z.string().min(1).max(30),
  })
  .refine(
    (data) =>
      (data.chave_acesso === null && data.numero_item === null) ||
      (data.chave_acesso !== null && data.numero_item !== null),
    {
      message: "chave_acesso e numero_item devem ser informados juntos",
      path: ["chave_acesso"],
    },
  );

const approvalSchema = z.object({
  decisao: z.enum(["APPROVED", "REJECTED"]),
  observacao: z.string().max(1000).nullable().default(null),
});

const assessmentSchema = z.object({
  produto_id: z.string().uuid(),
  lote_id: z.string().uuid().nullable().default(null),
  quantidade: z.number().positive().max(10_000_000),
  valor_bruto: z.number().min(0).max(1_000_000_000),
  uf_destino: z
    .string()
    .regex(/^[A-Z]{2}$/)
    .nullable()
    .default(null),
  tipo_operacao: z.string().min(2).max(60).default("REVENDA_INTERNA"),
});

const dateQuerySchema = z.object({
  inicio: z.coerce.date().optional(),
  fim: z.coerce.date().optional(),
});

export async function taxTraceabilityRoutes(app: FastifyInstance) {
  const readGuards = [authenticate, tenantContext];
  const writeGuards = [
    authenticate,
    tenantContext,
    requireTenantRoles(["OWNER", "ADMIN", "MANAGER", "PHARMACIST"]),
  ];

  app.post("/entradas", { preHandler: writeGuards }, async (request, reply) => {
    const parsed = provenanceSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        erro: "RASTREABILIDADE_INVALIDA",
        detalhes: parsed.error.flatten(),
      });
    }
    const companyId = request.tenant!.companyId;
    const [product, lot] = await Promise.all([
      prisma.product.findFirst({
        where: { id: parsed.data.produto_id, companyId },
      }),
      prisma.inventoryLot.findFirst({
        where: {
          id: parsed.data.lote_id,
          productId: parsed.data.produto_id,
          product: { companyId },
        },
      }),
    ]);
    if (!product)
      return reply.status(404).send({ erro: "PRODUTO_NAO_ENCONTRADO" });
    if (!lot) return reply.status(404).send({ erro: "LOTE_NAO_ENCONTRADO" });

    if (parsed.data.chave_acesso && parsed.data.numero_item) {
      const duplicate = await prisma.taxProvenance.findUnique({
        where: {
          companyId_sourceAccessKey_sourceItemNumber: {
            companyId,
            sourceAccessKey: parsed.data.chave_acesso,
            sourceItemNumber: parsed.data.numero_item,
          },
        },
      });
      if (duplicate) {
        return reply.status(409).send({
          erro: "ITEM_FISCAL_JA_REGISTRADO",
          rastreabilidade_id: duplicate.id,
        });
      }
    }

    const created = await prisma
      .$transaction(async (tx) => {
      const tracked = await tx.taxProvenance.aggregate({
        where: {
          companyId,
          lotId: lot.id,
          status: { in: ["DRAFT", "UNDER_REVIEW", "APPROVED"] },
        },
        _sum: { remainingQuantity: true },
      });
      if (
        Number(tracked._sum.remainingQuantity ?? 0) + parsed.data.quantidade >
        Number(lot.quantity)
      ) {
        throw new Error("SALDO_FISCAL_SUPERIOR_AO_ESTOQUE_DO_LOTE");
      }
      const provenance = await tx.taxProvenance.create({
        data: {
          companyId,
          productId: parsed.data.produto_id,
          lotId: parsed.data.lote_id,
          sourceAccessKey: parsed.data.chave_acesso,
          sourceItemNumber: parsed.data.numero_item,
          sourceDocumentNumber: parsed.data.numero_documento,
          supplierTaxId: parsed.data.cnpj_fornecedor,
          originState: parsed.data.uf_origem,
          destinationState: parsed.data.uf_destino,
          operationDate: parsed.data.data_operacao,
          quantity: parsed.data.quantidade,
          remainingQuantity: parsed.data.quantidade,
          inputCfop: parsed.data.cfop_entrada,
          inputCstIcms: parsed.data.cst_icms_entrada,
          inputCsosn: parsed.data.csosn_entrada,
          icmsAmount: parsed.data.valor_icms,
          icmsStBase: parsed.data.base_icms_st,
          icmsStAmount: parsed.data.valor_icms_st,
          fcpStAmount: parsed.data.valor_fcp_st,
          stCollectedPreviously: parsed.data.st_recolhido_anteriormente,
          inputCstPisCofins: parsed.data.cst_pis_cofins_entrada,
          pisAmount: parsed.data.valor_pis,
          cofinsAmount: parsed.data.valor_cofins,
          monophaseApplicable: parsed.data.monofasico_aplicavel,
          revenueNature: parsed.data.natureza_receita,
          pisCreditTreatment: parsed.data.tratamento_credito_pis,
          cofinsCreditTreatment: parsed.data.tratamento_credito_cofins,
          inputCstIbsCbs: parsed.data.cst_ibs_cbs_entrada,
          inputCClassTrib: parsed.data.cclass_trib_entrada,
          cbsAmount: parsed.data.valor_cbs,
          ibsAmount: parsed.data.valor_ibs,
          rawTaxSnapshot: toJson(parsed.data.snapshot_original),
          evidence: toJson(parsed.data.evidencias),
          sourceHash: parsed.data.hash_origem.toLowerCase(),
          ruleVersion: parsed.data.versao_regra,
        },
      });
      await tx.auditLog.create({
        data: {
          companyId,
          userId: request.user.sub,
          action: "CREATE",
          entity: "TAX_PROVENANCE",
          entityId: provenance.id,
          requestId: request.id,
          after: {
            product_id: provenance.productId,
            lot_id: provenance.lotId,
            source_hash: provenance.sourceHash,
            status: provenance.status,
          },
        },
      });
      return provenance;
      }, { isolationLevel: "Serializable" })
      .catch((error: unknown) => {
        if (
          error instanceof Error &&
          error.message === "SALDO_FISCAL_SUPERIOR_AO_ESTOQUE_DO_LOTE"
        ) {
          return null;
        }
        throw error;
      });
    if (!created) {
      return reply.status(409).send({
        erro: "SALDO_FISCAL_SUPERIOR_AO_ESTOQUE_DO_LOTE",
      });
    }
    return reply.status(201).send(created);
  });

  app.put<{ Params: { id: string } }>(
    "/entradas/:id/revisao",
    { preHandler: writeGuards },
    async (request, reply) => {
      const id = z.string().uuid().safeParse(request.params.id);
      const parsed = approvalSchema.safeParse(request.body);
      if (!id.success || !parsed.success)
        return reply.status(400).send({ erro: "REVISAO_INVALIDA" });
      const companyId = request.tenant!.companyId;
      const provenance = await prisma.taxProvenance.findFirst({
        where: { id: id.data, companyId },
      });
      if (!provenance)
        return reply
          .status(404)
          .send({ erro: "RASTREABILIDADE_NAO_ENCONTRADA" });
      if (!["DRAFT", "UNDER_REVIEW"].includes(provenance.status)) {
        return reply
          .status(409)
          .send({ erro: "RASTREABILIDADE_JA_CONCLUIDA" });
      }
      const evidence = Array.isArray(provenance.evidence)
        ? provenance.evidence
        : [];
      if (parsed.data.decisao === "APPROVED") {
        const errors: string[] = [];
        if (!evidence.length) errors.push("EVIDENCIA_FISCAL_OBRIGATORIA");
        if (
          provenance.monophaseApplicable &&
          (provenance.pisCreditTreatment !== "PROHIBITED" ||
            provenance.cofinsCreditTreatment !== "PROHIBITED")
        ) {
          errors.push("CREDITO_MONOFASICO_DEVE_SER_PROIBIDO");
        }
        if (
          provenance.monophaseApplicable &&
          !provenance.revenueNature
        ) {
          errors.push("NATUREZA_RECEITA_MONOFASICA_OBRIGATORIA");
        }
        if (errors.length)
          return reply
            .status(409)
            .send({ erro: "APROVACAO_FISCAL_BLOQUEADA", motivos: errors });
      }

      const updated = await prisma.$transaction(async (tx) => {
        const result = await tx.taxProvenance.update({
          where: { id: provenance.id },
          data: {
            status: parsed.data.decisao,
            approvedById:
              parsed.data.decisao === "APPROVED" ? request.user.sub : null,
            approvedAt:
              parsed.data.decisao === "APPROVED" ? new Date() : null,
          },
        });
        await tx.auditLog.create({
          data: {
            companyId,
            userId: request.user.sub,
            action: parsed.data.decisao === "APPROVED" ? "APPROVE" : "REJECT",
            entity: "TAX_PROVENANCE",
            entityId: provenance.id,
            requestId: request.id,
            before: { status: provenance.status },
            after: {
              status: result.status,
              observacao: parsed.data.observacao,
            },
          },
        });
        return result;
      });
      return reply.send(updated);
    },
  );

  app.post(
    "/avaliacoes-saida",
    { preHandler: writeGuards },
    async (request, reply) => {
      const parsed = assessmentSchema.safeParse(request.body);
      if (!parsed.success)
        return reply.status(400).send({
          erro: "AVALIACAO_INVALIDA",
          detalhes: parsed.error.flatten(),
        });
      const companyId = request.tenant!.companyId;
      const product = await prisma.product.findFirst({
        where: { id: parsed.data.produto_id, companyId, active: true },
        include: {
          company: true,
          category: { include: { rules: true } },
          lots: {
            where: parsed.data.lote_id
              ? { id: parsed.data.lote_id }
              : { quantity: { gt: 0 }, expiresAt: { gt: new Date() } },
            orderBy: { expiresAt: "asc" },
            include: {
              taxProvenances: {
                where: { status: "APPROVED", remainingQuantity: { gt: 0 } },
                orderBy: [{ operationDate: "asc" }, { createdAt: "asc" }],
              },
            },
          },
        },
      });
      if (!product)
        return reply.status(404).send({ erro: "PRODUTO_NAO_ENCONTRADO" });
      const rule = product.category.rules.find(
        (candidate) => candidate.regime === product.company.taxRegime,
      );
      if (!rule)
        return reply.status(409).send({ erro: "REGRA_FISCAL_INCOMPLETA" });
      const lot = product.lots[0] ?? null;
      const provenance =
        lot?.taxProvenances.find(
          (candidate) =>
            Number(candidate.remainingQuantity) >= parsed.data.quantidade,
        ) ?? null;
      const destinationState =
        parsed.data.uf_destino ?? product.company.state ?? null;
      const evaluation = evaluateTaxExit({
        productId: product.id,
        lotId: lot?.id ?? null,
        classification: product.category.classification,
        regime: product.company.taxRegime,
        operationType: parsed.data.tipo_operacao,
        originState: product.company.state,
        destinationState,
        quantity: parsed.data.quantidade,
        grossAmount: parsed.data.valor_bruto,
        output: {
          cfop: rule.cfop,
          cstIcms: rule.cstIcms,
          csosn: rule.csosn,
          cstPisCofins: rule.cstPisCofins,
          revenueNature: rule.revenueNature,
          cstIbsCbs: rule.cstIbsCbs,
          cClassTrib: rule.cClassTrib,
          icmsRate: Number(rule.icmsRate),
          pisRate: Number(rule.pisRate),
          cofinsRate: Number(rule.cofinsRate),
          cbsRate: Number(rule.cbsRate),
          ibsRate: Number(rule.ibsRate),
          ruleVersion: product.category.ruleVersion,
        },
        provenance: provenance
          ? {
              id: provenance.id,
              status: provenance.status,
              stCollectedPreviously: provenance.stCollectedPreviously,
              monophaseApplicable: provenance.monophaseApplicable,
              pisCreditTreatment: provenance.pisCreditTreatment,
              cofinsCreditTreatment: provenance.cofinsCreditTreatment,
              evidence: provenance.evidence,
              ruleVersion: provenance.ruleVersion,
            }
          : null,
      });

      const assessment = await prisma.$transaction(async (tx) => {
        const created = await tx.taxExitAssessment.create({
          data: {
            companyId,
            productId: product.id,
            lotId: lot?.id,
            provenanceId: provenance?.id,
            requestedById: request.user.sub,
            requestId: request.id,
            status: evaluation.status,
            operationType: parsed.data.tipo_operacao,
            originState: product.company.state,
            destinationState,
            quantity: parsed.data.quantidade,
            grossAmount: parsed.data.valor_bruto,
            outputCfop: rule.cfop,
            outputCstIcms: rule.cstIcms,
            outputCsosn: rule.csosn,
            outputCstPisCofins: rule.cstPisCofins,
            outputRevenueNature: rule.revenueNature,
            outputCstIbsCbs: rule.cstIbsCbs,
            outputCClassTrib: rule.cClassTrib,
            icmsRate: rule.icmsRate,
            pisRate: rule.pisRate,
            cofinsRate: rule.cofinsRate,
            cbsRate: rule.cbsRate,
            ibsRate: rule.ibsRate,
            preventedTaxAmount: evaluation.preventedTaxAmount,
            findings: toJson(evaluation.findings),
            evidence: toJson(evaluation.evidence),
            ruleVersion: product.category.ruleVersion,
            decisionHash: evaluation.decisionHash,
          },
        });
        await tx.auditLog.create({
          data: {
            companyId,
            userId: request.user.sub,
            action: "EVALUATE",
            entity: "TAX_EXIT_ASSESSMENT",
            entityId: created.id,
            requestId: request.id,
            after: {
              status: evaluation.status,
              decision_hash: evaluation.decisionHash,
              prevented_tax_amount: evaluation.preventedTaxAmount,
              findings: evaluation.findings,
            },
          },
        });
        return created;
      });
      return reply.status(201).send({ assessment, evaluation });
    },
  );

  app.get<{ Params: { productId: string } }>(
    "/produtos/:productId",
    { preHandler: readGuards },
    async (request, reply) => {
      const productId = z.string().uuid().safeParse(request.params.productId);
      if (!productId.success)
        return reply.status(400).send({ erro: "PRODUTO_INVALIDO" });
      const companyId = request.tenant!.companyId;
      const product = await prisma.product.findFirst({
        where: { id: productId.data, companyId },
        select: { id: true, ean: true, name: true },
      });
      if (!product)
        return reply.status(404).send({ erro: "PRODUTO_NAO_ENCONTRADO" });
      const [entries, assessments] = await Promise.all([
        prisma.taxProvenance.findMany({
          where: { companyId, productId: product.id },
          include: { lot: { select: { id: true, code: true, expiresAt: true } } },
          orderBy: [{ operationDate: "desc" }, { createdAt: "desc" }],
        }),
        prisma.taxExitAssessment.findMany({
          where: { companyId, productId: product.id },
          orderBy: { evaluatedAt: "desc" },
          take: 100,
        }),
      ]);
      return { product, entries, assessments };
    },
  );

  app.get(
    "/resumo",
    { preHandler: readGuards },
    async (request, reply) => {
      const parsed = dateQuerySchema.safeParse(request.query);
      if (!parsed.success)
        return reply.status(400).send({ erro: "PERIODO_INVALIDO" });
      const companyId = request.tenant!.companyId;
      const evaluatedAt = {
        ...(parsed.data.inicio ? { gte: parsed.data.inicio } : {}),
        ...(parsed.data.fim ? { lte: parsed.data.fim } : {}),
      };
      const assessmentWhere = {
        companyId,
        ...(Object.keys(evaluatedAt).length ? { evaluatedAt } : {}),
      };
      const auditCreatedAt = {
        ...(parsed.data.inicio ? { gte: parsed.data.inicio } : {}),
        ...(parsed.data.fim ? { lte: parsed.data.fim } : {}),
      };
      const [
        provenanceByStatus,
        assessmentByStatus,
        prevented,
        blockedSaleAttempts,
      ] =
        await Promise.all([
          prisma.taxProvenance.groupBy({
            by: ["status"],
            where: { companyId },
            _count: { _all: true },
            _sum: { remainingQuantity: true },
          }),
          prisma.taxExitAssessment.groupBy({
            by: ["status"],
            where: assessmentWhere,
            _count: { _all: true },
          }),
          prisma.taxExitAssessment.aggregate({
            where: assessmentWhere,
            _sum: { preventedTaxAmount: true },
          }),
          prisma.auditLog.findMany({
            where: {
              companyId,
              entity: "SALE_TAX_GUARD",
              action: "BLOCK",
              ...(Object.keys(auditCreatedAt).length
                ? { createdAt: auditCreatedAt }
                : {}),
            },
            select: { after: true },
          }),
        ]);
      const blockedAttemptAmount = blockedSaleAttempts.reduce(
        (total, audit) => {
          if (!audit.after || typeof audit.after !== "object") return total;
          const evaluations = (audit.after as Record<string, unknown>)[
            "evaluations"
          ];
          if (!Array.isArray(evaluations)) return total;
          return (
            total +
            evaluations.reduce((subtotal: number, evaluation: unknown) => {
              if (!evaluation || typeof evaluation !== "object")
                return subtotal;
              const amount = (evaluation as Record<string, unknown>)[
                "preventedTaxAmount"
              ];
              return subtotal + (typeof amount === "number" ? amount : 0);
            }, 0)
          );
        },
        0,
      );
      return {
        proveniencias: provenanceByStatus,
        avaliacoes: assessmentByStatus,
        tentativas_venda_bloqueadas: blockedSaleAttempts.length,
        potencial_tributo_duplicado_bloqueado:
          Number(prevented._sum.preventedTaxAmount ?? 0) +
          blockedAttemptAmount,
        observacao:
          "O valor bloqueado é potencial e somente vira economia confirmada após revisão fiscal.",
      };
    },
  );
}
