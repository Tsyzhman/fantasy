import assert from "node:assert/strict";
import test from "node:test";

import { buildLeagueStartingXiTable } from "@/machete/league-starting-xi-export";

/** @spec spec://modules/machete/FEAT-001-global-ranking-strategy#player-identity */
test("starting XI player rows and club matrix use the same teams, players and order", () => {
  const table = buildLeagueStartingXiTable([
    {
      id: 2n,
      name: "Zenit",
      players: [
        { playerId: "10", name: "Mateo Cassierra", position: "F", shirtNumber: 30 },
        { playerId: "11", name: "Douglas Santos", position: "D", shirtNumber: 3 }
      ]
    },
    {
      id: 1n,
      name: "Baltika",
      players: [
        { playerId: "20", name: "Nikolay Titkov", position: "M", shirtNumber: 22 },
        { playerId: "21", name: "Yevgeniy Latyshonok", position: "GK", shirtNumber: 1 },
        { playerId: "22", name: "Kevin De Bruyne", position: "M", shirtNumber: 17 }
      ]
    }
  ]);

  assert.deepEqual(table.columns.map((column) => column.header), ["Baltika", "Zenit"]);
  assert.deepEqual(table.playerRows.map(row => [row.playerId, row.playerName, row.teamName]), [
    ["22", "Kevin De Bruyne", "Baltika"], ["20", "Nikolay Titkov", "Baltika"],
    ["21", "Yevgeniy Latyshonok", "Baltika"], ["10", "Mateo Cassierra", "Zenit"], ["11", "Douglas Santos", "Zenit"]
  ]);
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
    { id: 2n, name: "Rodina", players: [{ playerId: "7", name: "Wendel", position: null, shirtNumber: null }] }
  ]);

  assert.deepEqual(table.columns.map((column) => column.header), ["Fakel", "Rodina"]);
  assert.equal(table.columns[0].value(table.rows[0]), "");
  assert.equal(table.columns[1].value(table.rows[0]), "Wendel");
});

test("starting XI export uses the model ranking and caps every club at eleven players", () => {
  const players = Array.from({ length: 14 }, (_, index) => ({
    playerId: String(10 + index),
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
