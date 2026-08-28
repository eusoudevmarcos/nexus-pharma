import { createHash } from "node:crypto";

export type TaxFindingSeverity = "INFO" | "WARNING" | "BLOCKING";

export type TaxFinding = {
  code: string;
  severity: TaxFindingSeverity;
  message: string;
};

export type TaxCreditTreatmentValue =
  | "NOT_APPLICABLE"
  | "ALLOWED"
  | "PROHIBITED"
  | "PENDING_REVIEW";

export type TaxProvenanceSnapshot = {
  id: string;
  status: "DRAFT" | "UNDER_REVIEW" | "APPROVED" | "REJECTED" | "SUPERSEDED";
  stCollectedPreviously: boolean;
  monophaseApplicable: boolean;
  pisCreditTreatment: TaxCreditTreatmentValue;
  cofinsCreditTreatment: TaxCreditTreatmentValue;
  evidence: unknown;
  ruleVersion: string;
};

export type TaxExitEvaluationInput = {
  productId: string;
  lotId: string | null;
  classification: string;
  regime: string;
  operationType: string;
  originState: string | null;
  destinationState: string | null;
  quantity: number;
  grossAmount: number;
  output: {
    cfop: string;
    cstIcms: string;
    csosn: string | null;
    cstPisCofins: string;
    revenueNature: string | null;
    cstIbsCbs: string;
    cClassTrib: string;
    icmsRate: number;
    pisRate: number;
    cofinsRate: number;
    cbsRate: number;
    ibsRate: number;
    ruleVersion: string;
  };
  provenance: TaxProvenanceSnapshot | null;
};

export type TaxExitEvaluation = {
  status: "ALLOWED" | "NEEDS_REVIEW" | "BLOCKED";
  preventedTaxAmount: number;
  findings: TaxFinding[];
  evidence: unknown[];
  decisionHash: string;
};

const roundMoney = (value: number) =>
  Math.round((value + Number.EPSILON) * 100) / 100;

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, stableValue(child)]),
    );
  }
  return value;
}

