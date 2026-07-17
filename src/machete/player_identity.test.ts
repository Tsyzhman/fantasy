import assert from "node:assert/strict";
import test from "node:test";

import { applyFantasyPlayerIdentityRows, filterFantasyPlayerIdentityRows, type FantasyPlayerIdentityRef } from "./player_identity";

const rows = [
  { id: "47:2025/2026:10:101", name: "Erling Haaland", teamName: "Manchester City", teamShortName: "Man City", position: "FWD" },
  { id: "47:2025/2026:11:102", name: "João Pedro", teamName: "Chelsea", position: "MID" },
  { id: "47:2025/2026:12:103", name: "Fallback Keeper", teamName: "Arsenal", position: "GK" }
];

test("player identities retain FotMob players when Sports.ru prices are absent", () => {
  const resolved = applyFantasyPlayerIdentityRows(rows, () => null, null);

  assert.equal(resolved.length, 3);
  assert.deepEqual(
    resolved.map((row) => [row.name, row.fantasyIdentitySource]),
    [
      ["Erling Haaland", "fotmob"],
      ["João Pedro", "fotmob"],
      ["Fallback Keeper", "fotmob"]
    ]
  );
});

test("player identities prefer mapped Sports.ru names and positions without hiding fallback rows", () => {
  const refs = new Map<string, FantasyPlayerIdentityRef>([
    [rows[0].id, { playerName: "E. Haaland", position: "MID" }]
  ]);

  const resolved = applyFantasyPlayerIdentityRows(rows, (rowId) => refs.get(rowId) ?? null, "MID");

  assert.deepEqual(
    resolved.map((row) => [row.name, row.position, row.fantasyIdentitySource]),
    [
      ["E. Haaland", "MID", "sports-ru"],
      ["João Pedro", "MID", "fotmob"]
    ]
  );
});

test("player search matches names and teams case-insensitively with accents normalized", () => {
  assert.deepEqual(filterFantasyPlayerIdentityRows(rows, "joao").map((row) => row.id), [rows[1].id]);
  assert.deepEqual(filterFantasyPlayerIdentityRows(rows, "HAALAND city").map((row) => row.id), [rows[0].id]);
  assert.deepEqual(filterFantasyPlayerIdentityRows(rows, "Man City").map((row) => row.id), [rows[0].id]);
  assert.equal(filterFantasyPlayerIdentityRows(rows, "Tottenham").length, 0);
});
