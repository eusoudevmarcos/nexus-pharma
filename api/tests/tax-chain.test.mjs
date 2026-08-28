import assert from "node:assert/strict";
import test from "node:test";
import {
  allocateQuantity,
  evaluateTaxExit,
} from "../dist/services/tax-chain.service.js";

function baseInput(overrides = {}) {
  return {
    productId: "produto-1",
    lotId: "lote-1",
    classification: "TRIBUTACAO_NORMAL",
    regime: "LUCRO_PRESUMIDO",
    operationType: "REVENDA_INTERNA",
    originState: "DF",
    destinationState: "DF",
    quantity: 1,
    grossAmount: 100,
    output: {
      cfop: "5102",
      cstIcms: "00",
      csosn: null,
      cstPisCofins: "01",
      revenueNature: null,
      cstIbsCbs: "000",
      cClassTrib: "000001",
      icmsRate: 0.18,
      pisRate: 0.0065,
      cofinsRate: 0.03,
      cbsRate: 0.009,
      ibsRate: 0.001,
      ruleVersion: "2026.08",
    },
    provenance: {
      id: "origem-1",
      status: "APPROVED",
      stCollectedPreviously: false,
      monophaseApplicable: false,
      pisCreditTreatment: "ALLOWED",
      cofinsCreditTreatment: "ALLOWED",
      evidence: [{ source: "regra-oficial" }],
      ruleVersion: "2026.08",
    },
    ...overrides,
  };
}

test("libera revenda monofásica comprovada sem novo PIS/COFINS", () => {
  const input = baseInput({
    classification: "MONOFASICO",
    output: {
      ...baseInput().output,
      cstPisCofins: "04",
      revenueNature: "202",
      pisRate: 0,
      cofinsRate: 0,
    },
    provenance: {
      ...baseInput().provenance,
      monophaseApplicable: true,
      pisCreditTreatment: "PROHIBITED",
      cofinsCreditTreatment: "PROHIBITED",
    },
  });
  const result = evaluateTaxExit(input);
  assert.equal(result.status, "ALLOWED");
  assert.equal(result.preventedTaxAmount, 0);
});

test("bloqueia PIS/COFINS duplicado em produto monofásico", () => {
  const input = baseInput({
    classification: "MONOFASICO",
    output: {
      ...baseInput().output,
      cstPisCofins: "04",
      revenueNature: "202",
      pisRate: 0.0065,
      cofinsRate: 0.03,
    },
    provenance: {
      ...baseInput().provenance,
      monophaseApplicable: true,
      pisCreditTreatment: "PROHIBITED",
      cofinsCreditTreatment: "PROHIBITED",
    },
  });
  const result = evaluateTaxExit(input);
  assert.equal(result.status, "BLOCKED");
  assert.equal(result.preventedTaxAmount, 3.65);
  assert.ok(
    result.findings.some(
      (finding) => finding.code === "MONOFASICO_COM_PIS_COFINS_NA_SAIDA",
    ),
  );
});

test("libera ICMS-ST quando a retenção anterior está comprovada", () => {
  const input = baseInput({
    output: {
      ...baseInput().output,
      cfop: "5405",
      cstIcms: "60",
      icmsRate: 0,
    },
    provenance: {
      ...baseInput().provenance,
      stCollectedPreviously: true,
    },
  });
  const result = evaluateTaxExit(input);
  assert.equal(result.status, "ALLOWED");
});

test("bloqueia CST 60 sem comprovação da retenção de ICMS-ST", () => {
  const input = baseInput({
    output: {
      ...baseInput().output,
      cfop: "5405",
      cstIcms: "60",
      icmsRate: 0,
    },
    provenance: null,
  });
  const result = evaluateTaxExit(input);
  assert.equal(result.status, "BLOCKED");
  assert.ok(
    result.findings.some(
      (finding) => finding.code === "PROVENIENCIA_TRIBUTARIA_AUSENTE",
    ),
  );
});

test("bloqueia débito normal em saída interna de lote com ST anterior", () => {
  const input = baseInput({
    provenance: {
      ...baseInput().provenance,
      stCollectedPreviously: true,
    },
  });
  const result = evaluateTaxExit(input);
  assert.equal(result.status, "BLOCKED");
  assert.equal(result.preventedTaxAmount, 18);
  assert.ok(
    result.findings.some(
      (finding) => finding.code === "ICMS_ST_ENTRADA_COM_SAIDA_NORMAL",
    ),
  );
});

test("bloqueia CFOP interno em operação interestadual", () => {
  const result = evaluateTaxExit(
    baseInput({ destinationState: "GO" }),
  );
  assert.equal(result.status, "BLOCKED");
  assert.ok(
    result.findings.some(
      (finding) => finding.code === "CFOP_SAIDA_INTERESTADUAL_INCOMPATIVEL",
    ),
  );
});

test("bloqueia produto de alto risco sem UFs da operação", () => {
  const input = baseInput({
    classification: "MONOFASICO",
    originState: null,
    destinationState: null,
    output: {
      ...baseInput().output,
      cstPisCofins: "04",
      revenueNature: "202",
      pisRate: 0,
      cofinsRate: 0,
    },
    provenance: {
      ...baseInput().provenance,
      monophaseApplicable: true,
      pisCreditTreatment: "PROHIBITED",
      cofinsCreditTreatment: "PROHIBITED",
    },
  });
  const result = evaluateTaxExit(input);
  assert.equal(result.status, "BLOCKED");
  assert.ok(
    result.findings.some(
      (finding) => finding.code === "UF_OPERACAO_FISCAL_AUSENTE",
    ),
  );
});

test("aloca quantidades respeitando o saldo fiscal disponível", () => {
  const source = [
    { id: "a", saldo: 2 },
    { id: "b", saldo: 5 },
  ];
  const result = allocateQuantity(6, source, (item) => item.saldo);
  assert.deepEqual(
    result.allocations.map((item) => [item.source.id, item.quantity]),
    [
      ["a", 2],
      ["b", 4],
    ],
  );
  assert.equal(result.missingQuantity, 0);
});
