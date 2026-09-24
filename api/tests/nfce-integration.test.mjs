import test from "node:test";
import assert from "node:assert/strict";
import { nfceLayoutFromSale } from "../dist/services/nfce.service.js";
import { buildNfceInfXml } from "../dist/services/nfce-layout.service.js";

// Requer envs dummy (DATABASE_URL/JWT_SECRET) porque nfce.service importa config.
const chave = "53260811222333000181650010000001231123456782";

const company = {
  cnpj: "11222333000181",
  legalName: "Farmácia Nexus LTDA",
  tradeName: "Nexus Pharma",
  state: "DF",
  city: "Brasília",
  taxRegime: "SIMPLES_NACIONAL",
  settings: {
    stateRegistration: "0730000100109",
    municipalityCode: "5300108",
    fiscalAddress: { street: "SCS Quadra 2", number: "10", district: "Asa Sul", zipCode: "70300-000", phone: "6133334444" },
  },
};

const items = [
  { ean: "7891234567895", productName: "Dipirona 500mg", ncm: "30049099", cfop: "5405", unit: "UN", quantity: 2, unitPrice: 10, grossAmount: 20, discount: 2, csosn: "500", cstPis: "04", cstCofins: "04", icmsAmount: 0, pisAmount: 0, cofinsAmount: 0 },
];

test("mapeia venda de empresa do Simples para NfceLayoutInput (CRT 1, endereço do settings)", () => {
  const layout = nfceLayoutFromSale({
    accessKey: chave,
    environment: "HOMOLOGATION",
    emissionType: "NORMAL",
    series: 1,
    number: 123,
    numericCode: "12345678",
    issuedAt: new Date("2026-08-29T15:00:00-03:00"),
    paymentMethod: "01",
    company,
    customer: null,
    items,
  });
  assert.equal(layout.issuer.taxRegimeCode, "1");
  assert.equal(layout.issuer.address.cityCode, "5300108");
  assert.equal(layout.issuer.address.zipCode, "70300000"); // CEP normalizado
  assert.equal(layout.issuer.stateRegistration, "0730000100109");
  assert.equal(layout.payments[0].amount, 18); // 20 bruto - 2 desconto

  // O layout resultante gera XML oficial válido (Simples => ICMSSN).
  const { xml } = buildNfceInfXml(layout);
  assert.match(xml, /<infNFe versao="4\.00"/);
  assert.match(xml, /<CRT>1<\/CRT>/);
  assert.match(xml, /<ICMSSN500>/);
  assert.match(xml, /<CEP>70300000<\/CEP>/);
  assert.match(xml, /<vNF>18\.00<\/vNF>/);
});
