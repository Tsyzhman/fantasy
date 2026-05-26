import assert from "node:assert/strict";
import test from "node:test";

import { finiteNumberQueryParam } from "./api-query";

test("finiteNumberQueryParam distinguishes missing values from explicit zero", () => {
  assert.equal(finiteNumberQueryParam(null), null);
  assert.equal(finiteNumberQueryParam(""), null);
  assert.equal(finiteNumberQueryParam("   "), null);
  assert.equal(finiteNumberQueryParam("0"), 0);
});

test("finiteNumberQueryParam accepts finite numbers only", () => {
  assert.equal(finiteNumberQueryParam("90"), 90);
  assert.equal(finiteNumberQueryParam("12.5"), 12.5);
  assert.equal(finiteNumberQueryParam("abc"), null);
  assert.equal(finiteNumberQueryParam("Infinity"), null);
});
