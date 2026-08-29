import assert from "node:assert/strict";
import test from "node:test";
import { calculateManagerialDre, classifyAbc } from "../dist/services/managerial-report.service.js";

test("DRE gerencial desconta devoluções, tributos, custo e perdas", () => {
  const result = calculateManagerialDre({ grossSales: 1000, discounts: 50, returns: 100, taxes: 85, costOfGoods: 400, losses: 15 });
  assert.deepEqual(result, { grossSales: 1000, discounts: 50, returns: 100, taxes: 85, costOfGoods: 400, losses: 15, netRevenue: 850, contribution: 365, result: 350, margin: 350 / 850 });
});

test("DRE sem receita não produz margem inválida", () => {
  assert.equal(calculateManagerialDre({ grossSales: 0, discounts: 0, returns: 0, taxes: 0, costOfGoods: 0, losses: 0 }).margin, 0);
});

test("curva ABC ordena por receita e informa participação acumulada", () => {
  const rows = classifyAbc([{ name: "A", revenue: 80 }, { name: "C", revenue: 5 }, { name: "B", revenue: 15 }]);
  assert.deepEqual(rows.map((row) => row.name), ["A", "B", "C"]);
  assert.equal(rows[0].class, "A");
  assert.equal(rows[1].class, "B");
  assert.equal(rows[2].class, "C");
  assert.equal(rows[2].cumulativeShare, 1);
});

test("primeiro produto permanece classe A mesmo quando concentra toda a receita", () => {
  assert.equal(classifyAbc([{ name: "Único", revenue: 100 }])[0].class, "A");
});
