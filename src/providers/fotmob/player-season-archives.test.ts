import assert from "node:assert/strict";
import test from "node:test";

import { extractPlayerSeasonAggregates } from "./client";

test("extractPlayerSeasonAggregates keeps competitive seasons and preserves null semantics", () => {
  const rows = extractPlayerSeasonAggregates({
    careerHistory: {
      careerItems: {
        senior: {
          seasonEntries: [{
            seasonName: "2025/26",
            teamId: 1066681,
            team: "Rodina",
            appearances: 11,
            goals: 1,
            assists: 0,
            tournamentStats: [{
              isFriendly: false,
              tournamentId: -1,
              leagueName: "First League",
              appearances: 11,
              goals: 1,
              assists: "undefined"
            }, {
              isFriendly: true,
              leagueName: "Friendly",
              appearances: 2,
              goals: 5
            }]
          }]
        }
      }
    }
  }, "949519");

  assert.equal(rows.length, 1);
  assert.deepEqual(rows[0], {
    playerId: "949519",
    teamId: "1066681",
    teamName: "Rodina",
    season: "2025/2026",
    providerLeagueId: null,
    competitionName: "First League",
    aggregateScope: "LEAGUE",
    appearances: 11,
    starts: null,
    minutes: null,
    goals: 1,
    assists: null,
    yellowCards: null,
    redCards: null,
    raw: {
      isFriendly: false,
      tournamentId: -1,
      leagueName: "First League",
      appearances: 11,
      goals: 1,
      assists: "undefined"
    }
  });
});

test("single tournament may inherit an exact team-season assist total", () => {
  const [row] = extractPlayerSeasonAggregates({
    careerHistory: {
      careerItems: {
        senior: {
          seasonEntries: [{
            seasonName: "2025/2026",
            teamId: 1,
            appearances: 10,
            goals: 2,
            assists: 3,
            tournamentStats: [{ leagueId: 338, leagueName: "First League", appearances: 10, goals: 2, assists: "undefined" }]
          }]
        }
      }
    }
  }, "7");
  assert.equal(row.assists, 3);
  assert.equal(row.providerLeagueId, "338");
});
