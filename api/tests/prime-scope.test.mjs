import assert from "node:assert/strict";
import test from "node:test";
import {
  defaultProductScopeMode,
  isValidGs1Prefix,
  normalizeGs1Prefixes,
  productInScope,
  resolvePrimeProductScope,
  toGtin13,
} from "../dist/services/prime-scope.js";

test("prefixo GS1 curto demais é inválido (789 abriria todo produto brasileiro)", () => {
  assert.equal(isValidGs1Prefix("789"), false);
  assert.equal(isValidGs1Prefix("789123"), false);
  assert.equal(isValidGs1Prefix("7891234"), true);
  assert.equal(isValidGs1Prefix("789123456789"), true);
  assert.equal(isValidGs1Prefix("7891234567890"), false);
  assert.equal(isValidGs1Prefix("78912a4"), false);
});

test("normaliza prefixos: só dígitos, válidos, sem duplicata, ordenados", () => {
  assert.deepEqual(normalizeGs1Prefixes(["789.1234", "7891234", "789", "7895555", 42, null]), ["7891234", "7895555"]);
  assert.deepEqual(normalizeGs1Prefixes("7891234"), []);
  assert.deepEqual(normalizeGs1Prefixes(undefined), []);
});

test("padrão (política de 25/09): todo tipo vê todas as marcas, inclusive laboratório", () => {
  assert.equal(defaultProductScopeMode("LABORATORY"), "ALL");
  assert.equal(defaultProductScopeMode("DISTRIBUTOR"), "ALL");
  assert.equal(defaultProductScopeMode("WHOLESALER"), "ALL");
  assert.equal(defaultProductScopeMode("PLATFORM"), "ALL");
});

test("restrição por prefixo GS1 é opcional e só vale quando a Nexus liga", () => {
  assert.deepEqual(resolvePrimeProductScope("LABORATORY", { gs1Prefixes: ["7891234"] }), { mode: "ALL" }, "prefixo cadastrado sozinho não restringe");
  assert.deepEqual(resolvePrimeProductScope("LABORATORY", {}), { mode: "ALL" });
  assert.deepEqual(resolvePrimeProductScope("LABORATORY", { productScope: "OWN", gs1Prefixes: ["7891234"] }), { mode: "OWN", gs1Prefixes: ["7891234"] });
  assert.deepEqual(resolvePrimeProductScope("LABORATORY", { productScope: "ALL", gs1Prefixes: ["7891234"] }), { mode: "ALL" });
  assert.deepEqual(resolvePrimeProductScope("DISTRIBUTOR", { productScope: "OWN", gs1Prefixes: ["7891234"] }), { mode: "OWN", gs1Prefixes: ["7891234"] });
  assert.deepEqual(resolvePrimeProductScope("DISTRIBUTOR", null), { mode: "ALL" });
  assert.deepEqual(resolvePrimeProductScope("LABORATORY", { productScope: "QUALQUER" }), { mode: "ALL" });
});

test("código de barras vai para GTIN-13 antes de comparar o prefixo", () => {
  assert.equal(toGtin13("7891234000017"), "7891234000017");
  assert.equal(toGtin13("17891234000014"), "7891234000014");
  assert.equal(toGtin13("07891234000017"), "7891234000017");
  assert.equal(toGtin13("012345678905"), "0012345678905");
  assert.equal(toGtin13("78912340"), "78912340");
});

test("com a restrição ligada: vê o próprio produto e não o do concorrente", () => {
  const scope = { mode: "OWN", gs1Prefixes: ["7891234"] };
  assert.equal(productInScope(scope, "7891234000017"), true);
  assert.equal(productInScope(scope, "17891234000014"), true, "caixa de embarque (GTIN-14) do próprio produto");
  assert.equal(productInScope(scope, "7899999000013"), false);
  assert.equal(productInScope(scope, "7891235000016"), false, "prefixo vizinho não casa");
});

test("restrição ligada sem prefixo cadastrado não mostra nada (falha fechado)", () => {
  assert.equal(productInScope({ mode: "OWN", gs1Prefixes: [] }, "7891234000017"), false);
});

test("escopo total vê qualquer produto", () => {
  assert.equal(productInScope({ mode: "ALL" }, "7899999000013"), true);
});
