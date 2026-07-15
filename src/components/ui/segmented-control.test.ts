import assert from "node:assert/strict";
import test from "node:test";

import { segmentedControlIndexForKey } from "@/components/ui/segmented-control";

test("segmented control arrow keys move and wrap across options", () => {
  assert.equal(segmentedControlIndexForKey("ArrowRight", 0, 3), 1);
  assert.equal(segmentedControlIndexForKey("ArrowDown", 2, 3), 0);
  assert.equal(segmentedControlIndexForKey("ArrowLeft", 0, 3), 2);
  assert.equal(segmentedControlIndexForKey("ArrowUp", 1, 3), 0);
});

test("segmented control Home and End keys select boundaries", () => {
  assert.equal(segmentedControlIndexForKey("Home", 2, 3), 0);
  assert.equal(segmentedControlIndexForKey("End", 0, 3), 2);
});

test("segmented control ignores unrelated or invalid keyboard input", () => {
  assert.equal(segmentedControlIndexForKey("Enter", 1, 3), null);
  assert.equal(segmentedControlIndexForKey("ArrowRight", -1, 3), null);
  assert.equal(segmentedControlIndexForKey("ArrowRight", 0, 0), null);
});
