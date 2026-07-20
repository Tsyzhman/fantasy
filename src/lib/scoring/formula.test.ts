import assert from "node:assert/strict";
import test from "node:test";

import { calculateCustomFormulaScore, normalizeFormulaMetric, validateCustomFormula } from "./formula";

test("keeps arithmetic precedence, parentheses, unary operators and metric normalization", () => {
  assert.equal(calculateCustomFormulaScore("2 + 3 * 4", {}), 14);
  assert.equal(calculateCustomFormulaScore("-(2 + 3) * +2", {}), -10);
  assert.equal(calculateCustomFormulaScore("{xG / per 90} + {Save %}", { xg_per_90: 1.2, save_percent: "80%" }), 81.2);
  assert.equal(normalizeFormulaMetric(" xG/per90 "), "xg_per_90");
});

test("power is right associative and binds more tightly than unary signs", () => {
  assert.equal(calculateCustomFormulaScore("2^3^2", {}), 512);
  assert.equal(calculateCustomFormulaScore("-2^2", {}), -4);
  assert.equal(calculateCustomFormulaScore("(-2)^2", {}), 4);
  assert.equal(calculateCustomFormulaScore("2^-2", {}), 0.25);
});

test("supports the whitelisted numeric functions", () => {
  assert.equal(calculateCustomFormulaScore("min(4, 2, 8) + max(1, 5, 3)", {}), 7);
  assert.equal(calculateCustomFormulaScore("abs(-3) + sqrt(9) + pow(2, 3)", {}), 14);
  assert.ok(Math.abs(calculateCustomFormulaScore("log(exp(2))", {}) - 2) < 1e-12);
  assert.equal(calculateCustomFormulaScore("clamp(12, 0, 10)", {}), 10);
  assert.equal(calculateCustomFormulaScore("SAFE_DIV(9, 3)", {}), 3);
  assert.equal(calculateCustomFormulaScore("safe_div(9, 0)", {}), 0);
  assert.equal(calculateCustomFormulaScore("safe_div(9, 0, 4)", {}), 4);
});

test("if is lazy and treats zero as false", () => {
  assert.equal(calculateCustomFormulaScore("if({available}, 10/{denominator}, 7)", { available: 0, denominator: 0 }), 7);
  assert.equal(calculateCustomFormulaScore("if({available}, 10/{denominator}, 7)", { available: 1, denominator: 2 }), 5);
});

test("comparison functions return numeric booleans for editable thresholds", () => {
  assert.equal(calculateCustomFormulaScore("gt(61, 60) + gte(60, 60)", {}), 2);
  assert.equal(calculateCustomFormulaScore("lt(59, 60) + lte(60, 60)", {}), 2);
  assert.equal(calculateCustomFormulaScore("eq(0.5, safe_div(1, 2))", {}), 1);
  assert.equal(calculateCustomFormulaScore("if(gte({minutes}, 60), 2, 1)", { minutes: 75 }), 2);
});

test("poisson_groups returns the expected number of complete scoring groups", () => {
  assert.equal(calculateCustomFormulaScore("poisson_groups(0, 3)", {}), 0);
  const expectedPairsAtOne = (1 - Math.exp(-1) * (1 + 1)) + (1 - Math.exp(-1) * (1 + 1 + 1 / 2 + 1 / 6));
  assert.ok(Math.abs(calculateCustomFormulaScore("poisson_groups(1, 2)", {}) - expectedPairsAtOne) < 0.002);
  assert.throws(() => calculateCustomFormulaScore("poisson_groups(-1, 3)", {}), /non-negative lambda/);
  assert.throws(() => calculateCustomFormulaScore("poisson_groups(1, 2.5)", {}), /positive integer/);
  assert.throws(() => calculateCustomFormulaScore("poisson_groups(1001, 3)", {}), /lambda up to 1000/);
});

test("coalesce is lazy and distinguishes missing metrics from numeric zero", () => {
  assert.equal(calculateCustomFormulaScore("coalesce({missing}, {actual}, 9)", { actual: 4 }), 4);
  assert.equal(calculateCustomFormulaScore("coalesce({actual}, 1/0)", { actual: 0 }), 0);
  assert.equal(calculateCustomFormulaScore("coalesce({missing}, 9)", {}), 9);
  assert.equal(calculateCustomFormulaScore("{missing} + 2", {}), 2);
});

test("validation parses without evaluating runtime metric values", () => {
  assert.deepEqual(validateCustomFormula("{xG}/{Minutes}"), { ok: true });
  assert.deepEqual(validateCustomFormula("if({available}, 1/{value}, 0)"), { ok: true });
  assert.equal(validateCustomFormula("2 +").ok, false);
  assert.equal(validateCustomFormula("(2 + 3").ok, false);
});

test("rejects unknown functions, invalid arity and malformed calls", () => {
  assert.match(validateCustomFormula("eval(1)").message ?? "", /Unsupported function/);
  assert.match(validateCustomFormula("pow(2)").message ?? "", /expects 2 arguments/);
  assert.match(validateCustomFormula("clamp(1, 2)").message ?? "", /expects 3 arguments/);
  assert.match(validateCustomFormula("max()").message ?? "", /at least 1 argument/);
  assert.equal(validateCustomFormula("sqrt 4").ok, false);
  assert.equal(validateCustomFormula("min(1,)").ok, false);
});

test("reports runtime domain, division and finite-result errors", () => {
  assert.throws(() => calculateCustomFormulaScore("1/0", {}), /Division by zero/);
  assert.throws(() => calculateCustomFormulaScore("sqrt(-1)", {}), /non-negative/);
  assert.throws(() => calculateCustomFormulaScore("log(0)", {}), /positive/);
  assert.throws(() => calculateCustomFormulaScore("clamp(1, 3, 2)", {}), /min to be less/);
  assert.throws(() => calculateCustomFormulaScore("exp(10000)", {}), /finite number/);
});

test("enforces formula length, token and nesting limits", () => {
  assert.match(validateCustomFormula("1".repeat(4_001)).message ?? "", /4000 characters/);
  assert.match(validateCustomFormula(Array.from({ length: 501 }, () => "1").join("+")).message ?? "", /1000 tokens/);
  assert.match(validateCustomFormula(`${"(".repeat(65)}1${")".repeat(65)}`).message ?? "", /nesting depth/);
});
