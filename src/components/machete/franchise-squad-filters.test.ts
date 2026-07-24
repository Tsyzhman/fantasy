import assert from "node:assert/strict";
import test from "node:test";

import {
  filterFranchiseSquadRows,
  sortFranchiseSquadRows,
  type FranchiseSquadRow,
  type FranchiseSquadTableFilters
} from "./FranchiseSquadsPanel";

const emptyFilters: FranchiseSquadTableFilters = {
  user: "", squad: "", starterMin: "", starterMax: "", captain: "",
  fpMin: "", fpMax: "", alternativeMin: "", alternativeMax: "", foontasyMin: "", foontasyMax: ""
};

const rows: FranchiseSquadRow[] = [
  {
    userId: "1", userName: "Алексей", email: "admin@example.com", squadName: "Первый", squadUpdatedAt: null,
    starterCount: 11, captainName: "Вендел", fp: 63, alternativeFp: 58, foontasyFp: 61, foontasyAvailable: 11,
    alternativeIssuePlayerNames: ["Боселли"], previewPlayers: [], error: null
  },
  {
    userId: "2", userName: "Борис", squadName: "Второй", squadUpdatedAt: null,
    starterCount: 10, captainName: "Глушенков", fp: 49, alternativeFp: null, foontasyFp: 45, foontasyAvailable: 10,
    alternativeIssuePlayerNames: [], previewPlayers: [], error: null
  }
];

test("advanced panel filters every visible franchise-squad column", () => {
  const cases: Array<[Partial<FranchiseSquadTableFilters>, string]> = [
    [{ user: "алекс" }, "1"],
    [{ squad: "Боселли" }, "1"],
    [{ starterMin: "11" }, "1"],
    [{ captain: "Вендел" }, "1"],
    [{ fpMin: "60" }, "1"],
    [{ alternativeMin: "50", alternativeMax: "60" }, "1"],
    [{ foontasyMin: "60" }, "1"]
  ];
  for (const [filter, expectedId] of cases) {
    assert.deepEqual(filterFranchiseSquadRows(rows, { ...emptyFilters, ...filter }).map((row) => row.userId), [expectedId]);
  }
});

test("numeric ranges exclude missing values only when that column is filtered", () => {
  assert.equal(filterFranchiseSquadRows(rows, emptyFilters).length, 2);
  assert.deepEqual(filterFranchiseSquadRows(rows, { ...emptyFilters, alternativeMax: "100" }).map((row) => row.userId), ["1"]);
});

test("live rows are re-sorted by the active metric and missing values stay last", () => {
  assert.deepEqual(
    sortFranchiseSquadRows(rows, { key: "fp", direction: "desc" }).map((row) => row.userId),
    ["1", "2"]
  );
  const refreshedRows = rows.map((row) => row.userId === "2" ? { ...row, fp: 70 } : row);
  assert.deepEqual(
    sortFranchiseSquadRows(refreshedRows, { key: "fp", direction: "desc" }).map((row) => row.userId),
    ["2", "1"]
  );
  assert.deepEqual(
    sortFranchiseSquadRows(rows, { key: "alternativeFp", direction: "asc" }).map((row) => row.userId),
    ["1", "2"]
  );
});
