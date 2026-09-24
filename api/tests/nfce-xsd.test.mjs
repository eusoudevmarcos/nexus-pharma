import test from "node:test";
import assert from "node:assert/strict";
import { validateNfceXmlStructure } from "../dist/services/nfce-xsd.service.js";
import { buildNfceInfXml } from "../dist/services/nfce-layout.service.js";

const chave = "53260811222333000181650010000001231123456782";

function sampleXml(overrides = {}) {
  const { xml } = buildNfceInfXml({
    accessKey: chave, environment: "HOMOLOGATION", emissionType: "NORMAL",
    series: 1, number: 1, numericCode: "12345678", issuedAt: new Date("2026-08-29T15:00:00-03:00"),
    issuer: { cnpj: "11222333000181", legalName: "Farmácia", stateRegistration: "0730000100109", taxRegimeCode: "1",
      address: { street: "SCS Q2", number: "10", district: "Asa Sul", cityCode: "5300108", cityName: "Brasília", state: "DF", zipCode: "70300000" } },
    items: [{ code: "MED-1", ean: "7891234567895", description: "Dipirona", ncm: "30049099", cfop: "5405", quantity: 1, unitPrice: 10, grossAmount: 10, taxes: { csosn: "102", cstPis: "04", cstCofins: "04" } }],
    payments: [{ method: "01", amount: 10 }],
    ...overrides,
  });
  return xml;
}

test("XML oficial válido do builder passa na validação estrutural", () => {
  const result = validateNfceXmlStructure(sampleXml());
  assert.equal(result.validated, true, result.errors.join(","));
  assert.equal(result.engine, "structural");
});

test("XML malformado é reportado sem lançar", () => {
  const result = validateNfceXmlStructure("<NFe><infNFe> quebrado");
  assert.equal(result.validated, false);
  assert.ok(result.errors.length > 0);
});

test("detecta modelo errado, NCM inválido e falta de pagamento", () => {
  let xml = sampleXml();
  xml = xml.replace("<mod>65</mod>", "<mod>55</mod>").replace("<NCM>30049099</NCM>", "<NCM>3004</NCM>").replace(/<pag>.*<\/pag>/, "");
  const result = validateNfceXmlStructure(xml);
  assert.equal(result.validated, false);
  assert.ok(result.errors.includes("MODELO_DIFERENTE_DE_65"));
  assert.ok(result.errors.includes("DET_1_NCM_INVALIDO"));
  assert.ok(result.errors.includes("PAG_SEM_DETPAG"));
});