function normalizeEvidence(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function isIcmsStExit(cstIcms: string, csosn: string | null) {
  return cstIcms.padStart(2, "0").slice(-2) === "60" || csosn === "500";
}

export function isHighRiskTaxRule(input: {
  classification: string;
  cstIcms: string;
  csosn: string | null;
  cstPisCofins: string;
}) {
  return (
    input.classification === "MONOFASICO" ||
    input.cstPisCofins === "04" ||
    isIcmsStExit(input.cstIcms, input.csosn)
  );
}

export function evaluateTaxExit(
  input: TaxExitEvaluationInput,
): TaxExitEvaluation {
  const findings: TaxFinding[] = [];
  const add = (
    code: string,
    severity: TaxFindingSeverity,
    message: string,
  ) => findings.push({ code, severity, message });
  const provenance = input.provenance;
  const internalOperation =
    Boolean(input.originState) &&
    Boolean(input.destinationState) &&
    input.originState === input.destinationState;
  const interstateOperation =
    Boolean(input.originState) &&
    Boolean(input.destinationState) &&
    input.originState !== input.destinationState;
  const stExit = isIcmsStExit(input.output.cstIcms, input.output.csosn);
  const monophaseExit =
    input.classification === "MONOFASICO" ||
    input.output.cstPisCofins === "04";
  let preventedTaxAmount = 0;

  if (
    (stExit || monophaseExit) &&
    (!input.originState || !input.destinationState)
  ) {
    add(
      "UF_OPERACAO_FISCAL_AUSENTE",
      "BLOCKING",
      "A UF de origem e a UF de destino são obrigatórias para produtos de alto risco fiscal.",
    );
  }

  if (internalOperation && !input.output.cfop.startsWith("5")) {
    add(
      "CFOP_SAIDA_INTERNA_INCOMPATIVEL",
      "BLOCKING",
      "A operação interna exige uma regra de saída iniciada por 5.",
    );
  }
  if (interstateOperation && !input.output.cfop.startsWith("6")) {
    add(
      "CFOP_SAIDA_INTERESTADUAL_INCOMPATIVEL",
      "BLOCKING",
      "A operação interestadual exige uma regra específica de saída iniciada por 6.",
    );
  }

  if (!provenance && (stExit || monophaseExit)) {
    add(
      "PROVENIENCIA_TRIBUTARIA_AUSENTE",
      "BLOCKING",
      "O lote exige comprovação tributária aprovada antes da venda.",
    );
  }
  if (provenance && provenance.status !== "APPROVED") {
    add(
      "PROVENIENCIA_TRIBUTARIA_NAO_APROVADA",
      "BLOCKING",
      "A origem tributária do lote ainda não foi aprovada.",
    );
  }
  if (provenance && normalizeEvidence(provenance.evidence).length === 0) {
    add(
      "EVIDENCIA_PROVENIENCIA_AUSENTE",
      "BLOCKING",
      "A origem tributária aprovada precisa manter sua evidência legal e documental.",
    );
  }

  if (stExit) {
    if (provenance && !provenance.stCollectedPreviously) {
      add(
        "ICMS_ST_SEM_RETENCAO_COMPROVADA",
        "BLOCKING",
        "A saída informa ICMS cobrado anteriormente, mas a entrada não comprova a retenção.",
      );
    }
    if (input.output.icmsRate > 0) {
      preventedTaxAmount += input.grossAmount * input.output.icmsRate;
      add(
        "ICMS_ST_COM_NOVO_DEBITO",
        "BLOCKING",
        "A regra tenta debitar ICMS próprio em uma saída marcada como tributada anteriormente por ST.",
      );
    }
  } else if (provenance?.stCollectedPreviously) {
    if (internalOperation || (!input.originState && !input.destinationState)) {
      preventedTaxAmount += input.grossAmount * input.output.icmsRate;
      add(
        "ICMS_ST_ENTRADA_COM_SAIDA_NORMAL",
        "BLOCKING",
        "O lote possui ICMS-ST anterior, mas a saída interna não utiliza o tratamento correspondente.",
      );
    } else {
      add(
        "ICMS_ST_INTERESTADUAL_REQUER_REVISAO",
        "WARNING",
        "A saída interestadual de um lote com ST anterior exige regra estadual específica.",
      );
    }
  }

  if (monophaseExit) {
    if (
      input.classification === "MONOFASICO" &&
      input.output.cstPisCofins !== "04"
    ) {
      preventedTaxAmount +=
        input.grossAmount *
        (input.output.pisRate + input.output.cofinsRate);
      add(
        "MONOFASICO_COM_CST_SAIDA_INCORRETO",
        "BLOCKING",
        "A categoria monofásica não está configurada com CST 04 na saída de revenda.",
      );
    }
    if (provenance && !provenance.monophaseApplicable) {
      add(
        "MONOFASICO_SEM_ENQUADRAMENTO_COMPROVADO",
        "BLOCKING",
        "A saída usa CST monofásico, mas o lote não possui enquadramento aprovado.",
      );
    }
    if (input.output.pisRate > 0 || input.output.cofinsRate > 0) {
      preventedTaxAmount +=
        input.grossAmount *
        (input.output.pisRate + input.output.cofinsRate);
      add(
        "MONOFASICO_COM_PIS_COFINS_NA_SAIDA",
        "BLOCKING",
        "A regra monofásica não pode manter débito de PIS/COFINS na revenda alcançada pela alíquota zero.",
      );
    }
    if (!input.output.revenueNature) {
      add(
        "NATUREZA_RECEITA_MONOFASICA_AUSENTE",
        "BLOCKING",
        "A natureza da receita é obrigatória para justificar o tratamento monofásico.",
      );
    }
    if (
      provenance &&
      (provenance.pisCreditTreatment === "ALLOWED" ||
        provenance.cofinsCreditTreatment === "ALLOWED")
    ) {
      add(
        "CREDITO_MONOFASICO_INCOMPATIVEL",
        "BLOCKING",
        "O lote monofásico está marcado com crédito de PIS/COFINS permitido e precisa ser corrigido.",
      );
    }
    if (
      provenance &&
      (provenance.pisCreditTreatment === "PENDING_REVIEW" ||
        provenance.cofinsCreditTreatment === "PENDING_REVIEW")
    ) {
      add(
        "CREDITO_MONOFASICO_PENDENTE",
        "BLOCKING",
        "O tratamento dos créditos de PIS/COFINS ainda não foi revisado.",
      );
    }
  } else if (provenance?.monophaseApplicable) {
    preventedTaxAmount +=
      input.grossAmount * (input.output.pisRate + input.output.cofinsRate);
    add(
      "MONOFASICO_COM_SAIDA_TRIBUTADA",
      "BLOCKING",
      "O lote foi classificado como monofásico, mas a regra de saída não aplica o CST correspondente.",
    );
  }

  if (!provenance && !stExit && !monophaseExit) {
    add(
      "RASTREABILIDADE_ENTRADA_NAO_INFORMADA",
      "INFO",
      "A venda normal foi avaliada sem um extrato tributário de entrada.",
    );
  }

  const status = findings.some((finding) => finding.severity === "BLOCKING")
    ? "BLOCKED"
    : findings.some((finding) => finding.severity === "WARNING")
      ? "NEEDS_REVIEW"
      : "ALLOWED";
  const evidence = provenance
    ? normalizeEvidence(provenance.evidence)
    : [];
  const decisionPayload = stableValue({
    input: {
      ...input,
      provenance: provenance
        ? {
            ...provenance,
            evidence,
          }
        : null,
    },
    status,
    findings,
    preventedTaxAmount: roundMoney(preventedTaxAmount),
  });

  return {
    status,
    findings,
    evidence,
    preventedTaxAmount: roundMoney(preventedTaxAmount),
    decisionHash: createHash("sha256")
      .update(JSON.stringify(decisionPayload))
      .digest("hex"),
  };
}

export class TaxGuardError extends Error {
  readonly evaluations: TaxExitEvaluation[];

  constructor(evaluations: TaxExitEvaluation[]) {
    super("SAIDA_FISCAL_BLOQUEADA");
    this.name = "TaxGuardError";
    this.evaluations = evaluations;
  }
}

export function allocateQuantity<T>(
  quantity: number,
  sources: T[],
  getAvailable: (source: T) => number,
) {
  let remaining = quantity;
  const allocations: Array<{ source: T; quantity: number }> = [];
  for (const source of sources) {
    if (remaining <= 0) break;
    const available = Math.max(0, getAvailable(source));
    const allocated = Math.min(remaining, available);
    if (allocated > 0) allocations.push({ source, quantity: allocated });
    remaining -= allocated;
  }
  return { allocations, missingQuantity: Math.max(0, remaining) };
}
