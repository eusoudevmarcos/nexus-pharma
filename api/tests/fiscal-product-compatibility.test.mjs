import assert from "node:assert/strict";
import test from "node:test";
import { analyzeProductTaxCompatibility } from "../dist/services/fiscal-product-compatibility.service.js";

const catalog = [
  { code: "30049069", description: "Outros medicamentos para uso humano", sourceVersion: "2026.08" },
  { code: "33041000", description: "Preparações para maquiagem dos lábios", sourceVersion: "2026.08" },
  { code: "33051000", description: "Xampus para os cabelos", sourceVersion: "2026.08" },
  { code: "34011190", description: "Outros sabões e sabonetes de toucador", sourceVersion: "2026.08" },
];

test("recognizes a compatible product and NCM without promising legal certainty", () => {
  const result = analyzeProductTaxCompatibility({ name: "Batom líquido matte maquiagem", currentNcm: "33041000", catalog });
  assert.equal(result.status, "COMPATIBLE");
  assert.equal(result.requiresNcmReview, false);
  assert.match(result.disclaimer, /não substitui/i);
});

test("blocks an obvious description and NCM contradiction", () => {
  const result = analyzeProductTaxCompatibility({ name: "Batom líquido matte maquiagem", currentNcm: "34011190", catalog });
  assert.equal(result.status, "CONFLICT");
  assert.equal(result.candidate?.ncm, "33041000");
  assert.ok(result.warnings.includes("PRODUCT_NCM_CONFLICT"));
});

test("keeps incomplete descriptions inconclusive", () => {
  const result = analyzeProductTaxCompatibility({ name: "Produto XPTO", currentNcm: "30049069", catalog: [] });
  assert.equal(result.status, "INCONCLUSIVE");
  assert.ok(result.warnings.includes("OFFICIAL_NCM_CATALOG_NOT_ACTIVE"));
});

test("flags ambiguous adversarial text instead of choosing silently", () => {
  const result = analyzeProductTaxCompatibility({ name: "Batom sabonete shampoo promoção", currentNcm: "33041000", catalog });
  assert.equal(result.status, "CONFLICT");
  assert.equal(result.requiresNcmReview, true);
});

test("requires ANVISA data review for a product with medicinal signals", () => {
  const result = analyzeProductTaxCompatibility({ name: "Medicamento genérico comprimido", activeIngredient: "dipirona", currentNcm: "30049069", catalog });
  assert.ok(result.warnings.includes("ANVISA_REGISTRATION_NOT_INFORMED"));
});
