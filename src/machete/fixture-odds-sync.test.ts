import assert from "node:assert/strict";
import test from "node:test";

import { fixtureNameScore, fonbetSportNameToFotMobLeagueId, matchFonbetOddsToMatches } from "./fixture-odds-sync";
import type { FonbetFixtureOdds } from "@/providers/fonbet/odds";

test("maps supported Fonbet competition labels and rejects outright/result groups", () => {
  assert.equal(fonbetSportNameToFotMobLeagueId("Россия. Премьер-Лига. Сезон 26/27"), "63");
  assert.equal(fonbetSportNameToFotMobLeagueId("Англия. Чемпионшип"), "48");
  assert.equal(fonbetSportNameToFotMobLeagueId("Россия. Премьер-Лига. Итоги турнира"), null);
});

test("matches transliterated teams only inside the same league and kickoff", () => {
  const match = {
    id: 5847120n,
    leagueId: 63n,
    matchDate: new Date("2026-07-24T17:00:00.000Z"),
    homeTeam: { name: "CSKA Moscow" },
    awayTeam: { name: "Baltika" }
  };
  const event = fixture({ homeTeamName: "ЦСКА Москва", awayTeamName: "Балтика" });
  assert.ok(fixtureNameScore(match, event) > 0.7);
  assert.deepEqual(matchFonbetOddsToMatches([match], [event]).map((item) => item.event.eventId), ["66039251"]);
  assert.deepEqual(matchFonbetOddsToMatches([match], [{ ...event, sportName: "Англия. Премьер-Лига. Сезон 26/27" }]), []);
});

test("does not guess when two candidates have effectively equal names", () => {
  const match = {
    id: 1n,
    leagueId: 63n,
    matchDate: new Date("2026-07-24T17:00:00.000Z"),
    homeTeam: { name: "Dinamo" },
    awayTeam: { name: "Spartak" }
  };
  const first = fixture({ eventId: "1", homeTeamName: "Динамо", awayTeamName: "Спартак" });
  const second = fixture({ eventId: "2", homeTeamName: "Динамо", awayTeamName: "Спартак" });
  assert.deepEqual(matchFonbetOddsToMatches([match], [first, second]), []);
});

function fixture(overrides: Partial<FonbetFixtureOdds> = {}): FonbetFixtureOdds {
  return {
    eventId: "66039251",
    sportId: "11935",
    sportName: "Россия. Премьер-Лига. Сезон 26/27",
    homeTeamName: "ЦСКА",
    awayTeamName: "Балтика",
    startsAt: "2026-07-24T17:00:00.000Z",
    home: { teamOver15Probability: 0.43, cleanSheetProbability: 0.41 },
    away: { teamOver15Probability: 0.26, cleanSheetProbability: 0.24 },
    markets: {
      home: { teamTotal05: { over: 1.22, under: 3.85 }, teamTotal15: { over: 2.18, under: 1.65 } },
      away: { teamTotal05: { over: 1.58, under: 2.3 }, teamTotal15: { over: 3.6, under: 1.25 } }
    },
    source: { provider: "FONBET", feed: "PUBLIC_LIST_BASE", fetchedAt: "2026-07-20T15:00:00.000Z", sourceUrl: "https://example.test" },
    ...overrides
  };
}
