import { createHash } from "node:crypto";
import type { Prisma, TaxRegime } from "../generated/prisma/client.js";
import { prisma } from "../infra/prisma.js";
import { officialSourceUrl } from "./nfce-governance.service.js";

const fiscalCatalogRequirements = [
  { code: "NCM", alternatives: ["NCM"] },
  { code: "CEST", alternatives: ["CEST"] },
  { code: "CST_ICMS", alternatives: ["CST_ICMS"] },
  { code: "CSOSN", alternatives: ["CSOSN"] },
  { code: "CST_PIS_COFINS", alternatives: ["CST_PIS_COFINS", "PIS_COFINS"] },
  { code: "NATUREZA_RECEITA", alternatives: ["NATUREZA_RECEITA"] },
  { code: "CCLASS_TRIB", alternatives: ["CCLASS_TRIB"] },
  { code: "ALIQUOTAS_IBS_CBS", alternatives: ["ALIQUOTAS_IBS_CBS", "ALIQUOTAS_CBS"] },
  { code: "DF_ICMS_ST", alternatives: ["DF_ICMS_ST"] },
  { code: "DF_MVA", alternatives: ["DF_MVA"] },
  { code: "DF_FCP", alternatives: ["DF_FCP"] },
  { code: "DF_REDUCOES", alternatives: ["DF_REDUCOES"] },
  { code: "DF_BENEFICIOS", alternatives: ["DF_BENEFICIOS"] },
] as const;

type HealthSeverity = "INFO" | "WARNING" | "CRITICAL";
type HealthIssue = {
  id: string;
  scope: "CATALOG" | "DF_MATRIX";
  severity: HealthSeverity;
  code: string;
  title: string;
  detail: string;
  catalog?: string;
  entityId?: string;
};

