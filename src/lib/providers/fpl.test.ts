import assert from "node:assert/strict";
import test from "node:test";

import {
  FPL_LEAGUE_ID,
  FPL_PROVIDER,
  FPL_SEASON,
  FplProviderError,
  FplPublicClient,
  fplRelayPathAllowed,
  fplRelayRequestPath,
  fplChipDefinitions,
  fplPlayerEntityIdentity,
  fplPriceRows,
  latestFinalizedFplGameweek,
  latestPublishedFplGameweek,
  normalizeFplEntryId,
  parseFplBootstrap,
  parseFplLiveEvent,
  parseFplPublishedPicks
} from "./fpl";
import {
  calculateFplOfficialPoints,
  fplChipAvailabilityFromOfficial,
  fplChipAvailabilityFromStoredDefinitions,
  fpl202627Rules,
  nextFplTransferState,
  validateFplChipUsage,
  validateFplSquad
} from "./fpl-rules";

function bootstrapPayload() {
  return {
    events: [
      { id: 1, name: "Gameweek 1", deadline_time: "2026-08-21T17:30:00Z", finished: false, is_previous: false, is_current: false, is_next: true, released: true },
      { id: 2, name: "Gameweek 2", deadline_time: "2026-08-28T17:30:00Z", finished: true, is_previous: true, is_current: false, is_next: false, released: true, data_checked: true }
    ],
    teams: [{ id: 1, name: "Arsenal", short_name: "ARS", code: 3 }],
    elements: [{
      id: 101,
      code: 10001,
      team: 1,
      element_type: 3,
      web_name: "Saka",
      first_name: "Bukayo",
      second_name: "Saka",
      now_cost: 100,
      status: "a",
      chance_of_playing_this_round: null,
      selected_by_percent: "12.3",
      photo: "saka.jpg"
    }],
    element_types: [{ id: 3, singular_name_short: "MID", squad_select: 5, squad_min_play: 2, squad_max_play: 5 }],
    chips: [
      { id: 3, name: "freehit", number: 1, start_event: 2, stop_event: 19, chip_type: "transfer" },
      { id: 4, name: "bboost", number: 1, start_event: 1, stop_event: 19, chip_type: "team" }
    ],
    game_config: { rules: { squad_team_limit: 3 } }
  };
}

test("FPL bootstrap preserves provider ids/codes and never derives identity from names", () => {
  const bootstrap = parseFplBootstrap(bootstrapPayload(), new Date("2026-08-12T00:00:00Z"));
  const rows = fplPriceRows(bootstrap);
  assert.equal(FPL_PROVIDER, "FPL");
  assert.equal(FPL_LEAGUE_ID, 47n);
  assert.equal(FPL_SEASON, "2026/2027");
  assert.deepEqual(rows[0], {
    providerPlayerId: "101",
    providerEntityCode: "10001",
    providerTeamId: "1",
    providerTeamCode: "ARS",
    playerName: "Bukayo Saka",
    fullName: "Bukayo Saka",
    normalizedName: "bukayo saka",
    position: "MID",
    price: 10,
    status: "a",
    chanceOfPlayingThisRound: null,
    selectedByPercent: 12.3,
    photo: "saka.jpg"
  });
  assert.deepEqual(fplPlayerEntityIdentity(rows[0]), {
    provider: "FPL",
    providerSeason: "2026/2027",
    providerEntityType: "PLAYER",
    providerEntityId: "101",
    providerEntityCode: "10001"
  });
});

test("FPL bootstrap fails closed for malformed or ambiguous collections", () => {
  assert.throws(
    () => parseFplBootstrap({ ...bootstrapPayload(), elements: [{ ...bootstrapPayload().elements[0], team: 999 }] }),
    (error: unknown) => error instanceof FplProviderError && error.reason === "MALFORMED"
  );
  assert.throws(() => parseFplBootstrap({ ...bootstrapPayload(), teams: [] }), /required non-empty collection/);
});

test("FPL public client retries unavailable responses and omits credentials", async () => {
  let attempts = 0;
  let observedInit: RequestInit | undefined;
  const client = new FplPublicClient({
    endpoint: "https://fpl.test/bootstrap-static/",
    fetchImpl: (async (_input, init) => {
      observedInit = init;
      attempts += 1;
      if (attempts === 1) return new Response("temporarily unavailable", { status: 503 });
      return new Response(JSON.stringify(bootstrapPayload()), { status: 200, headers: { "content-type": "application/json" } });
    }) as typeof fetch,
    retryBaseDelayMs: 0,
    minimumIntervalMs: 0,
    sleep: async () => undefined
  });
  const result = await client.getBootstrap();
  assert.equal(result.elements[0].id, 101);
  assert.equal(attempts, 2);
  assert.equal(observedInit?.credentials, "omit");
  assert.equal(observedInit?.signal instanceof AbortSignal, true);
});

