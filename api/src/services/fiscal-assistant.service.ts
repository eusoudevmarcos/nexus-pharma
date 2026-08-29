import { createHash } from "node:crypto";
import type { Prisma } from "../generated/prisma/client.js";
import { prisma } from "../infra/prisma.js";

const ENGINE_VERSION = "NEXUS_RULE_ENGINE_2026.08.1";

const toJson = (value: unknown) =>
  JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;

const asObject = (value: Prisma.JsonValue | null | undefined): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

const asArray = (value: Prisma.JsonValue | null | undefined): Prisma.JsonValue[] =>
  Array.isArray(value) ? value : [];

const stringValue = (value: unknown): string | null =>
  typeof value === "string" || typeof value === "number"
    ? String(value).trim() || null
    : null;

export type ConfidenceInput = {
  approvedCategory: boolean;
  hasFiscalRule: boolean;
  hasMatrixRule: boolean;
  hasLegalSources: boolean;
  hasOperationStates: boolean;
  hasProductComposition: boolean;
};

export function calculateFiscalSuggestionConfidence(input: ConfidenceInput) {
  let score = 0.15;
  if (input.approvedCategory) score += 0.25;
  if (input.hasFiscalRule) score += 0.2;
  if (input.hasMatrixRule) score += 0.15;
  if (input.hasLegalSources) score += 0.15;
  if (input.hasOperationStates) score += 0.05;
  if (input.hasProductComposition) score += 0.05;
  if (!input.hasLegalSources) score = Math.min(score, 0.49);
  return Math.min(0.95, Number(score.toFixed(4)));
}

export function fiscalSuggestionRisks(input: ConfidenceInput) {
  return [
    ...(!input.approvedCategory ? ["CATEGORY_NOT_APPROVED"] : []),
    ...(!input.hasFiscalRule ? ["TAX_REGIME_RULE_NOT_FOUND"] : []),
    ...(!input.hasMatrixRule ? ["UF_OPERATION_MATRIX_NOT_FOUND"] : []),
    ...(!input.hasLegalSources ? ["LEGAL_SOURCE_NOT_FOUND"] : []),
    ...(!input.hasOperationStates ? ["OPERATION_STATES_INCOMPLETE"] : []),
    ...(!input.hasProductComposition ? ["PRODUCT_COMPOSITION_NOT_INFORMED"] : []),
  ];
}

type NormalizedSource = {
  title: string;
  url: string | null;
  jurisdiction: string | null;
  publishedAt: Date | null;
  effectiveFrom: Date | null;
  sourceType: string;
  excerptHash: string;
  metadata: Record<string, unknown>;
};

