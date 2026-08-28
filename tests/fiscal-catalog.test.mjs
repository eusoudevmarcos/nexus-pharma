import assert from "node:assert/strict";
import test from "node:test";

import {
  IBS_CBS_CLASSIFICATIONS,
  PIS_COFINS_CSTS,
  ibsCbsSuggestions,
  revenueNatureSuggestions,
  resolvePisCofinsRates,
  suggestNcm,
} from "../app/fiscal-catalog.ts";
import { initialCategories } from "../app/catalog-data.ts";

test("catálogo PIS/COFINS contém todos os CST sem duplicidade", () => {
  const codes = PIS_COFINS_CSTS.map((item) => item.code);
  assert.equal(codes.length, 33);
  assert.equal(new Set(codes).size, codes.length);
  assert.ok(codes.includes("04"));
  assert.ok(codes.includes("99"));
});

test("higiene NCM 33049990 recebe natureza 202 no CST 04", () => {
  assert.deepEqual(
    revenueNatureSuggestions("33049990", "04").map((item) => item.code),
    ["202"],
  );
  assert.deepEqual(revenueNatureSuggestions("33049990", "01"), []);
});

test("benefício IBS/CBS de higiene só é sugerido para NCM do Anexo VIII", () => {
  assert.deepEqual(ibsCbsSuggestions("33049990"), []);
  assert.deepEqual(
    ibsCbsSuggestions("33061000").map((item) => item.code),
    ["200035"],
  );
});

test("cClassTrib sempre deriva o próprio CST IBS/CBS", () => {
  for (const item of IBS_CBS_CLASSIFICATIONS) {
    assert.equal(item.code.slice(0, 3), item.cst);
    assert.equal(item.cbsRate, 0.009);
    assert.equal(item.ibsRate, 0.001);
  }
});

test("CST 04 com natureza monofásica preenche PIS e COFINS com alíquota zero", () => {
  assert.deepEqual(resolvePisCofinsRates("SIMPLES_NACIONAL", "04", "202"), {
    pis: 0,
    cofins: 0,
    basis: "Revenda monofásica a alíquota zero",
  });
});

test("IA só sugere NCM quando a descrição do produto é específica", () => {
  assert.equal(suggestNcm("categoria de higiene pessoal", "33049990"), null);
  assert.equal(suggestNcm("creme dental com flúor", "33049990")?.ncm, "33061000");
  assert.equal(suggestNcm("escova de dentes macia", "33049990")?.ncm, "96032100");
});

test("dados demonstrativos não propagam os antigos enquadramentos incorretos", () => {
  const hygiene = initialCategories.find((item) => item.id === "hig");
  const candy = initialCategories.find((item) => item.id === "bal");
  assert.equal(hygiene?.rules.LUCRO_PRESUMIDO.cstPisCofins, "04");
  assert.equal(hygiene?.rules.LUCRO_PRESUMIDO.natureza, "202");
  assert.equal(hygiene?.rules.LUCRO_PRESUMIDO.cClassTrib, "000001");
  assert.equal(candy?.rules.LUCRO_PRESUMIDO.cstPisCofins, "01");
});
