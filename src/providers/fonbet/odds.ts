export const FONBET_PUBLIC_LINE_BASE_URL = "https://line-lb61-w.bk6bba-resources.com/ma";

export const FONBET_FOOTBALL_FACTOR_IDS = {
  home: {
    over05: 1809,
    under05: 1810,
    over15: 1815,
    under15: 1816
  },
  away: {
    over05: 1854,
    under05: 1871,
    over15: 1880,
    under15: 1881
  }
} as const;

export interface FonbetOddsSource {
  provider: "FONBET";
  feed: "PUBLIC_LIST_BASE";
  fetchedAt: string;
  sourceUrl: string;
}

export interface FonbetTeamMarketProbabilities {
  teamOver15Probability: number | null;
  cleanSheetProbability: number | null;
}

export interface FonbetDecimalOddsPair {
  over: number | null;
  under: number | null;
}

export interface FonbetRawTeamMarkets {
  teamTotal05: FonbetDecimalOddsPair;
  teamTotal15: FonbetDecimalOddsPair;
}

export interface FonbetFixtureOdds {
  eventId: string;
  sportId: string | null;
  sportName: string | null;
  homeTeamName: string;
  awayTeamName: string;
  startsAt: string | null;
  home: FonbetTeamMarketProbabilities;
  away: FonbetTeamMarketProbabilities;
  markets: {
    home: FonbetRawTeamMarkets;
    away: FonbetRawTeamMarkets;
  };
  source: FonbetOddsSource;
}

export interface FonbetDeViggedPair {
  overProbability: number;
  underProbability: number;
}

export interface FonbetOddsClientOptions {
  baseUrl?: string;
  timeoutMs?: number;
  language?: string;
  scopeMarket?: number;
  fetchImpl?: typeof fetch;
}

type JsonRecord = Record<string, unknown>;

/**
 * Removes the proportional margin from a complete over/under pair.
 * An incomplete or invalid pair is null so callers never turn missing line
 * data into a zero probability.
 */
export function deVigFonbetPair(overOdds: unknown, underOdds: unknown): FonbetDeViggedPair | null {
  const over = decimalOdds(overOdds);
  const under = decimalOdds(underOdds);
  if (over === null || under === null) return null;

  const overImplied = 1 / over;
  const underImplied = 1 / under;
  const denominator = overImplied + underImplied;
  if (!Number.isFinite(denominator) || denominator <= 0) return null;

  return {
    overProbability: overImplied / denominator,
    underProbability: underImplied / denominator
  };
}

/** Parse every unambiguous pre-match event in a Fonbet listBase payload. */
export function parseFonbetListBaseOdds(
  payload: unknown,
  source: FonbetOddsSource
): FonbetFixtureOdds[] {
  const root = asRecord(payload);
  const events = Array.isArray(root.events) ? root.events : [];
  const sports = Array.isArray(root.sports) ? root.sports : [];
  const customFactors = Array.isArray(root.customFactors) ? root.customFactors : [];
  const factorsByEvent = groupFactorsByEvent(customFactors);
  const sportNamesById = uniqueSportNamesById(sports);

  const seenEventIds = new Set<string>();
  const ambiguousEventIds = new Set<string>();
  for (const input of events) {
    const eventId = identifier(asRecord(input).id);
    if (eventId === null) continue;
    if (seenEventIds.has(eventId)) ambiguousEventIds.add(eventId);
    seenEventIds.add(eventId);
  }

  const parsed: FonbetFixtureOdds[] = [];
  for (const input of events) {
    const event = asRecord(input);
    const eventId = identifier(event.id);
    if (eventId === null || ambiguousEventIds.has(eventId)) continue;

    const homeTeamName = nonEmptyString(event.team1);
    const awayTeamName = nonEmptyString(event.team2);
    if (homeTeamName === null || awayTeamName === null) continue;
    const sportId = identifier(event.sportId);

    const eventFactors = factorsByEvent.get(eventId) ?? [];
    const homeGoals15 = oddsPairForFactors(
      eventFactors,
      FONBET_FOOTBALL_FACTOR_IDS.home.over15,
      FONBET_FOOTBALL_FACTOR_IDS.home.under15
    );
    const awayGoals15 = oddsPairForFactors(
      eventFactors,
      FONBET_FOOTBALL_FACTOR_IDS.away.over15,
      FONBET_FOOTBALL_FACTOR_IDS.away.under15
    );
    const homeGoals05 = oddsPairForFactors(
      eventFactors,
      FONBET_FOOTBALL_FACTOR_IDS.home.over05,
      FONBET_FOOTBALL_FACTOR_IDS.home.under05
    );
    const awayGoals05 = oddsPairForFactors(
      eventFactors,
      FONBET_FOOTBALL_FACTOR_IDS.away.over05,
      FONBET_FOOTBALL_FACTOR_IDS.away.under05
    );
    const homeOver15 = deVigFonbetPair(homeGoals15.over, homeGoals15.under);
    const awayOver15 = deVigFonbetPair(awayGoals15.over, awayGoals15.under);
    const homeGoals05Probability = deVigFonbetPair(homeGoals05.over, homeGoals05.under);
    const awayGoals05Probability = deVigFonbetPair(awayGoals05.over, awayGoals05.under);

    parsed.push({
      eventId,
      sportId,
      sportName: sportId === null ? null : sportNamesById.get(sportId) ?? null,
      homeTeamName,
      awayTeamName,
      startsAt: unixSecondsToIso(event.startTime),
      home: {
        teamOver15Probability: homeOver15?.overProbability ?? null,
        // A home clean sheet is the away team's under 0.5 selection.
        cleanSheetProbability: awayGoals05Probability?.underProbability ?? null
      },
      away: {
        teamOver15Probability: awayOver15?.overProbability ?? null,
        // An away clean sheet is the home team's under 0.5 selection.
        cleanSheetProbability: homeGoals05Probability?.underProbability ?? null
      },
      markets: {
        home: {
          teamTotal05: homeGoals05,
          teamTotal15: homeGoals15
        },
        away: {
          teamTotal05: awayGoals05,
          teamTotal15: awayGoals15
        }
      },
      source
    });
  }

  return parsed;
}

