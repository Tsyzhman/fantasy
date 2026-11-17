import assert from "node:assert/strict";
import test from "node:test";

import { compareSortableValues, parseDateValue } from "./sortable-table";

/** @spec spec://common/PROP-002-editorial-sport-design#contracts */
test("Russian table dates use calendar order across months and validate leap days", () => {
  assert.equal(parseDateValue("03.11.2026"), Date.UTC(2026, 10, 3));
  assert.equal(parseDateValue("17.11.2026"), Date.UTC(2026, 10, 17));
  assert.equal(parseDateValue("29.02.2024"), Date.UTC(2024, 1, 29));
  assert.equal(parseDateValue("29.02.2026"), null);
  assert.ok(parseDateValue("31.10.2026")! < parseDateValue("01.11.2026")!);
});

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
