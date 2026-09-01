import assert from "node:assert/strict";
import test from "node:test";

import { buildLeagueStartingXiTable } from "@/machete/league-starting-xi-export";

test("starting XI export uses one team per column and compact FotMob names", () => {
  const table = buildLeagueStartingXiTable([
    {
      id: 2n,
      name: "Zenit",
      players: [
        { name: "Mateo Cassierra", position: "F", shirtNumber: 30 },
        { name: "Douglas Santos", position: "D", shirtNumber: 3 }
      ]
    },
    {
      id: 1n,
      name: "Baltika",
      players: [
        { name: "Nikolay Titkov", position: "M", shirtNumber: 22 },
        { name: "Yevgeniy Latyshonok", position: "GK", shirtNumber: 1 },
        { name: "Kevin De Bruyne", position: "M", shirtNumber: 17 }
      ]
    }
  ]);

  assert.deepEqual(table.columns.map((column) => column.header), ["Baltika", "Zenit"]);
  assert.deepEqual(
    table.rows.map((row) => table.columns.map((column) => column.value(row))),
    [
      ["K. De Bruyne", "M. Cassierra"],
      ["N. Titkov", "D. Santos"],
      ["Y. Latyshonok", ""]
    ]
  );
});

test("starting XI export keeps every active team even when no starter is marked", () => {
  const table = buildLeagueStartingXiTable([
    { id: 1n, name: "Fakel", players: [] },
    { id: 2n, name: "Rodina", players: [{ name: "Wendel", position: null, shirtNumber: null }] }
  ]);

  assert.deepEqual(table.columns.map((column) => column.header), ["Fakel", "Rodina"]);
  assert.equal(table.columns[0].value(table.rows[0]), "");
  assert.equal(table.columns[1].value(table.rows[0]), "Wendel");
});

test("starting XI export uses the model ranking and caps every club at eleven players", () => {
  const players = Array.from({ length: 14 }, (_, index) => ({
    name: `Player ${index}`,
    position: "M",
    shirtNumber: null,
    isStarter: index === 0,
    startProbability: index / 20,
    expectedMinutes: index
  }));
  const table = buildLeagueStartingXiTable([{ id: 1n, name: "Rodina", players }]);
  const values = table.rows.map((row) => table.columns[0].value(row));

  assert.equal(values.length, 11);
  assert.ok(values.includes("P. 0"));
  assert.ok(values.includes("P. 13"));
  assert.ok(!values.includes("P. 1"));
});
