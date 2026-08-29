import test from "node:test";
import assert from "node:assert/strict";
import {
  buildNfceAccessKey,
  buildNfceXmlDraft,
  calculateNfceCheckDigit,
  validateBrazilianTaxId,
  validateNfcePreparation,
} from "../dist/services/nfce.service.js";

test("gera chave NFC-e de 44 dígitos com DV módulo 11", () => {
  const key = buildNfceAccessKey({
    state: "SP",
    issuedAt: new Date("2026-08-29T15:00:00-03:00"),
    cnpj: "11222333000181",
    series: 1,
    number: 123,
    emissionType: "NORMAL",
    numericCode: "12345678",
  });
  assert.equal(key, "35260811222333000181650010000001231123456782");
  assert.equal(Number(key.at(-1)), calculateNfceCheckDigit(key.slice(0, 43)));
});

test("diferencia emissão normal e contingência na chave", () => {
  const common = { state: "DF", issuedAt: new Date("2026-08-29T12:00:00-03:00"), cnpj: "11222333000181", series: 9, number: 2, numericCode: "00000042" };
  const normal = buildNfceAccessKey({ ...common, emissionType: "NORMAL" });
  const contingency = buildNfceAccessKey({ ...common, emissionType: "OFFLINE_CONTINGENCY" });
  assert.notEqual(normal, contingency);
  assert.equal(normal.length, 44);
  assert.equal(contingency.length, 44);
});

test("valida CPF e CNPJ antes de gravar consumidor", () => {
  assert.equal(validateBrazilianTaxId("529.982.247-25"), true);
  assert.equal(validateBrazilianTaxId("11.222.333/0001-81"), true);
  assert.equal(validateBrazilianTaxId("111.111.111-11"), false);
  assert.equal(validateBrazilianTaxId("11.222.333/0001-00"), false);
});

test("bloqueia preparação com cadastro ou snapshot fiscal incompleto", () => {
  const issues = validateNfcePreparation({
    company: { cnpj: null, state: null, legalName: "Farmácia", settings: {} },
    sale: {
      status: "PENDING", invoiceModel: "NF55", grossAmount: 10,
      items: [{ ncm: "3304", cfop: "", cstIcms: "", cstPis: "", cstCofins: "", cstIbsCbs: "", taxClassification: "", quantity: 0, unitPrice: -1 }],
    },
    environment: "HOMOLOGATION",
  });
  const codes = new Set(issues.map((item) => item.code));
  assert.equal(codes.has("CNPJ_REQUIRED"), true);
  assert.equal(codes.has("STATE_REGISTRATION_REQUIRED"), true);
  assert.equal(codes.has("SALE_NOT_COMPLETED"), true);
  assert.equal(codes.has("WRONG_INVOICE_MODEL"), true);
  assert.equal(codes.has("TAX_SNAPSHOT_INCOMPLETE"), true);
});

test("XML local escapa conteúdo e permanece explicitamente não transmissível", () => {
  const xml = buildNfceXmlDraft({
    schemaVersion: "local-test",
    header: { accessKey: "1".repeat(44), stateCode: "53", series: 1, number: 1, issuedAt: "2026-08-29T10:00:00-03:00", emissionCode: "1", environmentCode: "2" },
    issuer: { cnpj: "11222333000181", legalName: "A & B <Farmácia>", stateRegistration: "123", municipalityCode: "5300108" },
    items: [{ number: 1, ean: "7890000000000", name: "Item <teste>", ncm: "33041000", cfop: "5405", quantity: "1.0000", unitPrice: "10.00", total: "10.00", taxes: { cstIcms: "060", csosn: "500", cstPis: "04", cstCofins: "04", cstIbsCbs: "000", taxClassification: "000001" } }],
    totals: { gross: "10.00", icms: "0.00", pis: "0.00", cofins: "0.00", cbs: "0.00", ibs: "0.00" },
    payment: { method: "01", amount: "10.00" },
  });
  assert.match(xml, /transmissaoPermitida="false"/);
  assert.match(xml, /A &amp; B &lt;Farmácia&gt;/);
  assert.doesNotMatch(xml, /<NFe xmlns=/);
});

test("XML local preserva preço original, desconto e total líquido", () => {
  const xml = buildNfceXmlDraft({
    schemaVersion: "local-test",
    header: { accessKey: "1".repeat(44), stateCode: "53", series: 1, number: 2, issuedAt: "2026-08-29T10:00:00-03:00", emissionCode: "1", environmentCode: "2" },
    issuer: { cnpj: "11222333000181", legalName: "Farmácia", stateRegistration: "123", municipalityCode: "5300108" },
    items: [{ number: 1, ean: "7890000000000", name: "Item", ncm: "33041000", cfop: "5405", quantity: "2.000", originalUnitPrice: "10.00", unitPrice: "9.00", grossBeforeDiscount: "20.00", discount: "2.00", total: "18.00", taxes: { cstIcms: "060", csosn: "500", cstPis: "04", cstCofins: "04", cstIbsCbs: "000", taxClassification: "000001" } }],
    totals: { originalGross: "20.00", discount: "2.00", gross: "18.00", icms: "0.00", pis: "0.00", cofins: "0.00", cbs: "0.00", ibs: "0.00" },
    payment: { method: "01", amount: "18.00" },
  });
  assert.match(xml, /<vUnCom>10.00<\/vUnCom><vProd>20.00<\/vProd><vDesc>2.00<\/vDesc>/);
  assert.match(xml, /<total><vProd>20.00<\/vProd><vDesc>2.00<\/vDesc>/);
  assert.match(xml, /<vNF>18.00<\/vNF>/);
});
