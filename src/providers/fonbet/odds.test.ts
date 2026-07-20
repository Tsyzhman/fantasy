import assert from "node:assert/strict";
import test from "node:test";

import {
  deVigFonbetPair,
  parseFonbetFixtureOdds,
  parseFonbetListBaseOdds,
  PublicFonbetOddsClient,
  type FonbetOddsSource
} from "./odds";

const source: FonbetOddsSource = {
  provider: "FONBET",
  feed: "PUBLIC_LIST_BASE",
  fetchedAt: "2026-07-20T15:00:00.000Z",
  sourceUrl: "https://line-lb61-w.bk6bba-resources.com/ma/events/listBase?lang=ru&scopeMarket=1600"
};

const rplPayload = {
  packetVersion: 80849190715,
  sports: [{ id: 119774, parentId: 1, kind: "segment", name: "Россия. Премьер-лига" }],
  events: [
    {
      id: 66599821,
      sportId: 119774,
      team1: "ЦСКА",
      team2: "Балтика",
      startTime: 1784912400,
      place: "line"
    }
  ],
  customFactors: [
    {
      e: 66599821,
      countAll: 117,
      factors: [
        { f: 1809, v: 1.38, p: 50, pt: "0.5" },
        { f: 1810, v: 2.75, p: 50, pt: "0.5" },
        { f: 1815, v: 2.25, p: 150, pt: "1.5" },
        { f: 1816, v: 1.62, p: 150, pt: "1.5" },
        { f: 1854, v: 1.72, p: 50, pt: "0.5" },
        { f: 1871, v: 2.15, p: 50, pt: "0.5" },
        { f: 1880, v: 3.4, p: 150, pt: "1.5" },
        { f: 1881, v: 1.3, p: 150, pt: "1.5" }
      ]
    }
  ]
};

test("parses direct team markets and maps opponent under 0.5 to clean-sheet probability", () => {
  const parsed = parseFonbetFixtureOdds(rplPayload, 66599821, source);
  assert.ok(parsed !== null);
  assert.equal(parsed.sportId, "119774");
  assert.equal(parsed.sportName, "Россия. Премьер-лига");
  assert.equal(parsed.homeTeamName, "ЦСКА");
  assert.equal(parsed.awayTeamName, "Балтика");
  assert.equal(parsed.startsAt, "2026-07-24T17:00:00.000Z");
  assert.equal(parsed.source, source);

  assertApproximately(parsed.home.teamOver15Probability, fairOver(2.25, 1.62));
  assertApproximately(parsed.away.teamOver15Probability, fairOver(3.4, 1.3));
  assertApproximately(parsed.home.cleanSheetProbability, fairUnder(1.72, 2.15));
  assertApproximately(parsed.away.cleanSheetProbability, fairUnder(1.38, 2.75));
  assert.deepEqual(parsed.markets, {
    home: {
      teamTotal05: { over: 1.38, under: 2.75 },
      teamTotal15: { over: 2.25, under: 1.62 }
    },
    away: {
      teamTotal05: { over: 1.72, under: 2.15 },
      teamTotal15: { over: 3.4, under: 1.3 }
    }
  });
});

test("missing or duplicate sides stay null instead of becoming zero or stale odds", () => {
  const payload = structuredClone(rplPayload);
  payload.customFactors[0].factors = [
    { f: 1815, v: 2.25, p: 150, pt: "1.5" },
    { f: 1816, v: 1.62, p: 150, pt: "1.5" },
    { f: 1816, v: 1.63, p: 150, pt: "1.5" },
    { f: 1854, v: 1.72, p: 50, pt: "0.5" }
  ];

  const parsed = parseFonbetFixtureOdds(payload, 66599821, source);
  assert.ok(parsed !== null);
  assert.equal(parsed.home.teamOver15Probability, null);
  assert.equal(parsed.away.teamOver15Probability, null);
  assert.equal(parsed.home.cleanSheetProbability, null);
  assert.equal(parsed.away.cleanSheetProbability, null);
  assert.deepEqual(parsed.markets.home.teamTotal15, { over: 2.25, under: null });
  assert.deepEqual(parsed.markets.away.teamTotal05, { over: 1.72, under: null });
  assert.equal(parseFonbetFixtureOdds(payload, 999, source), null);
});

test("de-vig normalizes a valid pair and rejects malformed decimal odds", () => {
  const valid = deVigFonbetPair(1.8, 2);
  assert.ok(valid !== null);
  assertApproximately(valid.overProbability, fairOver(1.8, 2));
  assertApproximately(valid.underProbability, fairUnder(1.8, 2));
  assert.equal(deVigFonbetPair(1, 2), null);
  assert.equal(deVigFonbetPair("1.80", 2), null);
  assert.equal(deVigFonbetPair(Number.NaN, 2), null);
});

test("list parser skips ambiguous duplicate events", () => {
  const payload = structuredClone(rplPayload);
  payload.events.push({ ...payload.events[0] });
  assert.deepEqual(parseFonbetListBaseOdds(payload, source), []);
});

test("client calls the verified listBase endpoint once with configurable transport", async () => {
  const calls: URL[] = [];
  const client = new PublicFonbetOddsClient({
    baseUrl: "https://line.example.test/",
    timeoutMs: 1_000,
    language: "ru",
    scopeMarket: 1600,
    fetchImpl: async (input) => {
      calls.push(new URL(input.toString()));
      return Response.json(rplPayload);
    }
  });

  const parsed = await client.getFixtureOdds(66599821);
  assert.ok(parsed !== null);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].origin, "https://line.example.test");
  assert.equal(calls[0].pathname, "/events/listBase");
  assert.equal(calls[0].searchParams.get("lang"), "ru");
  assert.equal(calls[0].searchParams.get("scopeMarket"), "1600");
});

test("client does not retry a failed public-line request", async () => {
  let calls = 0;
  const client = new PublicFonbetOddsClient({
    fetchImpl: async () => {
      calls += 1;
      return new Response("unavailable", { status: 503, statusText: "Unavailable" });
    }
  });

  await assert.rejects(() => client.getAllFixtureOdds(), /503 Unavailable/);
  assert.equal(calls, 1);
});

function fairOver(over: number, under: number): number {
  return (1 / over) / (1 / over + 1 / under);
}

function fairUnder(over: number, under: number): number {
  return (1 / under) / (1 / over + 1 / under);
}

function assertApproximately(actual: number | null, expected: number): void {
  assert.ok(actual !== null);
  assert.ok(Math.abs(actual - expected) < 1e-12);
}
