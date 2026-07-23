import assert from "node:assert/strict";
import test from "node:test";

import { forecastPointsPerPrice } from "@/machete/fantasy-value-efficiency";

test("forecast asset efficiency is points per one Sports.ru price unit", () => {
  assert.equal(forecastPointsPerPrice(7.5, 10), 0.75);
  assert.equal(forecastPointsPerPrice(5, 6.5), 0.7692);
});

test("forecast asset efficiency stays empty without a valid forecast and price", () => {
  assert.equal(forecastPointsPerPrice(null, 10), null);
  assert.equal(forecastPointsPerPrice(5, null), null);
  assert.equal(forecastPointsPerPrice(5, 0), null);
});
