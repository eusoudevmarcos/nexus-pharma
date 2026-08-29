import test from "node:test";
import assert from "node:assert/strict";
import { allocateRefundAmount, allocateReversalQuantity } from "../dist/services/post-sale.service.js";
import { discountLimitForRole } from "../dist/services/processar-venda.service.js";

test("devolução respeita a origem fiscal e o que já foi estornado", () => {
  const result = allocateReversalQuantity(5, [
    { lotId: "lote-a", provenanceId: "origem-a", quantity: 4 },
    { lotId: "lote-b", provenanceId: "origem-b", quantity: 5 },
  ], [
    { lotId: "lote-a", provenanceId: "origem-a", quantity: 3 },
  ]);
  assert.deepEqual(result, [
    { lotId: "lote-a", provenanceId: "origem-a", quantity: 1 },
    { lotId: "lote-b", provenanceId: "origem-b", quantity: 4 },
  ]);
});

test("alocação identifica quantidade sem origem em vez de inventar lote", () => {
  const result = allocateReversalQuantity(3, [{ lotId: "lote-a", provenanceId: "origem-a", quantity: 2 }], []);
  assert.deepEqual(result, [
    { lotId: "lote-a", provenanceId: "origem-a", quantity: 2 },
    { lotId: null, provenanceId: null, quantity: 1 },
  ]);
});

test("reembolso usa somente o saldo ainda disponível de cada pagamento", () => {
  const result = allocateRefundAmount(80, [
    { id: "dinheiro", method: "CASH", amount: 50, refunded: 20 },
    { id: "pix", method: "PIX", amount: 100, refunded: 10 },
  ]);
  assert.deepEqual(result, {
    allocations: [
      { paymentId: "dinheiro", method: "CASH", amount: 30 },
      { paymentId: "pix", method: "PIX", amount: 50 },
    ],
    missing: 0,
  });
});

test("limite de desconto é controlado por perfil, configuração e teto global", () => {
  assert.equal(discountLimitForRole("OPERATOR", {}), 5);
  assert.equal(discountLimitForRole("MANAGER", { posDiscountLimits: { MANAGER: 12.5 } }), 12.5);
  assert.equal(discountLimitForRole("OWNER", { posDiscountLimits: { OWNER: 80 } }), 50);
  assert.equal(discountLimitForRole("VIEWER", { posDiscountLimits: { VIEWER: "inválido" } }), 0);
});
