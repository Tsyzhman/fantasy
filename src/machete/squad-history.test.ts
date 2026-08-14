import assert from "node:assert/strict";
import test from "node:test";

import { applyFantasyHistorySearchParams, parseFantasyHistorySettings, resolveFantasyHistory, resolveFantasyProjectionScopes } from "./squad-history";

test("history settings default safely and preserve repeated exact seasons", () => {
  assert.deepEqual(parseFantasyHistorySettings({}), {
    scope: "ALL_LOADED",
    window: "LAST_5",
    selectedSeasons: []
  });
  const settings = parseFantasyHistorySettings({
    historyScope: "ALL_LOADED",
    historyWindow: "SELECTED_SEASONS",
    historySeason: ["2024/2025", "2025/2026", "2024/2025"]
  });
  assert.deepEqual(settings.selectedSeasons, ["2025/2026", "2024/2025"]);
  const params = applyFantasyHistorySearchParams(new URLSearchParams("leagueId=47"), settings);
  assert.deepEqual(params.getAll("historySeason"), ["2025/2026", "2024/2025"]);
});

test("all-player history explicitly enables cross-team matches such as national teams", async () => {
  const resolved = await resolveFantasyHistory(historyPrisma() as never, league(47n), {
    scope: "ALL_PLAYER_MATCHES",
    window: "LAST_5",
    selectedSeasons: []
  });

  assert.equal(resolved.includePlayerHistory, true);
  assert.equal(resolved.historyScopes.length, 5);
  assert.deepEqual(
    resolved.projectionScopes.map((scope) => `${scope.leagueId}:${scope.season}:${scope.teamId}`).sort(),
    ["47:2025/2026:10", "47:2025/2026:20"]
  );
});

test("empty selected-season mode falls back to last five", () => {
  assert.equal(parseFantasyHistorySettings({ historyWindow: "SELECTED_SEASONS" }).window, "LAST_5");
});

test("same-country scope resolves each UCL team to its own national competitions", async () => {
  const prisma = historyPrisma();
  const resolved = await resolveFantasyHistory(prisma as never, league(), {
    scope: "SAME_COUNTRY_CLUB",
    window: "ALL_LOADED",
    selectedSeasons: []
  });
  assert.deepEqual(
    resolved.historyScopes.map((scope) => `${scope.leagueId}:${scope.season}:${scope.teamId}`).sort(),
    ["47:2025/2026:10", "54:2025/2026:20", "99:2024/2025:10"]
  );
  assert.deepEqual(resolved.availableSeasons, ["2025/2026", "2024/2025"]);
});

test("selected plus UEFA includes selected competition and Champions or Europa League only", async () => {
  const resolved = await resolveFantasyHistory(historyPrisma() as never, league(47n), {
    scope: "SELECTED_PLUS_UEFA",
    window: "SELECTED_SEASONS",
    selectedSeasons: ["2025/2026"]
  });
  assert.deepEqual(new Set(resolved.historyScopes.map((scope) => String(scope.leagueId))), new Set(["47", "42", "73"]));
  assert.deepEqual(resolved.availableSeasons, ["2025/2026", "2024/2025"]);
  assert.deepEqual(resolved.matchWindow, { kind: "all" });
});

test("domestic forecast minutes use only the selected competition", async () => {
  const resolved = await resolveFantasyHistory(historyPrisma() as never, league(47n), {
    scope: "ALL_LOADED",
    window: "LAST_5",
    selectedSeasons: []
  });

  assert.deepEqual(
    resolved.projectionScopes.map((scope) => `${scope.leagueId}:${scope.season}:${scope.teamId}`).sort(),
    ["47:2025/2026:10", "47:2025/2026:20"]
  );
  assert.equal(resolved.historyScopes.some((scope) => scope.leagueId === 99n), true);
});

