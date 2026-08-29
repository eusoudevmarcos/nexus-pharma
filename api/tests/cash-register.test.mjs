import test from "node:test";
import assert from "node:assert/strict";
import { calculateCashExpected, reconcileCashAmounts } from "../dist/services/cash-register.service.js";

test("calcula dinheiro esperado com fundo, vendas, suprimento e sangria", () => {
  const expected = calculateCashExpected({
    openingAmount: 100,
    movements: [{ type: "SUPPLY", amount: 50 }, { type: "WITHDRAWAL", amount: 30 }],
    payments: [
      { method: "CASH", status: "RECORDED", amount: 80 },
      { method: "PIX", status: "RECORDED", amount: 45 },
      { method: "CREDIT_CARD", status: "CONFIRMED", amount: 60 },
    ],
  });
  assert.deepEqual(expected, { CASH: 200, PIX: 45, CREDIT_CARD: 60, DEBIT_CARD: 0, VOUCHER: 0, OTHER: 0 });
});

test("preserva a entrada original e desconta o reembolso registrado", () => {
  const expected = calculateCashExpected({
    openingAmount: 0,
    movements: [],
    payments: [
      { method: "PIX", status: "CANCELLED", amount: 20 },
      { method: "CASH", status: "REFUNDED", amount: 10 },
      { method: "DEBIT_CARD", status: "RECORDED", amount: 35 },
    ],
    refunds: [
      { method: "CASH", status: "RECORDED", amount: 10 },
      { method: "DEBIT_CARD", status: "BLOCKED", amount: 5 },
    ],
  });
  assert.equal(expected.CASH, 0);
  assert.equal(expected.PIX, 0);
  assert.equal(expected.DEBIT_CARD, 35);
});

test("não reduz a conciliação enquanto o provedor externo está bloqueado", () => {
  const expected = calculateCashExpected({
    openingAmount: 0,
    movements: [],
    payments: [{ method: "PIX", status: "RECORDED", amount: 100 }],
    refunds: [{ method: "PIX", status: "BLOCKED", amount: 40 }],
  });
  assert.equal(expected.PIX, 100);
});

test("concilia por meio e não mascara troca entre dinheiro e Pix", () => {
  const expected = { CASH: 100, PIX: 50, CREDIT_CARD: 0, DEBIT_CARD: 0, VOUCHER: 0, OTHER: 0 };
  const declared = { CASH: 90, PIX: 60, CREDIT_CARD: 0, DEBIT_CARD: 0, VOUCHER: 0, OTHER: 0 };
  const result = reconcileCashAmounts(expected, declared);
  assert.equal(result.expectedTotal, result.declaredTotal);
  assert.equal(result.differenceTotal, 0);
  assert.equal(result.matched, false);
  assert.equal(result.differences.CASH, -10);
  assert.equal(result.differences.PIX, 10);
});

test("fecha conciliado somente quando todos os meios coincidem", () => {
  const expected = { CASH: 150.1, PIX: 45.2, CREDIT_CARD: 20, DEBIT_CARD: 10, VOUCHER: 0, OTHER: 0 };
  const result = reconcileCashAmounts(expected, { ...expected });
  assert.equal(result.matched, true);
  assert.equal(result.differenceTotal, 0);
});
