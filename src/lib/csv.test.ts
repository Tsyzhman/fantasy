import assert from "node:assert/strict";
import { test } from "node:test";

import { toCsv } from "@/lib/csv";

test("toCsv escapes commas, quotes, and new lines", () => {
  const csv = toCsv(
    [{ name: 'Doe, "Jane"', note: "line\nbreak", empty: null }],
    [
      { header: "Name", value: (row) => row.name },
      { header: "Note", value: (row) => row.note },
      { header: "Empty", value: (row) => row.empty }
    ]
  );

  assert.equal(csv, 'Name,Note,Empty\r\n"Doe, ""Jane""","line\nbreak",\r\n');
});