export type DfMatrixImportRow = {
  code: string;
  name: string;
  originState?: string | null;
  regime: TaxRegime;
  operationType: string;
  ncmPattern: string;
  cestPattern?: string | null;
  priority?: number;
  conditions?: Record<string, unknown>;
  outcome: Record<string, unknown>;
  validFrom: string;
  validUntil?: string | null;
};

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") {
    const object = value as Record<string, unknown>;
    return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${stable(object[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function sha256(value: unknown) {
  return createHash("sha256").update(stable(value)).digest("hex");
}

function toJson(value: unknown) {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function day(value: string | null | undefined) {
  return value ? new Date(`${value}T00:00:00.000Z`) : null;
}

function jsonObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function validatePercentage(value: unknown, field: string, maximum = 100) {
  if (value === undefined || value === null) return;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > maximum) {
    throw new Error(`MATRIZ_DF_${field.toUpperCase()}_INVALIDA`);
  }
}

function validateDfOutcome(outcome: Record<string, unknown>) {
  const icms = jsonObject(outcome.icms);
  if (!icms || typeof icms.st !== "boolean") throw new Error("MATRIZ_DF_RESULTADO_ICMS_INCOMPLETO");
  if (!icms.cst && !icms.csosn) throw new Error("MATRIZ_DF_CST_OU_CSOSN_OBRIGATORIO");
  validatePercentage(icms.aliquota, "aliquota");
  validatePercentage(icms.fcp, "fcp");
  validatePercentage(icms.reducaoBase, "reducao_base");
  validatePercentage(icms.mvaOriginal, "mva_original", 1000);
  validatePercentage(icms.mvaAjustada, "mva_ajustada", 1000);
}

function hasOfficialSources(value: unknown) {
  if (!Array.isArray(value) || value.length === 0) return false;
  return value.every((source) => {
    const object = jsonObject(source);
    if (!object || typeof object.url !== "string" || typeof object.reference !== "string" || !object.reference.trim()) return false;
    try { officialSourceUrl(object.url); return true; } catch { return false; }
  });
}

function periodsOverlap(leftStart: Date, leftEnd: Date | null, rightStart: Date, rightEnd: Date | null) {
  const leftLimit = leftEnd?.getTime() ?? Number.POSITIVE_INFINITY;
  const rightLimit = rightEnd?.getTime() ?? Number.POSITIVE_INFINITY;
  return leftStart.getTime() <= rightLimit && rightStart.getTime() <= leftLimit;
}

export async function fiscalCatalogHealth() {
  const now = new Date();
  const warningLimit = new Date(now.getTime() + 45 * 24 * 60 * 60 * 1000);
  const [releases, entries, dfRules] = await Promise.all([
    prisma.fiscalCatalogRelease.findMany({
      include: { _count: { select: { entries: true } }, importedBy: { select: { name: true } }, reviewedBy: { select: { name: true } } },
      orderBy: [{ catalog: "asc" }, { createdAt: "desc" }],
    }),
    prisma.fiscalCatalogEntry.findMany({ where: { active: true }, select: { id: true, catalog: true, code: true, ncmPatterns: true, validFrom: true, validUntil: true } }),
    prisma.fiscalMatrixRule.findMany({
      where: { companyId: null, destinationState: "DF" },
      include: { importedBy: { select: { name: true } }, reviewedBy: { select: { name: true } } },
      orderBy: [{ status: "asc" }, { ncmPattern: "asc" }, { priority: "desc" }],
    }),
  ]);
  const issues: HealthIssue[] = [];
  const activeCatalogs = new Set(releases.filter((release) => release.status === "ACTIVE").map((release) => release.catalog));

  for (const requirement of fiscalCatalogRequirements) {
    if (!requirement.alternatives.some((catalog) => activeCatalogs.has(catalog))) {
      issues.push({ id: `missing:${requirement.code}`, scope: "CATALOG", severity: "CRITICAL", code: "CATALOG_NOT_ACTIVE", title: `${requirement.code} sem versão ativa`, detail: "Importe uma fonte oficial, revise a diferença e faça a homologação em quatro olhos.", catalog: requirement.code });
    }
  }
  for (const release of releases) {
    if (release._count.entries !== release.itemCount) {
      issues.push({ id: `count:${release.id}`, scope: "CATALOG", severity: "CRITICAL", code: "ITEM_COUNT_MISMATCH", title: `Contagem divergente em ${release.catalog}`, detail: `Manifesto informa ${release.itemCount}; banco contém ${release._count.entries}.`, catalog: release.catalog, entityId: release.id });
    }
    if (release.status === "ACTIVE" && (!release.payloadHash || !release.sourcePublishedAt || !release.reviewedById)) {
      issues.push({ id: `evidence:${release.id}`, scope: "CATALOG", severity: "CRITICAL", code: "MISSING_EVIDENCE", title: `Evidência incompleta em ${release.catalog}`, detail: "Versão ativa precisa ter publicação, hash e responsável pela revisão.", catalog: release.catalog, entityId: release.id });
    }
  }
  for (const entry of entries) {
    if (entry.validUntil && entry.validUntil < now) {
      issues.push({ id: `expired-entry:${entry.id}`, scope: "CATALOG", severity: "CRITICAL", code: "ENTRY_EXPIRED", title: `${entry.catalog} ${entry.code} vencido`, detail: `Vigência terminou em ${entry.validUntil.toISOString().slice(0, 10)}.`, catalog: entry.catalog, entityId: entry.id });
    } else if (entry.validUntil && entry.validUntil <= warningLimit) {
      issues.push({ id: `expiring-entry:${entry.id}`, scope: "CATALOG", severity: "WARNING", code: "ENTRY_EXPIRING", title: `${entry.catalog} ${entry.code} próximo do vencimento`, detail: `Vigência termina em ${entry.validUntil.toISOString().slice(0, 10)}.`, catalog: entry.catalog, entityId: entry.id });
    }
  }
  const patternOwners = new Map<string, string>();
  for (const entry of entries) {
    const patterns = Array.isArray(entry.ncmPatterns) ? entry.ncmPatterns.filter((value): value is string => typeof value === "string") : [];
    for (const pattern of patterns) {
      const key = `${entry.catalog}:${pattern}`;
      const owner = patternOwners.get(key);
      if (owner && owner !== entry.code) {
        issues.push({ id: `pattern:${key}:${entry.code}`, scope: "CATALOG", severity: "WARNING", code: "NCM_PATTERN_CONFLICT", title: `NCM ${pattern} repetido em ${entry.catalog}`, detail: `O padrão aparece nos códigos ${owner} e ${entry.code}; exige revisão humana.`, catalog: entry.catalog, entityId: entry.id });
      } else patternOwners.set(key, entry.code);
    }
  }
  for (const rule of dfRules) {
    if (rule.status === "APPROVED" && rule.validUntil && rule.validUntil < now) {
      issues.push({ id: `expired-rule:${rule.id}`, scope: "DF_MATRIX", severity: "CRITICAL", code: "RULE_EXPIRED", title: `${rule.code} continua aprovada após o fim da vigência`, detail: `A regra venceu em ${rule.validUntil.toISOString().slice(0, 10)} e deve ser substituída ou expirada.`, entityId: rule.id });
    }
    if (rule.status === "APPROVED" && (!rule.evidenceHash || !rule.reviewedById || !hasOfficialSources(rule.sourceReferences))) {
      issues.push({ id: `rule-evidence:${rule.id}`, scope: "DF_MATRIX", severity: "CRITICAL", code: "RULE_MISSING_EVIDENCE", title: `${rule.code} sem evidência oficial completa`, detail: "Regra aprovada exige fonte governamental, referência legal, hash e revisor.", entityId: rule.id });
    }
  }
  const approved = dfRules.filter((rule) => rule.status === "APPROVED");
  for (let leftIndex = 0; leftIndex < approved.length; leftIndex += 1) {
    const left = approved[leftIndex];
    if (!left) continue;
    for (let rightIndex = leftIndex + 1; rightIndex < approved.length; rightIndex += 1) {
      const right = approved[rightIndex];
      if (!right) continue;
      const sameScope = left.regime === right.regime && left.operationType === right.operationType && left.originState === right.originState && left.ncmPattern === right.ncmPattern && left.cestPattern === right.cestPattern;
      if (sameScope && periodsOverlap(left.validFrom, left.validUntil, right.validFrom, right.validUntil) && stable(left.outcome) !== stable(right.outcome)) {
        issues.push({ id: `rule-conflict:${left.id}:${right.id}`, scope: "DF_MATRIX", severity: "CRITICAL", code: "RULE_CONFLICT", title: `Conflito entre ${left.code} e ${right.code}`, detail: "Mesmo recorte fiscal e vigência sobreposta possuem resultados diferentes.", entityId: left.id });
      }
    }
  }

  const critical = issues.filter((issue) => issue.severity === "CRITICAL").length;
  const warning = issues.filter((issue) => issue.severity === "WARNING").length;
  return {
    generatedAt: now,
    readyForProduction: critical === 0,
    indicators: {
      requiredCatalogs: fiscalCatalogRequirements.length,
      activeCatalogs: fiscalCatalogRequirements.filter((item) => item.alternatives.some((catalog) => activeCatalogs.has(catalog))).length,
      releasesUnderReview: releases.filter((release) => release.status === "UNDER_REVIEW").length,
      approvedDfRules: approved.length,
      dfRulesUnderReview: dfRules.filter((rule) => rule.status === "UNDER_REVIEW").length,
      critical,
      warning,
    },
    requirements: fiscalCatalogRequirements.map((requirement) => ({ ...requirement, ready: requirement.alternatives.some((catalog) => activeCatalogs.has(catalog)) })),
    releases,
    dfRules,
    issues,
  };
}

export async function importDfFiscalMatrix(input: {
  sourceVersion: string;
  sourceUrl: string;
  sourcePublishedAt: string;
  sourceReference: string;
  notes?: string | null;
  rows: DfMatrixImportRow[];
  userId: string;
  requestId: string;
}) {
  const url = officialSourceUrl(input.sourceUrl);
  const normalized = input.rows.map((row) => {
    const ncmPattern = row.ncmPattern.replace(/\D/g, "");
    const cestPattern = row.cestPattern?.replace(/\D/g, "") || null;
    if (!/^[0-9]{2,8}$/.test(ncmPattern) || (cestPattern && !/^[0-9]{2,7}$/.test(cestPattern))) throw new Error("MATRIZ_DF_NCM_CEST_INVALIDO");
    const validFrom = day(row.validFrom);
    const validUntil = day(row.validUntil);
    if (!validFrom || (validUntil && validUntil < validFrom)) throw new Error("MATRIZ_DF_VIGENCIA_INVALIDA");
    validateDfOutcome(row.outcome);
    return {
      code: row.code.trim().toUpperCase(), name: row.name.trim(), originState: row.originState?.trim().toUpperCase() || null,
      destinationState: "DF", regime: row.regime, operationType: row.operationType.trim().toUpperCase(), ncmPattern, cestPattern,
      priority: row.priority ?? 100, conditions: row.conditions ?? {}, outcome: row.outcome,
      ruleVersion: input.sourceVersion.trim(), validFrom, validUntil,
    };
  });
  if (new Set(normalized.map((row) => row.code)).size !== normalized.length) throw new Error("MATRIZ_DF_CODIGO_DUPLICADO");
  const evidenceHash = sha256({ sourceVersion: input.sourceVersion, sourceUrl: url, sourcePublishedAt: input.sourcePublishedAt, sourceReference: input.sourceReference, rows: normalized });
  const references = [{ title: "Matriz tributária oficial do Distrito Federal", url, publishedAt: input.sourcePublishedAt, reference: input.sourceReference, payloadHash: evidenceHash }];

  return prisma.$transaction(async (tx) => {
    const ruleIds: string[] = [];
    for (const row of normalized) {
      const existing = await tx.fiscalMatrixRule.findFirst({ where: { companyId: null, code: row.code, ruleVersion: row.ruleVersion } });
      if (existing?.status === "APPROVED") throw new Error("MATRIZ_DF_REGRA_APROVADA_IMUTAVEL");
      const data = {
        ...row, conditions: toJson(row.conditions), outcome: toJson(row.outcome), sourceReferences: toJson(references),
        evidenceHash, status: "UNDER_REVIEW" as const, importedById: input.userId, reviewedById: null, reviewedAt: null, reviewNotes: input.notes ?? null,
      };
      const saved = existing
        ? await tx.fiscalMatrixRule.update({ where: { id: existing.id }, data })
        : await tx.fiscalMatrixRule.create({ data: { companyId: null, ...data } });
      ruleIds.push(saved.id);
    }
    await tx.auditLog.create({ data: {
      userId: input.userId, action: "FISCAL_MATRIX_DF_IMPORTED", entity: "FiscalMatrixPackage", entityId: evidenceHash,
      requestId: input.requestId, after: toJson({ evidenceHash, sourceVersion: input.sourceVersion, sourceUrl: url, sourceReference: input.sourceReference, rules: ruleIds.length }),
    } });
    return { evidenceHash, rules: ruleIds.length, ruleIds, status: "UNDER_REVIEW" };
  }, { timeout: 30_000 });
}

export async function approveDfFiscalMatrixPackage(input: { evidenceHash: string; userId: string; requestId: string; reviewNotes: string }) {
  const rules = await prisma.fiscalMatrixRule.findMany({ where: { companyId: null, destinationState: "DF", evidenceHash: input.evidenceHash } });
  if (!rules.length) throw new Error("MATRIZ_DF_PACOTE_NAO_ENCONTRADO");
  if (rules.some((rule) => rule.status !== "UNDER_REVIEW")) throw new Error("MATRIZ_DF_PACOTE_FORA_DE_REVISAO");
  if (rules.some((rule) => !rule.importedById || rule.importedById === input.userId)) throw new Error("MATRIZ_DF_APROVACAO_QUATRO_OLHOS");
  for (const rule of rules) {
    if (!hasOfficialSources(rule.sourceReferences) || !rule.evidenceHash) throw new Error("MATRIZ_DF_EVIDENCIA_INCOMPLETA");
    validateDfOutcome(jsonObject(rule.outcome) ?? {});
    const conflicts = await prisma.fiscalMatrixRule.findMany({ where: {
      companyId: null, destinationState: "DF", status: "APPROVED", id: { notIn: rules.map((item) => item.id) },
      originState: rule.originState, regime: rule.regime, operationType: rule.operationType, ncmPattern: rule.ncmPattern, cestPattern: rule.cestPattern,
    } });
    if (conflicts.some((candidate) => periodsOverlap(rule.validFrom, rule.validUntil, candidate.validFrom, candidate.validUntil) && stable(rule.outcome) !== stable(candidate.outcome))) {
      throw new Error("MATRIZ_DF_CONFLITO_COM_REGRA_ATIVA");
    }
  }
  const now = new Date();
  const result = await prisma.$transaction(async (tx) => {
    const updated = await tx.fiscalMatrixRule.updateMany({ where: { id: { in: rules.map((rule) => rule.id) } }, data: { status: "APPROVED", reviewedById: input.userId, reviewedAt: now, reviewNotes: input.reviewNotes } });
    await tx.auditLog.create({ data: {
      userId: input.userId, action: "FISCAL_MATRIX_DF_APPROVED", entity: "FiscalMatrixPackage", entityId: input.evidenceHash,
      requestId: input.requestId, after: toJson({ evidenceHash: input.evidenceHash, rules: updated.count, reviewNotes: input.reviewNotes }),
    } });
    return updated.count;
  });
  return { evidenceHash: input.evidenceHash, approvedRules: result, reviewedAt: now };
}
