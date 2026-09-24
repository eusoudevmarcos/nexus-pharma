import test from "node:test";
import assert from "node:assert/strict";
import { parseGs1, gs1DateToDate } from "../dist/services/gs1-barcode.service.js";

const GS = "\u001d";

test("DataMatrix bruto: extrai GTIN, validade, lote e serial", () => {
  const r = parseGs1(`010789123456789517280110` + `10ABC123` + GS + `21SN99`);
  assert.equal(r.gs1, true);
  assert.equal(r.gtin, "07891234567895");
  assert.equal(r.ean, "7891234567895");
  assert.equal(r.lote, "ABC123");
  assert.equal(r.serial, "SN99");
  assert.equal(r.validade.toISOString().slice(0, 10), "2028-01-10");
});

test("forma com parênteses", () => {
  const r = parseGs1("(01)07891234567895(17)280110(10)ABC123");
  assert.equal(r.gtin, "07891234567895");
  assert.equal(r.lote, "ABC123");
  assert.equal(r.validade.toISOString().slice(0, 10), "2028-01-10");
});

test("EAN-13 puro não é tratado como GS1", () => {
  const r = parseGs1("7891234567895");
  assert.equal(r.gs1, false);
  assert.equal(r.ean, "7891234567895");
  assert.equal(r.lote, null);
});

test("identificador de simbologia ]d2 é removido", () => {
  const r = parseGs1("]d2010789123456789517280110");
  assert.equal(r.gtin, "07891234567895");
  assert.equal(r.validade.toISOString().slice(0, 10), "2028-01-10");
});

test("validade AAMM00 vira o último dia do mês", () => {
  assert.equal(gs1DateToDate("281200").toISOString().slice(0, 10), "2028-12-31");
  assert.equal(gs1DateToDate("280229").toISOString().slice(0, 10), "2028-02-29");
});

test("código vazio ou inválido não lança", () => {
  assert.equal(parseGs1("").gtin, null);
  assert.equal(parseGs1("   ").gs1, false);
});
