import test from "node:test";
import assert from "node:assert/strict";
import { ageOnDate, validateControlledSaleLine } from "../dist/services/sale-control.service.js";

const strictPolicy = {
  controlLevel: "PRESCRIPTION_RETENTION",
  requiresBuyerId: true,
  requiresPrescription: true,
  requiresPharmacist: true,
  retainsPrescription: true,
  minimumBuyerAge: 18,
  controlRuleVersion: "2026.08",
  controlLegalBasis: "Fonte legal homologada e vigente para o produto.",
};

test("calcula idade completa na data de referência", () => {
  assert.equal(ageOnDate(new Date("2008-08-30T00:00:00Z"), new Date("2026-08-29T12:00:00Z")), 17);
  assert.equal(ageOnDate(new Date("2008-08-29T00:00:00Z"), new Date("2026-08-29T12:00:00Z")), 18);
});

test("bloqueia venda controlada quando faltam comprador, receita e farmacêutico", () => {
  const errors = validateControlledSaleLine({ policy: strictPolicy, buyer: null, prescription: null, hasVerifiedPharmacist: false, now: new Date("2026-08-29T12:00:00Z") });
  assert.equal(errors.includes("COMPRADOR_IDENTIFICADO_OBRIGATORIO"), true);
  assert.equal(errors.includes("FARMACEUTICO_VERIFICADO_OBRIGATORIO"), true);
  assert.equal(errors.includes("NUMERO_DA_PRESCRICAO_OBRIGATORIO"), true);
  assert.equal(errors.includes("RETENCAO_DA_PRESCRICAO_DEVE_SER_CONFIRMADA"), true);
});

test("bloqueia menor de idade e prescrição com data futura", () => {
  const errors = validateControlledSaleLine({
    policy: strictPolicy,
    buyer: { taxId: "529.982.247-25", name: "Comprador Teste", birthDate: new Date("2010-01-01T00:00:00Z") },
    prescription: { number: "RX-1", prescriberName: "Profissional", prescriberRegistration: "12345", prescriberState: "DF", issuedAt: new Date("2026-08-30T00:00:00Z"), retained: true },
    hasVerifiedPharmacist: true,
    now: new Date("2026-08-29T12:00:00Z"),
  });
  assert.equal(errors.includes("IDADE_MINIMA_NAO_ATENDIDA:18"), true);
  assert.equal(errors.includes("PRESCRICAO_COM_DATA_FUTURA"), true);
});

test("libera contexto completo sem transformar NCM em regra de controle", () => {
  const errors = validateControlledSaleLine({
    policy: strictPolicy,
    buyer: { taxId: "529.982.247-25", name: "Comprador Teste", birthDate: new Date("1990-01-01T00:00:00Z") },
    prescription: { number: "RX-1", prescriberName: "Profissional", prescriberRegistration: "12345", prescriberState: "DF", issuedAt: new Date("2026-08-20T00:00:00Z"), retained: true },
    hasVerifiedPharmacist: true,
    now: new Date("2026-08-29T12:00:00Z"),
  });
  assert.deepEqual(errors, []);
});

test("política controlada sem fonte e versão permanece bloqueada", () => {
  const errors = validateControlledSaleLine({ policy: { ...strictPolicy, controlRuleVersion: null, controlLegalBasis: null }, hasVerifiedPharmacist: true });
  assert.equal(errors.includes("POLITICA_DE_CONTROLE_SEM_FONTE_OU_VERSAO"), true);
});

test("requisitos não podem ficar escondidos sob nível sem controle", () => {
  const errors = validateControlledSaleLine({ policy: { ...strictPolicy, controlLevel: "NONE", controlRuleVersion: null, controlLegalBasis: null }, hasVerifiedPharmacist: true });
  assert.equal(errors.includes("POLITICA_DE_CONTROLE_SEM_FONTE_OU_VERSAO"), true);
});
