import test from "node:test";
import assert from "node:assert/strict";
import { parseNfeXml } from "../dist/services/nfe-xml.service.js";
import { firstRastroLot } from "../dist/services/dfe-receiving.service.js";

const xml = (rastro) => `<nfeProc versao="4.00"><NFe><infNFe versao="4.00" Id="NFe53260811222333000181650010000001231123456782"><ide><mod>65</mod><nNF>1</nNF></ide><emit><CNPJ>11222333000181</CNPJ><xNome>Distribuidora</xNome></emit><det nItem="1"><prod><cProd>MED1</cProd><cEAN>7891234567895</cEAN><xProd>Dipirona 500mg</xProd><NCM>30049099</NCM><CFOP>1102</CFOP><uCom>UN</uCom><qCom>10</qCom><vUnCom>5.00</vUnCom><vProd>50.00</vProd>${rastro}</prod><imposto><ICMS><ICMSSN102><CSOSN>102</CSOSN></ICMSSN102></ICMS></imposto></det></infNFe></NFe></nfeProc>`;

test("parser extrai lote, fabricação e validade do grupo rastro", () => {
  const doc = parseNfeXml(xml("<rastro><nLote>ABC123</nLote><qLote>10.000</qLote><dFab>2026-01-10</dFab><dVal>2028-01-10</dVal></rastro>"));
  const r = doc.items[0].rastro;
  assert.equal(r.length, 1);
  assert.equal(r[0].lote, "ABC123");
  assert.equal(r[0].quantidade, 10);
  assert.equal(r[0].fabricacao.toISOString().slice(0, 10), "2026-01-10");
  assert.equal(r[0].validade.toISOString().slice(0, 10), "2028-01-10");
});

test("parser aceita múltiplos lotes e descarta rastro vazio", () => {
  const doc = parseNfeXml(xml("<rastro><nLote>L1</nLote><dVal>2027-06-30</dVal></rastro><rastro><nLote>L2</nLote><dVal>2027-12-31</dVal></rastro>"));
  assert.equal(doc.items[0].rastro.length, 2);
  assert.equal(doc.items[0].rastro[1].lote, "L2");
});

test("item sem rastro devolve lista vazia", () => {
  const doc = parseNfeXml(xml(""));
  assert.deepEqual(doc.items[0].rastro, []);
});

test("firstRastroLot escolhe o primeiro lote utilizável do JSON armazenado", () => {
  const stored = [
    { lote: null, quantidade: null, fabricacao: null, validade: null },
    { lote: "ABC123", quantidade: 10, fabricacao: "2026-01-10T00:00:00.000Z", validade: "2028-01-10T00:00:00.000Z" },
  ];
  const lot = firstRastroLot(stored);
  assert.equal(lot.lote, "ABC123");
  assert.equal(lot.validade.toISOString().slice(0, 10), "2028-01-10");
  assert.equal(lot.fabricacao.toISOString().slice(0, 10), "2026-01-10");
});

test("firstRastroLot devolve null quando não há rastro", () => {
  assert.equal(firstRastroLot([]), null);
  assert.equal(firstRastroLot(null), null);
});