test("UCL forecast minutes combine UCL with each club's primary domestic league and exclude cups or UEL", async () => {
  const resolved = await resolveFantasyHistory(historyPrisma() as never, league(42n), {
    scope: "ALL_LOADED",
    window: "LAST_5",
    selectedSeasons: []
  });

  assert.deepEqual(
    resolved.projectionScopes.map((scope) => `${scope.leagueId}:${scope.season}:${scope.teamId}`).sort(),
    ["42:2025/2026:10", "42:2025/2026:20", "47:2025/2026:10", "54:2025/2026:20"]
  );
});

test("UEL forecast minutes combine UEL with each club's primary domestic league without adding UCL", async () => {
  const resolved = await resolveFantasyHistory(historyPrisma() as never, league(73n), {
    scope: "ALL_LOADED",
    window: "LAST_5",
    selectedSeasons: []
  });

  assert.deepEqual(
    resolved.projectionScopes.map((scope) => `${scope.leagueId}:${scope.season}:${scope.teamId}`).sort(),
    ["47:2025/2026:10", "54:2025/2026:20", "73:2025/2026:10", "73:2025/2026:20"]
  );
});

test("primary domestic league selection ignores a newer Turkish cup and an older pre-promotion league", () => {
  const rosterScopes = [{ leagueId: 42n, season: "2026/2027", teamId: 10n }];
  const matches = [
    ...Array.from({ length: 30 }, (_, index) => match(165n, "1. Lig", "Turkey", 10n, "2025/2026", `2026-05-${String(index % 20 + 1).padStart(2, "0")}`)),
    ...Array.from({ length: 3 }, (_, index) => match(71n, "Super Lig", "Turkey", 10n, "2026/2027", `2026-08-${String(index + 1).padStart(2, "0")}`)),
    match(999n, "Türkiye Kupası", "Turkey", 10n, "2026/2027", "2026-08-10")
  ];

  assert.deepEqual(
    resolveFantasyProjectionScopes(league(42n), rosterScopes, matches)
      .map((scope) => `${scope.leagueId}:${scope.season}:${scope.teamId}`).sort(),
    ["42:2026/2027:10", "71:2026/2027:10"]
  );
});

test("selected season without selected-competition matches keeps current roster scopes", async () => {
  const resolved = await resolveFantasyHistory(historyPrisma() as never, league(47n), {
    scope: "SELECTED_COMPETITION",
    window: "SELECTED_SEASONS",
    selectedSeasons: ["2024/2025"]
  });

  assert.equal(resolved.rosterScopes.length, 2);
  assert.deepEqual(resolved.historyScopes, []);
  assert.deepEqual(resolved.matchWindow, { kind: "all" });
});

function league(leagueId = 42n) {
  return {
    leagueId,
    season: "2025/2026",
    name: leagueId === 42n ? "UEFA Champions League" : leagueId === 73n ? "UEFA Europa League" : "Premier League",
    displayName: "Competition",
    country: leagueId === 42n || leagueId === 73n ? "International" : "England",
    providerLeagueId: String(leagueId),
    isCurrent: true,
    updatedAt: new Date("2026-01-01T00:00:00Z")
  };
}

function historyPrisma() {
  return {
    leagueSeasonTeam: {
      findMany: async () => [
        { teamId: 10n, team: { country: "England" } },
        { teamId: 20n, team: { country: "Spain" } }
      ]
    },
    coreMatch: {
      findMany: async () => [
        match(47n, "Premier League", "England", 10n, "2025/2026", "2026-01-12"),
        match(54n, "LaLiga", "Spain", 20n, "2025/2026", "2026-01-11"),
        match(42n, "UEFA Champions League", "International", 10n, "2025/2026", "2026-01-10"),
        match(73n, "UEFA Europa League", "International", 20n, "2025/2026", "2026-01-09"),
        match(99n, "FA Cup", "England", 10n, "2024/2025", "2026-01-13")
      ]
    }
  };
}

function match(leagueId: bigint, name: string, country: string, homeTeamId: bigint, season = "2025/2026", matchDate = "2026-01-01") {
  return { leagueId, season, matchDate: new Date(`${matchDate}T12:00:00Z`), homeTeamId, awayTeamId: 999n, league: { name, country } };
}