test("FPL public client does not retry permanent HTTP errors", async () => {
  let attempts = 0;
  const client = new FplPublicClient({
    endpoint: "https://fpl.test/bootstrap-static/",
    fetchImpl: (async () => {
      attempts += 1;
      return new Response("forbidden", { status: 403 });
    }) as typeof fetch,
    retryBaseDelayMs: 0,
    minimumIntervalMs: 0,
    sleep: async () => undefined
  });
  await assert.rejects(() => client.getBootstrap(), (error: unknown) => error instanceof FplProviderError && error.reason === "HTTP" && error.status === 403);
  assert.equal(attempts, 1);
});

test("FPL relay derives only allowlisted paths from official URLs", () => {
  assert.equal(fplRelayRequestPath("https://fantasy.premierleague.com/api/bootstrap-static/"), "/api/bootstrap-static/");
  assert.equal(fplRelayRequestPath("https://fantasy.premierleague.com/api/fixtures/?event=1"), "/api/fixtures/?event=1");
  assert.equal(fplRelayPathAllowed("/api/bootstrap-static/"), true);
  assert.equal(fplRelayPathAllowed("/api/fixtures/"), true);
  assert.equal(fplRelayPathAllowed("/api/teams/"), false);
  assert.equal(fplRelayPathAllowed("/api/entry/123/event/2/picks/"), true);
  assert.equal(fplRelayPathAllowed("/api/not-official/"), false);
});

test("FPL relay refuses invalid socket paths, credentials, hosts, and paths", () => {
  assert.throws(() => new FplPublicClient({ relaySocketPath: "relative/fpl.sock" }), /absolute Unix socket path/);
  assert.throws(() => fplRelayRequestPath("https://user:password@fantasy.premierleague.com/api/bootstrap-static/"), /non-official source URL/);
  assert.throws(() => fplRelayRequestPath("https://example.test/api/bootstrap-static/"), /non-official source URL/);
  assert.throws(() => fplRelayRequestPath("https://fantasy.premierleague.com/api/not-official/"), /non-allowlisted official path/);
});

test("FPL picks parser accepts only a complete published 15-player snapshot", () => {
  const picks = Array.from({ length: 15 }, (_, index) => ({
    element: index + 1,
    position: index + 1,
    is_captain: index === 0,
    is_vice_captain: index === 1,
    multiplier: index === 0 ? 2 : 1,
    purchase_price: 100,
    selling_price: 100
  }));
  const result = parseFplPublishedPicks({ picks, active_chip: null, entry_history: { bank: 50, value: 1000, event_transfers: 2, event_transfers_cost: 4, points: 70 } }, 2);
  assert.equal(result.picks.length, 15);
  assert.equal(result.picks[0].providerPlayerId, "1");
  assert.equal(result.entryHistory.bank, 5);
  assert.throws(() => parseFplPublishedPicks({ picks: picks.slice(0, 14) }, 2), /instead of 15/);
});

test("published gameweek selection is deadline- and release-gated", () => {
  const bootstrap = parseFplBootstrap(bootstrapPayload());
  assert.equal(latestPublishedFplGameweek(bootstrap.events, new Date("2026-08-28T18:00:00Z"))?.id, 2);
  assert.equal(latestPublishedFplGameweek(bootstrap.events, new Date("2026-08-21T17:29:59Z")), null);
  assert.equal(latestFinalizedFplGameweek(bootstrap.events, new Date("2026-08-28T18:00:00Z"))?.id, 2);
});

test("FPL chip definitions preserve official halves and all four chip types", () => {
  const bootstrap = parseFplBootstrap({
    ...bootstrapPayload(),
    chips: [
      { id: 1, name: "wildcard", number: 1, start_event: 1, stop_event: 19, chip_type: "transfer" },
      { id: 2, name: "wildcard", number: 1, start_event: 20, stop_event: 38, chip_type: "transfer" },
      { id: 3, name: "freehit", number: 1, start_event: 2, stop_event: 19, chip_type: "transfer" },
      { id: 4, name: "bboost", number: 1, start_event: 20, stop_event: 38, chip_type: "team" },
      { id: 5, name: "3xc", number: 1, start_event: 1, stop_event: 19, chip_type: "team" }
    ]
  });
  assert.deepEqual(fplChipDefinitions(bootstrap).map((chip) => [chip.code, chip.half]), [
    ["WILDCARD", "FIRST"],
    ["WILDCARD", "SECOND"],
    ["FREE_HIT", "FIRST"],
    ["BENCH_BOOST", "SECOND"],
    ["TRIPLE_CAPTAIN", "FIRST"]
  ]);
  const officialAvailability = fplChipAvailabilityFromOfficial(bootstrap.chips);
  assert.deepEqual(officialAvailability.FREE_HIT?.FIRST, { start: 2, end: 19 });
  const storedAvailability = fplChipAvailabilityFromStoredDefinitions(fplChipDefinitions(bootstrap).map((chip) => ({ code: chip.code, half: chip.half, rules: { startEvent: chip.startEvent, stopEvent: chip.stopEvent } })));
  assert.deepEqual(storedAvailability.BENCH_BOOST?.SECOND, { start: 20, end: 38 });
});