function safeDate(value: unknown) {
  const normalized = stringValue(value);
  if (!normalized) return null;
  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function normalizeSources(values: Prisma.JsonValue[], sourceType: string): NormalizedSource[] {
  const seen = new Set<string>();
  return values.flatMap((value) => {
    const source = asObject(value);
    const title = stringValue(source.title ?? source.titulo ?? source.referencia);
    if (!title) return [];
    const url = stringValue(source.url ?? source.sourceUrl);
    const key = `${title}|${url ?? ""}`;
    if (seen.has(key)) return [];
    seen.add(key);
    return [{
      title,
      url,
      jurisdiction: stringValue(source.jurisdiction ?? source.jurisdicao),
      publishedAt: safeDate(source.publishedAt ?? source.publicado_em),
      effectiveFrom: safeDate(source.effectiveFrom ?? source.vigencia_inicio),
      sourceType,
      excerptHash: createHash("sha256").update(JSON.stringify(source)).digest("hex"),
      metadata: source,
    }];
  });
}

export async function generateAuditableFiscalSuggestion(input: {
  companyId: string;
  analysisId: string;
  userId: string;
}) {
  const analysis = await prisma.taxAnalysis.findFirst({
    where: { id: input.analysisId, companyId: input.companyId },
    include: {
      company: { select: { taxRegime: true, state: true } },
      category: { include: { rules: true } },
      product: { include: { category: { include: { rules: true } } } },
    },
  });
  if (!analysis) throw new Error("ANALISE_NAO_ENCONTRADA");
  if (["APPROVED", "REJECTED", "SUPERSEDED"].includes(analysis.status)) {
    throw new Error("ANALISE_FINALIZADA_NAO_PODE_SER_REPROCESSADA");
  }
  const category = analysis.category ?? analysis.product?.category ?? null;
  if (!category) throw new Error("ANALISE_SEM_CATEGORIA_FISCAL");

  const operationType = analysis.operationType ?? "SAIDA_REVENDA";
  const originState = analysis.originState ?? analysis.company.state;
  const destinationState = analysis.destinationState ?? analysis.company.state;
  const fiscalDate = new Date();
  const matrixRules = destinationState
    ? await prisma.fiscalMatrixRule.findMany({
        where: {
          OR: [{ companyId: null }, { companyId: input.companyId }],
          destinationState,
          regime: analysis.company.taxRegime,
          operationType,
          status: "APPROVED",
          validFrom: { lte: fiscalDate },
          AND: [{ OR: [{ validUntil: null }, { validUntil: { gte: fiscalDate } }] }],
        },
        orderBy: [{ priority: "desc" }, { ncmPattern: "desc" }],
      })
    : [];
  const matrixRule = matrixRules.find((rule) =>
    category.ncm.startsWith(rule.ncmPattern) &&
    (!rule.cestPattern || Boolean(category.cest?.startsWith(rule.cestPattern))) &&
    (!rule.originState || !originState || rule.originState === originState),
  );
  const fiscalRule = category.rules.find((rule) => rule.regime === analysis.company.taxRegime);
  const categorySources = normalizeSources(asArray(category.sourceReferences), "APPROVED_CATEGORY_SOURCE");
  const matrixSources = matrixRule
    ? normalizeSources(asArray(matrixRule.sourceReferences), "APPROVED_MATRIX_SOURCE")
    : [];
  const sources = [...categorySources, ...matrixSources].filter((source, index, entries) =>
    entries.findIndex((entry) => entry.excerptHash === source.excerptHash) === index,
  );
  const hasComposition = Object.keys(asObject(analysis.productComposition)).length > 0;
  const confidenceInput: ConfidenceInput = {
    approvedCategory: category.status === "APPROVED",
    hasFiscalRule: Boolean(fiscalRule),
    hasMatrixRule: Boolean(matrixRule),
    hasLegalSources: sources.length > 0,
    hasOperationStates: Boolean(originState && destinationState),
    hasProductComposition: hasComposition,
  };
  const confidence = calculateFiscalSuggestionConfidence(confidenceInput);
  const risks = fiscalSuggestionRisks(confidenceInput);
  const matrixOutcome = matrixRule ? asObject(matrixRule.outcome) : {};
  const suggestion = {
    engine: ENGINE_VERSION,
    generatedAt: new Date().toISOString(),
    requiresHumanReview: true,
    category: {
      id: category.id,
      name: category.name,
      ncm: category.ncm,
      cest: category.cest,
      classification: category.classification,
      ruleVersion: category.ruleVersion,
      status: category.status,
    },
    operation: { type: operationType, originState, destinationState, regime: analysis.company.taxRegime },
    tax: fiscalRule ? {
      cfop: stringValue(matrixOutcome.outputCfop ?? matrixOutcome.cfop) ?? fiscalRule.cfop,
      cstIcms: stringValue(matrixOutcome.cstIcms) ?? fiscalRule.cstIcms,
      csosn: stringValue(matrixOutcome.csosn) ?? fiscalRule.csosn,
      icmsRate: Number(fiscalRule.icmsRate),
      mvaRate: Number(fiscalRule.mvaRate),
      cstPisCofins: stringValue(matrixOutcome.cstPisCofins) ?? fiscalRule.cstPisCofins,
      revenueNature: stringValue(matrixOutcome.revenueNature) ?? fiscalRule.revenueNature,
      pisRate: Number(fiscalRule.pisRate),
      cofinsRate: Number(fiscalRule.cofinsRate),
      cstIbsCbs: stringValue(matrixOutcome.cstIbsCbs) ?? fiscalRule.cstIbsCbs,
      cClassTrib: stringValue(matrixOutcome.cClassTrib) ?? fiscalRule.cClassTrib,
      cbsRate: Number(fiscalRule.cbsRate),
      ibsRate: Number(fiscalRule.ibsRate),
    } : null,
    matrixRule: matrixRule ? { id: matrixRule.id, code: matrixRule.code, version: matrixRule.ruleVersion } : null,
    risks,
    citations: sources.map((source) => ({ title: source.title, url: source.url, jurisdiction: source.jurisdiction, effectiveFrom: source.effectiveFrom?.toISOString().slice(0, 10) ?? null })),
  };
  const reasoning = [
    `Sugestão local baseada na categoria ${category.name}, NCM ${category.ncm}, versão ${category.ruleVersion}.`,
    fiscalRule ? `Foi localizada regra para o regime ${analysis.company.taxRegime}.` : `Não foi localizada regra para o regime ${analysis.company.taxRegime}.`,
    matrixRule ? `A matriz ${matrixRule.code}, versão ${matrixRule.ruleVersion}, corresponde à operação ${operationType}.` : `Não há matriz aprovada correspondente à UF e operação informadas.`,
    sources.length ? `${sources.length} fonte(s) cadastrada(s) acompanham a recomendação.` : "Nenhuma fonte legal cadastrada foi localizada; a sugestão não pode ser aprovada.",
    "O resultado não altera cadastros ou tributação automaticamente.",
  ].join(" ");

  return prisma.$transaction(async (tx) => {
    await tx.taxAnalysis.update({ where: { id: analysis.id }, data: { status: "PROCESSING" } });
    await tx.taxEvidence.deleteMany({ where: { analysisId: analysis.id, sourceType: { in: ["APPROVED_CATEGORY_SOURCE", "APPROVED_MATRIX_SOURCE"] } } });
    for (const source of sources) {
      await tx.taxEvidence.create({ data: {
        analysisId: analysis.id,
        sourceType: source.sourceType,
        title: source.title,
        sourceUrl: source.url,
        jurisdiction: source.jurisdiction,
        publishedAt: source.publishedAt,
        effectiveFrom: source.effectiveFrom,
        excerptHash: source.excerptHash,
        metadata: toJson(source.metadata),
      } });
    }
    const updated = await tx.taxAnalysis.update({
      where: { id: analysis.id },
      data: {
        status: "NEEDS_REVIEW",
        suggestedClassification: toJson(suggestion),
        legalReasoning: reasoning,
        confidence,
        estimatedSavings: 0,
        reviewNotes: null,
        reviewedById: null,
        modelVersion: ENGINE_VERSION,
      },
      include: { evidence: true, product: true, category: true },
    });
    await tx.auditLog.create({ data: {
      companyId: input.companyId,
      userId: input.userId,
      action: "FISCAL_AI_SUGGESTION_GENERATED",
      entity: "TaxAnalysis",
      entityId: analysis.id,
      after: toJson({ engine: ENGINE_VERSION, confidence, risks, evidenceCount: sources.length, matrixRuleId: matrixRule?.id ?? null }),
    } });
    return updated;
  });
}

export async function decideAuditableFiscalSuggestion(input: {
  companyId: string;
  analysisId: string;
  userId: string;
  decision: "APPROVED" | "REJECTED";
  notes: string | null;
}) {
  const analysis = await prisma.taxAnalysis.findFirst({
    where: { id: input.analysisId, companyId: input.companyId },
    include: { _count: { select: { evidence: true } } },
  });
  if (!analysis) throw new Error("ANALISE_NAO_ENCONTRADA");
  if (analysis.status !== "NEEDS_REVIEW") throw new Error("ANALISE_NAO_AGUARDA_REVISAO");
  if (input.decision === "APPROVED") {
    if (!analysis.modelVersion?.startsWith("NEXUS_RULE_ENGINE_")) throw new Error("SUGESTAO_SEM_MOTOR_AUDITAVEL");
    if (!analysis.legalReasoning || Object.keys(asObject(analysis.suggestedClassification)).length === 0) throw new Error("SUGESTAO_INCOMPLETA");
    if (analysis._count.evidence === 0) throw new Error("SUGESTAO_SEM_FONTE_NAO_PODE_SER_APROVADA");
  }
  if (input.decision === "REJECTED" && (input.notes?.trim().length ?? 0) < 10) {
    throw new Error("REJEICAO_EXIGE_JUSTIFICATIVA");
  }
  return prisma.$transaction(async (tx) => {
    if (input.decision === "APPROVED") {
      await tx.taxAnalysis.updateMany({
        where: {
          companyId: input.companyId,
          id: { not: analysis.id },
          status: "APPROVED",
          OR: [
            ...(analysis.productId ? [{ productId: analysis.productId }] : []),
            ...(analysis.categoryId ? [{ categoryId: analysis.categoryId }] : []),
          ],
        },
        data: { status: "SUPERSEDED" },
      });
    }
    const updated = await tx.taxAnalysis.update({
      where: { id: analysis.id },
      data: { status: input.decision, reviewNotes: input.notes, reviewedById: input.userId },
      include: { evidence: true, product: true, category: true, reviewedBy: { select: { id: true, name: true } } },
    });
    await tx.auditLog.create({ data: {
      companyId: input.companyId,
      userId: input.userId,
      action: `FISCAL_AI_SUGGESTION_${input.decision}`,
      entity: "TaxAnalysis",
      entityId: analysis.id,
      before: toJson({ status: analysis.status }),
      after: toJson({ status: updated.status, notes: input.notes, engine: analysis.modelVersion }),
    } });
    return updated;
  });
}

export async function fiscalAssistantMetrics(companyId: string) {
  const analyses = await prisma.taxAnalysis.findMany({
    where: { companyId, modelVersion: { startsWith: "NEXUS_RULE_ENGINE_" } },
    select: { status: true, confidence: true, evidence: { select: { id: true } } },
  });
  const decided = analyses.filter((entry) => ["APPROVED", "REJECTED", "SUPERSEDED"].includes(entry.status));
  const approved = analyses.filter((entry) => ["APPROVED", "SUPERSEDED"].includes(entry.status)).length;
  const sourced = analyses.filter((entry) => entry.evidence.length > 0).length;
  const averageConfidence = analyses.length
    ? analyses.reduce((sum, entry) => sum + Number(entry.confidence ?? 0), 0) / analyses.length
    : 0;
  return {
    engine: ENGINE_VERSION,
    generated: analyses.length,
    awaitingReview: analyses.filter((entry) => entry.status === "NEEDS_REVIEW").length,
    approved,
    rejected: analyses.filter((entry) => entry.status === "REJECTED").length,
    humanAgreementRate: decided.length ? approved / decided.length : 0,
    sourceCoverageRate: analyses.length ? sourced / analyses.length : 0,
    averageConfidence: Number(averageConfidence.toFixed(4)),
    externalModelCost: 0,
  };
}
