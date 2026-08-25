import assert from "node:assert/strict";
import test from "node:test";

import { buildShotAssistIndex, findAssisterForShot } from "./shot-assists";
import { summarizeShotPassers } from "./shot-passers";

const ASSISTER_A = { id: 11n, name: "Пасующий А", rawRef: "111" };
const ASSISTER_B = { id: 22n, name: "Passer B", rawRef: "222" };

function event(overrides: Partial<Parameters<typeof buildShotAssistIndex>[0][number]> = {}) {
  return {
    matchId: 100n,
    playerId: 500n,
    minute: 10,
    addedTime: null,
    relatedPlayer: ASSISTER_A,
    ...overrides
  };
}

test("Goal events are matched to shots by match, scorer and minute", () => {
  const index = buildShotAssistIndex([
    event({ playerId: 500n, minute: 10 }),
    event({ playerId: 501n, minute: 44, addedTime: 2, relatedPlayer: ASSISTER_B })
  ]);

  assert.deepEqual(
    findAssisterForShot(index, { matchId: 100n, playerId: 500n, minute: 10, addedTime: null })?.name,
    "Пасующий А"
  );
  assert.deepEqual(
    findAssisterForShot(index, { matchId: 100n, playerId: 501n, minute: 44, addedTime: 2 })?.rawRef,
    "222"
  );
  assert.equal(
    findAssisterForShot(index, { matchId: 999n, playerId: 500n, minute: 10, addedTime: null }),
    null
  );
});

test("Minute mismatches fall back only for unambiguous single-goal scorers", () => {
  const index = buildShotAssistIndex([event({ minute: 63, addedTime: 1 })]);
  // Shotmap says 62', but the scorer scored exactly once in the match.
  assert.deepEqual(
    findAssisterForShot(index, { matchId: 100n, playerId: 500n, minute: 62, addedTime: null })?.id,
    11n
  );

  const brace = buildShotAssistIndex([
    event({ minute: 20 }),
    event({ minute: 70, relatedPlayer: ASSISTER_B })
  ]);
  // Two goals for the same scorer: without a minute match the assister is ambiguous.
  assert.equal(findAssisterForShot(brace, { matchId: 100n, playerId: 500n, minute: 21, addedTime: null }), null);
  assert.deepEqual(
    findAssisterForShot(brace, { matchId: 100n, playerId: 500n, minute: 20, addedTime: null })?.id,
    11n
  );
});

test("Events without a related player or scorer are ignored", () => {
  const index = buildShotAssistIndex([
    event({ relatedPlayer: null }),
    event({ playerId: null })
  ]);
  assert.equal(Object.keys(index.byExactMinute).length === 0 || index.byExactMinute.size === 0, true);
  assert.equal(index.byMatchPlayer.size, 0);
});

test("Passers are aggregated by assists with xG totals and last assist", () => {
  const summaries = summarizeShotPassers([
    {
      assist_player_id: "11",
      assist_player_name: "Пасующий А",
      team_name: "Север",
      xg: 0.11,
      minute: 12,
      event_type: "Goal",
      match_label: "Север — Юг",
      match_date: "2026-08-01T14:00:00.000Z"
    },
    {
      assist_player_id: "11",
      assist_player_name: "Пасующий А",
      team_name: "Север",
      xg: 0.4,
      minute: 77,
      event_type: "Goal",
      match_label: "Север — Запад",
      match_date: "2026-08-10T14:00:00.000Z"
    },
    {
      assist_player_id: "22",
      assist_player_name: "Passer B",
      team_name: "Юг",
      xg: 0.7,
      minute: 5,
      event_type: "Goal",
      match_label: "Юг — Север",
      match_date: "2026-08-12T18:00:00.000Z"
    },
    // Shots without an assister must not produce rows.
    { assist_player_id: null, player_name: "Бьющий", is_goal: true } as never
  ]);

  assert.equal(summaries.length, 2);
  assert.equal(summaries[0].playerName, "Пасующий А");
  assert.equal(summaries[0].assists, 2);
  assert.equal(summaries[0].xgAssisted, 0.51);
  assert.ok(summaries[0].lastAssist.includes("77'"));
  assert.equal(summaries[1].playerName, "Passer B");
});