test("FPL squad rules enforce the 15/100/club/formation contract", () => {
  const entries = [
    ...Array.from({ length: 2 }, (_, index) => ({ providerPlayerId: `gk-${index}`, teamId: `gk-team-${index}`, position: "GK" as const, price: 4, isStarter: index === 0 })),
    ...Array.from({ length: 5 }, (_, index) => ({ providerPlayerId: `def-${index}`, teamId: `team-${index % 5}`, position: "DEF" as const, price: 5, isStarter: index < 3 })),
    ...Array.from({ length: 5 }, (_, index) => ({ providerPlayerId: `mid-${index}`, teamId: `team-${index % 5}`, position: "MID" as const, price: 6, isStarter: true })),
    ...Array.from({ length: 3 }, (_, index) => ({ providerPlayerId: `fwd-${index}`, teamId: `team-${index}`, position: "FWD" as const, price: 7, isStarter: index < 2 }))
  ];
  const valid = validateFplSquad(entries);
  assert.equal(valid.ok, true);
  assert.equal(valid.ok && valid.spent, 84);
  const invalid = validateFplSquad(entries.map((entry, index) => index === 14 ? { ...entry, teamId: "team-0" } : entry));
  assert.equal(invalid.ok, false);
});

test("FPL chip validation and scoring are provider-specific", () => {
  assert.equal(validateFplChipUsage({ gameweek: 1, code: "FREE_HIT" }).ok, false);
  assert.equal(validateFplChipUsage({ gameweek: 1, code: "WILDCARD" }).ok, false);
  assert.equal(validateFplChipUsage({ gameweek: 1, code: "BENCH_BOOST" }).ok, true);
  assert.equal(validateFplChipUsage({ gameweek: 2, code: "FREE_HIT" }, [{ gameweek: 2, code: "BENCH_BOOST" }]).ok, false);
  assert.equal(validateFplChipUsage({ gameweek: 3, code: "FREE_HIT" }, [{ gameweek: 2, code: "FREE_HIT" }]).ok, false);
  assert.deepEqual(nextFplTransferState({ bankedFreeTransfers: 2 }, 3), {
    bankedFreeTransfers: 1,
    transfersMade: 3,
    transferCost: -4
  });
  assert.deepEqual(nextFplTransferState({ bankedFreeTransfers: 2 }, 3, "WILDCARD"), {
    bankedFreeTransfers: 2,
    transfersMade: 3,
    transferCost: 0
  });
  assert.deepEqual(nextFplTransferState({ bankedFreeTransfers: 2 }, 3, "FREE_HIT"), {
    bankedFreeTransfers: 2,
    transfersMade: 3,
    transferCost: 0
  });
  const score = calculateFplOfficialPoints({
    position: "DEF",
    minutes: 90,
    goals: 1,
    assists: 1,
    cleanSheet: true,
    saves: 0,
    penaltySaves: 0,
    penaltyMisses: 0,
    ownGoals: 0,
    yellowCards: 0,
    redCards: 0,
    goalsConceded: 0,
    bonus: 3,
    defensiveContributions: 10
  });
  assert.equal(score.points, 20);
  assert.equal(calculateFplOfficialPoints({
    position: "MID",
    minutes: 90,
    goals: 0,
    assists: 0,
    cleanSheet: false,
    saves: 0,
    penaltySaves: 1,
    penaltyMisses: 0,
    ownGoals: 0,
    yellowCards: 0,
    redCards: 0,
    goalsConceded: 0,
    bonus: 0,
    defensiveContributions: 0
  }).points, 2);
  assert.equal(fpl202627Rules.maxBankedFreeTransfers, 5);
});

test("FPL live event parser keeps official total_points and every raw stat", () => {
  const live = parseFplLiveEvent({
    elements: [{ id: 101, stats: { minutes: 90, goals_scored: 1, total_points: 10, bps: 75, defensive_contribution: 12 } }]
  }, 1);
  assert.equal(live.gameweek, 1);
  assert.equal(live.elements[0].points, 10);
  assert.equal(live.elements[0].stats.defensive_contribution, 12);
  assert.throws(() => parseFplLiveEvent({ elements: [{ id: 101, stats: { minutes: 90 } }] }, 1), /total_points/);
});

test("FPL live parser accepts numeric ancillary metrics but protects scoring fields", () => {
  const live = parseFplLiveEvent({
    elements: [{ id: 101, stats: { minutes: "90", total_points: "10", bps: "75.5", influence: 12.3 } }]
  }, 1);
  assert.equal(live.elements[0].stats.minutes, 90);
  assert.equal(live.elements[0].stats.total_points, 10);
  assert.equal(live.elements[0].stats.bps, 75.5);
  assert.equal(live.elements[0].stats.influence, 12.3);
  assert.throws(
    () => parseFplLiveEvent({ elements: [{ id: 101, stats: { minutes: 90, total_points: 10.5 } }] }, 1),
    /scoring stat total_points/
  );
});
