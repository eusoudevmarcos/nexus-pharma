import assert from "node:assert/strict";
import test from "node:test";
import {
  availableQuantity,
  inventoryDifference,
  movementTypeForAdjustment,
} from "../dist/services/inventory-workflow.service.js";

test("saldo disponível desconta reservas sem alterar o físico", () => {
  assert.equal(availableQuantity(18.5, 3.25), 15.25);
});

test("saldo disponível nunca fica negativo na apresentação", () => {
  assert.equal(availableQuantity(2, 4), 0);
});

test("inventário calcula sobra e falta com três casas decimais", () => {
  assert.equal(inventoryDifference(10, 9.125), -0.875);
  assert.equal(inventoryDifference(10, 10.3333), 0.333);
});

test("perdas e avarias geram movimento de perda", () => {
  assert.equal(movementTypeForAdjustment("LOSS"), "LOSS");
  assert.equal(movementTypeForAdjustment("DAMAGE"), "LOSS");
  assert.equal(movementTypeForAdjustment("EXPIRED"), "LOSS");
});

test("correção aprovada gera movimento de ajuste", () => {
  assert.equal(movementTypeForAdjustment("CORRECTION"), "ADJUSTMENT");
});
