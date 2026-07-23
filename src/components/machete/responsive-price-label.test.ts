import assert from "node:assert/strict";
import test from "node:test";

import { compactPriceHeaderThreshold, responsivePriceHeaderLabel } from "./responsive-price-label";

test("price header becomes a dollar sign only below the compact threshold", () => {
  assert.equal(responsivePriceHeaderLabel(compactPriceHeaderThreshold - 1, "en"), "$");
  assert.equal(responsivePriceHeaderLabel(compactPriceHeaderThreshold - 1, "ru"), "$");
  assert.equal(responsivePriceHeaderLabel(compactPriceHeaderThreshold, "en"), "Price");
  assert.equal(responsivePriceHeaderLabel(compactPriceHeaderThreshold, "ru"), "Цена");
});
