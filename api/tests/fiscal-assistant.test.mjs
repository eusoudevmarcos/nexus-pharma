import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateFiscalSuggestionConfidence,
  fiscalSuggestionRisks,
} from "../dist/services/fiscal-assistant.service.js";

test("limits confidence when no approved legal source is available", () => {
  const input = {
    approvedCategory: true,
    hasFiscalRule: true,
    hasMatrixRule: true,
    hasLegalSources: false,
    hasOperationStates: true,
    hasProductComposition: true,
  };
  assert.equal(calculateFiscalSuggestionConfidence(input), 0.49);
  assert.ok(fiscalSuggestionRisks(input).includes("LEGAL_SOURCE_NOT_FOUND"));
});

test("gives high but never absolute confidence to a fully sourced suggestion", () => {
  const input = {
    approvedCategory: true,
    hasFiscalRule: true,
    hasMatrixRule: true,
    hasLegalSources: true,
    hasOperationStates: true,
    hasProductComposition: true,
  };
  assert.equal(calculateFiscalSuggestionConfidence(input), 0.95);
  assert.deepEqual(fiscalSuggestionRisks(input), []);
});

test("makes missing matrix and composition explicit instead of inventing a rule", () => {
  const input = {
    approvedCategory: true,
    hasFiscalRule: true,
    hasMatrixRule: false,
    hasLegalSources: true,
    hasOperationStates: false,
    hasProductComposition: false,
  };
  assert.deepEqual(fiscalSuggestionRisks(input), [
    "UF_OPERATION_MATRIX_NOT_FOUND",
    "OPERATION_STATES_INCOMPLETE",
    "PRODUCT_COMPOSITION_NOT_INFORMED",
  ]);
});
