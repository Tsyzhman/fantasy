import assert from "node:assert/strict";
import test from "node:test";

import { compareSortableValues } from "./sortable-table";

const empty = { kind: "empty", text: "" } as const;
const zero = { kind: "number", number: 0, text: "0" } as const;
const positive = { kind: "number", number: 5, text: "5" } as const;

test("empty sortable values stay after numbers in both directions", () => {
  assert.ok(compareSortableValues(empty, positive, "asc") > 0);
  assert.ok(compareSortableValues(empty, positive, "desc") > 0);
  assert.ok(compareSortableValues(positive, empty, "asc") < 0);
  assert.ok(compareSortableValues(positive, empty, "desc") < 0);
});

test("numeric zero sorts as a number rather than an empty value", () => {
  assert.ok(compareSortableValues(zero, positive, "asc") < 0);
  assert.ok(compareSortableValues(zero, positive, "desc") > 0);
});