export function parseFonbetFixtureOdds(
  payload: unknown,
  eventId: string | number,
  source: FonbetOddsSource
): FonbetFixtureOdds | null {
  const targetId = identifier(eventId);
  if (targetId === null) return null;
  return parseFonbetListBaseOdds(payload, source).find((fixture) => fixture.eventId === targetId) ?? null;
}

export class PublicFonbetOddsClient {
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly language: string;
  private readonly scopeMarket: number;
  private readonly fetchImpl: typeof fetch;

  constructor(options: FonbetOddsClientOptions = {}) {
    this.baseUrl = (options.baseUrl ?? FONBET_PUBLIC_LINE_BASE_URL).replace(/\/+$/, "");
    this.timeoutMs = positiveInteger(options.timeoutMs) ?? 15_000;
    this.language = options.language?.trim() || "ru";
    this.scopeMarket = positiveInteger(options.scopeMarket) ?? 1600;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async getFixtureOdds(eventId: string | number): Promise<FonbetFixtureOdds | null> {
    const { payload, source } = await this.fetchListBase();
    return parseFonbetFixtureOdds(payload, eventId, source);
  }

  async getAllFixtureOdds(): Promise<FonbetFixtureOdds[]> {
    const { payload, source } = await this.fetchListBase();
    return parseFonbetListBaseOdds(payload, source);
  }

  private async fetchListBase(): Promise<{ payload: unknown; source: FonbetOddsSource }> {
    const url = new URL(`${this.baseUrl}/events/listBase`);
    url.searchParams.set("lang", this.language);
    url.searchParams.set("scopeMarket", String(this.scopeMarket));

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.fetchImpl(url, {
        headers: { Accept: "application/json" },
        signal: controller.signal
      });
      if (!response.ok) {
        throw new Error(`Fonbet listBase request failed with ${response.status} ${response.statusText}.`);
      }

      const payload: unknown = await response.json();
      if (!isRecord(payload)) throw new Error("Fonbet listBase returned a non-object JSON payload.");

      return {
        payload,
        source: {
          provider: "FONBET",
          feed: "PUBLIC_LIST_BASE",
          fetchedAt: new Date().toISOString(),
          sourceUrl: url.toString()
        }
      };
    } finally {
      clearTimeout(timeout);
    }
  }
}

function uniqueSportNamesById(inputs: unknown[]): Map<string, string> {
  const names = new Map<string, string>();
  const ambiguous = new Set<string>();
  for (const input of inputs) {
    const sport = asRecord(input);
    const sportId = identifier(sport.id);
    const name = nonEmptyString(sport.name);
    if (sportId === null || name === null) continue;
    const previous = names.get(sportId);
    if (previous !== undefined && previous !== name) ambiguous.add(sportId);
    else names.set(sportId, name);
  }
  for (const sportId of ambiguous) names.delete(sportId);
  return names;
}

function groupFactorsByEvent(inputs: unknown[]): Map<string, JsonRecord[]> {
  const grouped = new Map<string, JsonRecord[]>();
  for (const input of inputs) {
    const group = asRecord(input);
    const eventId = identifier(group.e);
    if (eventId === null || !Array.isArray(group.factors)) continue;
    const factors = grouped.get(eventId) ?? [];
    factors.push(...group.factors.map(asRecord));
    grouped.set(eventId, factors);
  }
  return grouped;
}

function oddsPairForFactors(
  factors: readonly JsonRecord[],
  overFactorId: number,
  underFactorId: number
): FonbetDecimalOddsPair {
  const over = factors.filter((factor) => positiveInteger(factor.f) === overFactorId);
  const under = factors.filter((factor) => positiveInteger(factor.f) === underFactorId);
  return {
    over: over.length === 1 ? decimalOdds(over[0].v) : null,
    under: under.length === 1 ? decimalOdds(under[0].v) : null
  };
}

function decimalOdds(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 1 ? value : null;
}

function unixSecondsToIso(value: unknown): string | null {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0) return null;
  const date = new Date(value * 1_000);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function positiveInteger(value: unknown): number | null {
  if (typeof value === "number") return Number.isSafeInteger(value) && value > 0 ? value : null;
  if (typeof value !== "string" || !/^[1-9]\d*$/.test(value.trim())) return null;
  const parsed = Number(value.trim());
  return Number.isSafeInteger(parsed) ? parsed : null;
}

function identifier(value: unknown): string | null {
  const parsed = positiveInteger(value);
  return parsed === null ? null : String(parsed);
}

function nonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asRecord(value: unknown): JsonRecord {
  return isRecord(value) ? value : {};
}
