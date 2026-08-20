import { normalizeName } from "@/lib/text";

export const FPL_PROVIDER = "FPL" as const;
export const FPL_LEAGUE_ID = 47n;
export const FPL_SEASON = "2026/2027";
export const FPL_TIME_ZONE = "Europe/London";
export const FPL_ORIGIN = "https://fantasy.premierleague.com";
export const FPL_BOOTSTRAP_URL = "https://fantasy.premierleague.com/api/bootstrap-static/";
export const FPL_FIXTURES_URL = "https://fantasy.premierleague.com/api/fixtures/";
export const FPL_ENTRY_URL = "https://fantasy.premierleague.com/api/entry";
export const FPL_EVENT_LIVE_URL = "https://fantasy.premierleague.com/api/event";
export const FPL_POSITION_BY_ELEMENT_TYPE: Readonly<Record<number, "GK" | "DEF" | "MID" | "FWD">> = {
  1: "GK",
  2: "DEF",
  3: "MID",
  4: "FWD"
};

const FPL_TEAM_NAME_ALIASES: Readonly<Record<string, readonly string[]>> = {
  ARS: ["Arsenal"],
  AVL: ["Aston Villa"],
  BOU: ["AFC Bournemouth", "Bournemouth"],
  BRE: ["Brentford"],
  BHA: ["Brighton & Hove Albion", "Brighton and Hove Albion", "Brighton"],
  CHE: ["Chelsea"],
  COV: ["Coventry City", "Coventry"],
  CRY: ["Crystal Palace"],
  EVE: ["Everton"],
  FUL: ["Fulham"],
  HUL: ["Hull City", "Hull"],
  IPS: ["Ipswich Town", "Ipswich"],
  LEE: ["Leeds United", "Leeds"],
  LIV: ["Liverpool"],
  MCI: ["Manchester City", "Man City"],
  MUN: ["Manchester United", "Man Utd"],
  NEW: ["Newcastle United", "Newcastle"],
  NFO: ["Nottingham Forest", "Nott'm Forest"],
  SUN: ["Sunderland"],
  TOT: ["Tottenham Hotspur", "Tottenham", "Spurs"]
};

export type FplEvent = {
  id: number;
  name: string;
  deadlineTime: Date;
  finished: boolean;
  isPrevious: boolean;
  isCurrent: boolean;
  isNext: boolean;
  released: boolean;
  dataChecked: boolean;
};

export type FplTeam = {
  id: number;
  name: string;
  shortName: string;
  code: number;
};

export type FplElement = {
  id: number;
  code: number;
  teamId: number;
  elementType: number;
  webName: string;
  firstName: string;
  secondName: string;
  nowCost: number;
  status: string;
  chanceOfPlayingThisRound: number | null;
  selectedByPercent: number | null;
  photo: string | null;
};

export type FplElementType = {
  id: number;
  singularNameShort: string;
  squadSelect: number;
  squadMinPlay: number;
  squadMaxPlay: number;
};

export type FplOfficialChip = {
  id: number;
  name: string;
  number: number;
  startEvent: number;
  stopEvent: number;
  chipType: string;
};

export type FplBootstrap = {
  events: FplEvent[];
  teams: FplTeam[];
  elements: FplElement[];
  elementTypes: FplElementType[];
  chips: FplOfficialChip[];
  gameConfig: Record<string, unknown>;
  fetchedAt: Date;
};

export type FplFixture = {
  id: number;
  event: number | null;
  homeTeamId: number;
  awayTeamId: number;
  kickoffTime: Date | null;
  started: boolean;
  finished: boolean;
  provisionalStartTime: boolean;
};

export type FplPriceRow = {
  providerPlayerId: string;
  providerEntityCode: string;
  providerTeamId: string;
  providerTeamCode: string;
  playerName: string;
  fullName: string;
  normalizedName: string;
  position: "GK" | "DEF" | "MID" | "FWD";
  price: number;
  status: string;
  chanceOfPlayingThisRound: number | null;
  selectedByPercent: number | null;
  photo: string | null;
};

export type FplPick = {
  providerPlayerId: string;
  position: number;
  isStarter: boolean;
  isCaptain: boolean;
  isViceCaptain: boolean;
  multiplier: number;
  purchasePrice: number | null;
  sellingPrice: number | null;
};

export type FplEntryHistory = {
  bank: number | null;
  value: number | null;
  eventTransfers: number | null;
  eventTransfersCost: number | null;
  points: number | null;
};

export type FplPublishedPicks = {
  gameweek: number;
  activeChip: string | null;
  picks: FplPick[];
  entryHistory: FplEntryHistory;
  payload: Record<string, unknown>;
};

export type FplLivePlayerScore = {
  providerPlayerId: string;
  stats: Record<string, number>;
  points: number;
  /** Official per-fixture scoring rows; required to avoid merging a double gameweek into one sample. */
  fixtureBreakdowns: FplLiveFixtureBreakdown[];
};

export type FplLiveFixtureBreakdown = {
  fixtureId: string;
  stats: Record<string, { value: number; points: number }>;
};

export type FplLiveEvent = {
  gameweek: number;
  elements: FplLivePlayerScore[];
  payload: Record<string, unknown>;
};

export type FplProviderEntityIdentity = {
  provider: typeof FPL_PROVIDER;
  providerSeason: string;
  providerEntityType: "PLAYER" | "TEAM";
  providerEntityId: string;
  providerEntityCode: string | null;
};

export class FplProviderError extends Error {
  readonly reason: "HTTP" | "TIMEOUT" | "MALFORMED" | "UNAVAILABLE";
  readonly status: number | null;

  constructor(message: string, reason: FplProviderError["reason"], status: number | null = null) {
    super(message);
    this.name = "FplProviderError";
    this.reason = reason;
    this.status = status;
  }
}

export type FplClientOptions = {
  endpoint?: string;
  entryEndpoint?: string;
  relaySocketPath?: string | null;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  maxAttempts?: number;
  retryBaseDelayMs?: number;
  minimumIntervalMs?: number;
  now?: () => Date;
  sleep?: (milliseconds: number) => Promise<void>;
};

export function fplClientOptionsFromEnv(): Pick<FplClientOptions, "relaySocketPath" | "timeoutMs" | "maxAttempts" | "retryBaseDelayMs" | "minimumIntervalMs"> {
  return {
    relaySocketPath: process.env.FPL_RELAY_SOCKET_PATH?.trim() || null,
    timeoutMs: environmentInteger("FPL_PRICE_SYNC_TIMEOUT_MS", 15_000, 1),
    maxAttempts: environmentInteger("FPL_PRICE_SYNC_MAX_ATTEMPTS", 3, 1, 5),
    retryBaseDelayMs: environmentInteger("FPL_PRICE_SYNC_RETRY_BASE_DELAY_MS", 500, 0),
    minimumIntervalMs: environmentInteger("FPL_PRICE_SYNC_MIN_INTERVAL_MS", 250, 0)
  };
}

export class FplPublicClient {
  private readonly endpoint: string;
  private readonly entryEndpoint: string;
  private readonly relaySocketPath: string | null;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;
  private readonly maxAttempts: number;
  private readonly retryBaseDelayMs: number;
  private readonly minimumIntervalMs: number;
  private readonly now: () => Date;
  private readonly sleep: (milliseconds: number) => Promise<void>;
  private lastRequestAt = 0;

  constructor(options: FplClientOptions = {}) {
    const environmentOptions = fplClientOptionsFromEnv();
    this.endpoint = options.endpoint ?? FPL_BOOTSTRAP_URL;
    this.entryEndpoint = options.entryEndpoint ?? FPL_ENTRY_URL;
    this.relaySocketPath = normalizeFplRelaySocketPath(
      options.relaySocketPath === undefined ? environmentOptions.relaySocketPath : options.relaySocketPath
    );
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.timeoutMs = positiveInteger(options.timeoutMs, environmentOptions.timeoutMs ?? 15_000);
    this.maxAttempts = boundedInteger(options.maxAttempts, environmentOptions.maxAttempts ?? 3, 1, 5);
    this.retryBaseDelayMs = nonNegativeInteger(options.retryBaseDelayMs, environmentOptions.retryBaseDelayMs ?? 500);
    this.minimumIntervalMs = nonNegativeInteger(options.minimumIntervalMs, environmentOptions.minimumIntervalMs ?? 250);
    this.now = options.now ?? (() => new Date());
    this.sleep = options.sleep ?? defaultSleep;
  }

  async getBootstrap(): Promise<FplBootstrap> {
    const payload = await this.getJson(this.endpoint);
    return parseFplBootstrap(payload, this.now());
  }

  async getFixtures(): Promise<FplFixture[]> {
    const url = this.endpoint.replace(/bootstrap-static\/?$/, "fixtures/");
    return parseFplFixtures(await this.getJson(url));
  }

  async getEntry(entryId: string): Promise<Record<string, unknown>> {
    const normalizedEntryId = normalizeFplEntryId(entryId);
    if (!normalizedEntryId) throw new FplProviderError("FPL entry ID must be a positive integer.", "MALFORMED");
    return parseRecord(await this.getJson(`${this.entryEndpoint}/${normalizedEntryId}/`), "entry");
  }

  async getPublishedPicks(entryId: string, gameweek: number): Promise<FplPublishedPicks> {
    const normalizedEntryId = normalizeFplEntryId(entryId);
    if (!normalizedEntryId) throw new FplProviderError("FPL entry ID must be a positive integer.", "MALFORMED");
    if (!Number.isInteger(gameweek) || gameweek < 1 || gameweek > 50) {
      throw new FplProviderError("FPL gameweek is outside the supported range.", "MALFORMED");
    }
    const payload = parseRecord(
      await this.getJson(`${this.entryEndpoint}/${normalizedEntryId}/event/${gameweek}/picks/`),
      "published picks"
    );
    return parseFplPublishedPicks(payload, gameweek);
  }

  async getLiveEvent(gameweek: number): Promise<FplLiveEvent> {
    if (!Number.isInteger(gameweek) || gameweek < 1 || gameweek > 50) {
      throw new FplProviderError("FPL gameweek is outside the supported range.", "MALFORMED");
    }
    return parseFplLiveEvent(await this.getJson(`${this.endpoint.replace(/bootstrap-static\/?$/, "event")}/${gameweek}/live/`), gameweek);
  }

  private async getJson(url: string): Promise<unknown> {
    let lastError: unknown = null;
    for (let attempt = 0; attempt < this.maxAttempts; attempt += 1) {
      await this.waitForRateLimit();
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
      try {
        const requestInit = {
          method: "GET",
          headers: {
            accept: "application/json",
            "user-agent": "FantasyScoutFplPublicClient/1.0"
          },
          credentials: "omit",
          signal: controller.signal
        } satisfies RequestInit;
        const response = this.relaySocketPath
          ? await fetchFplViaRelaySocket(url, this.relaySocketPath, requestInit)
          : await this.fetchImpl(url, requestInit);
        this.lastRequestAt = Date.now();
        if (!response.ok) {
          const error = new FplProviderError(
            `FPL public endpoint returned HTTP ${response.status}.`,
            response.status === 408 || response.status === 429 || response.status >= 500 ? "UNAVAILABLE" : "HTTP",
            response.status
          );
          lastError = error;
          if (!shouldRetryStatus(response.status) || attempt === this.maxAttempts - 1) throw error;
          await this.sleep(retryDelay(this.retryBaseDelayMs, attempt, response.headers.get("retry-after")));
          continue;
        }
        try {
          return await response.json();
        } catch (error) {
          throw new FplProviderError(`FPL public endpoint returned invalid JSON: ${errorMessage(error)}.`, "MALFORMED");
        }
      } catch (error) {
        lastError = error;
        const isAbort = error instanceof DOMException && error.name === "AbortError";
        if (isAbort) lastError = new FplProviderError("FPL public endpoint timed out.", "TIMEOUT");
        if (error instanceof FplProviderError && error.reason === "HTTP") throw error;
        if (!isAbort && error instanceof FplProviderError && error.reason === "MALFORMED") throw error;
        if (attempt === this.maxAttempts - 1) throw lastError;
        await this.sleep(retryDelay(this.retryBaseDelayMs, attempt, null));
      } finally {
        clearTimeout(timeout);
      }
    }
    throw lastError instanceof Error ? lastError : new FplProviderError("FPL request failed.", "UNAVAILABLE");
  }

  private async waitForRateLimit() {
    const waitMs = this.minimumIntervalMs - (Date.now() - this.lastRequestAt);
    if (waitMs > 0) await this.sleep(waitMs);
  }
}

function normalizeFplRelaySocketPath(value: string | null | undefined) {
  if (!value?.trim()) return null;
  const result = value.trim();
  if (!result.startsWith("/") || result.includes("\0") || result.length > 100) {
    throw new FplProviderError("FPL_RELAY_SOCKET_PATH must be an absolute Unix socket path of at most 100 characters.", "MALFORMED");
  }
  return result;
}

export function fplRelayRequestPath(sourceUrl: string) {
  let source: URL;
  try {
    source = new URL(sourceUrl);
  } catch {
    throw new FplProviderError("FPL source URL is invalid.", "MALFORMED");
  }
  if (source.origin !== FPL_ORIGIN || source.username || source.password || source.hash) {
    throw new FplProviderError("FPL relay refused a non-official source URL.", "MALFORMED");
  }
  if (!fplRelayPathAllowed(source.pathname)) {
    throw new FplProviderError("FPL relay refused a non-allowlisted official path.", "MALFORMED");
  }
  return `${source.pathname}${source.search}`;
}

export function fplRelayPathAllowed(pathname: string) {
  return FPL_RELAY_PATHS.some((pattern) => pattern.test(pathname));
}

const FPL_RELAY_PATHS = [
  /^\/api\/bootstrap-static\/$/,
  /^\/api\/fixtures(?:\/)?$/,
  /^\/api\/event\/[1-9]\d*\/live\/$/,
  /^\/api\/entry\/[1-9]\d*\/$/,
  /^\/api\/entry\/[1-9]\d*\/event\/[1-9]\d*\/picks\/$/
] as const;

async function fetchFplViaRelaySocket(sourceUrl: string, socketPath: string, init: RequestInit): Promise<Response> {
  const requestPath = fplRelayRequestPath(sourceUrl);
  const { request } = await import("node:http");
  return new Promise<Response>((resolve, reject) => {
    let settled = false;
    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      init.signal?.removeEventListener("abort", abort);
      callback();
    };
    const relayRequest = request({
      socketPath,
      path: requestPath,
      method: "GET",
      headers: Object.fromEntries(new Headers(init.headers).entries())
    }, (relayResponse) => {
      const chunks: Buffer[] = [];
      let totalBytes = 0;
      relayResponse.on("data", (chunk: Buffer) => {
        totalBytes += chunk.length;
        if (totalBytes > 8 * 1024 * 1024) {
          relayResponse.destroy(new FplProviderError("FPL relay response exceeded 8 MiB.", "MALFORMED"));
          return;
        }
        chunks.push(chunk);
      });
      relayResponse.on("end", () => finish(() => {
        const responseHeaders = new Headers();
        for (const [name, value] of Object.entries(relayResponse.headers)) {
          if (Array.isArray(value)) value.forEach((item) => responseHeaders.append(name, item));
          else if (value !== undefined) responseHeaders.set(name, value);
        }
        const body = Buffer.concat(chunks);
        resolve(new Response(body.length === 0 ? null : body, {
          status: relayResponse.statusCode ?? 502,
          statusText: relayResponse.statusMessage,
          headers: responseHeaders
        }));
      }));
      relayResponse.on("error", (error) => finish(() => reject(error)));
    });
    const abort = () => relayRequest.destroy(new DOMException("The operation was aborted.", "AbortError"));
    init.signal?.addEventListener("abort", abort, { once: true });
    relayRequest.on("error", (error) => finish(() => reject(error)));
    if (init.signal?.aborted) abort();
    else relayRequest.end();
  });
}

export function parseFplBootstrap(payload: unknown, fetchedAt = new Date()): FplBootstrap {
  const root = parseRecord(payload, "bootstrap-static");
  const events = parseArray(root.events, "events").map((value, index) => parseEvent(value, index));
  const teams = parseArray(root.teams, "teams").map((value, index) => parseTeam(value, index));
  const elements = parseArray(root.elements, "elements").map((value, index) => parseElement(value, index));
  const elementTypes = parseArray(root.element_types, "element_types").map((value, index) => parseElementType(value, index));
  const chips = parseArray(root.chips, "chips").map((value, index) => parseChip(value, index));
  const gameConfig = isRecord(root.game_config) ? root.game_config : {};
  const teamIds = new Set(teams.map((team) => team.id));
  const elementTypeIds = new Set(elementTypes.map((type) => type.id));
  if (events.length === 0 || teams.length === 0 || elements.length === 0 || elementTypes.length === 0) {
    throw new FplProviderError("FPL bootstrap is missing a required non-empty collection.", "MALFORMED");
  }
  if (new Set(events.map((event) => event.id)).size !== events.length) throw new FplProviderError("FPL bootstrap has duplicate event IDs.", "MALFORMED");
  if (new Set(teams.map((team) => team.id)).size !== teams.length) throw new FplProviderError("FPL bootstrap has duplicate team IDs.", "MALFORMED");
  if (new Set(elements.map((element) => element.id)).size !== elements.length) throw new FplProviderError("FPL bootstrap has duplicate element IDs.", "MALFORMED");
  if (elements.some((element) => !teamIds.has(element.teamId) || !elementTypeIds.has(element.elementType))) {
    throw new FplProviderError("FPL bootstrap contains an element with an unknown team or element type.", "MALFORMED");
  }
  return { events, teams, elements, elementTypes, chips, gameConfig, fetchedAt };
}

export function parseFplFixtures(payload: unknown): FplFixture[] {
  const fixtures = parseArray(payload, "fixtures").map((value, index) => {
    const row = parseRecord(value, `fixtures[${index}]`);
    const event = row.event === null ? null : positiveIntegerValue(row.event, `fixtures[${index}].event`);
    const kickoffTime = row.kickoff_time === null ? null : parseDate(row.kickoff_time, `fixtures[${index}].kickoff_time`);
    return {
      id: positiveIntegerValue(row.id, `fixtures[${index}].id`),
      event,
      homeTeamId: positiveIntegerValue(row.team_h, `fixtures[${index}].team_h`),
      awayTeamId: positiveIntegerValue(row.team_a, `fixtures[${index}].team_a`),
      kickoffTime,
      started: row.started === true,
      finished: row.finished === true,
      provisionalStartTime: row.provisional_start_time === true
    } satisfies FplFixture;
  });
  if (fixtures.length === 0) throw new FplProviderError("FPL fixtures payload is empty.", "MALFORMED");
  if (new Set(fixtures.map((fixture) => fixture.id)).size !== fixtures.length) {
    throw new FplProviderError("FPL fixtures payload has duplicate fixture IDs.", "MALFORMED");
  }
  if (fixtures.some((fixture) => fixture.homeTeamId === fixture.awayTeamId)) {
    throw new FplProviderError("FPL fixtures payload contains the same home and away team.", "MALFORMED");
  }
  return fixtures;
}

export function fplPriceRows(bootstrap: FplBootstrap): FplPriceRow[] {
  const teams = new Map(bootstrap.teams.map((team) => [team.id, team]));
  return bootstrap.elements.map((element) => {
    const team = teams.get(element.teamId);
    const position = FPL_POSITION_BY_ELEMENT_TYPE[element.elementType];
    if (!team || !position) throw new FplProviderError(`FPL element ${element.id} has no authoritative position/team.`, "MALFORMED");
    const fullName = [element.firstName, element.secondName].filter(Boolean).join(" ").trim();
    const playerName = element.webName;
    return {
      providerPlayerId: String(element.id),
      providerEntityCode: String(element.code),
      providerTeamId: String(team.id),
      providerTeamCode: team.shortName,
      playerName,
      fullName: fullName || playerName,
      normalizedName: normalizeName(fullName || playerName),
      position,
      price: element.nowCost / 10,
      status: element.status,
      chanceOfPlayingThisRound: element.chanceOfPlayingThisRound,
      selectedByPercent: element.selectedByPercent,
      photo: element.photo
    };
  });
}

export function fplPlayerEntityIdentity(row: FplPriceRow): FplProviderEntityIdentity {
  return {
    provider: FPL_PROVIDER,
    providerSeason: FPL_SEASON,
    providerEntityType: "PLAYER",
    providerEntityId: row.providerPlayerId,
    providerEntityCode: row.providerEntityCode
  };
}

export function fplTeamEntityIdentity(team: FplTeam): FplProviderEntityIdentity {
  return {
    provider: FPL_PROVIDER,
    providerSeason: FPL_SEASON,
    providerEntityType: "TEAM",
    providerEntityId: String(team.id),
    providerEntityCode: team.shortName
  };
}

export function fplTeamNameCandidates(team: FplTeam) {
  return [...new Set([team.name, ...(FPL_TEAM_NAME_ALIASES[team.shortName] ?? [])])];
}

export function normalizeFplEntryId(value: string): string | null {
  const trimmed = value.trim();
  const normalized = /^https?:\/\/fantasy\.premierleague\.com\/entry\/(\d{1,12})\/?(?:\?.*)?$/i.test(trimmed)
    ? trimmed.match(/\/entry\/(\d{1,12})\/?(?:\?.*)?$/i)?.[1] ?? ""
    : trimmed;
  if (!/^\d{1,12}$/.test(normalized) || BigInt(normalized) <= 0n) return null;
  return normalized.replace(/^0+(?=\d)/, "");
}

export function latestPublishedFplGameweek(events: readonly FplEvent[], now = new Date()): FplEvent | null {
  return [...events]
    .filter((event) => event.deadlineTime.getTime() <= now.getTime() && event.released && (event.finished || event.isPrevious))
    .sort((left, right) => right.id - left.id)[0] ?? null;
}

export function latestFinalizedFplGameweek(events: readonly FplEvent[], now = new Date()): FplEvent | null {
  return [...events]
    .filter((event) => event.deadlineTime.getTime() <= now.getTime() && event.released && event.dataChecked && (event.finished || event.isPrevious))
    .sort((left, right) => right.id - left.id)[0] ?? null;
}

export function fplChipCode(name: string): "WILDCARD" | "FREE_HIT" | "BENCH_BOOST" | "TRIPLE_CAPTAIN" | null {
  const normalized = name.trim().toLowerCase().replace(/[_ -]+/g, "");
  if (normalized === "wildcard") return "WILDCARD";
  if (normalized === "freehit") return "FREE_HIT";
  if (normalized === "bboost" || normalized === "benchboost") return "BENCH_BOOST";
  if (normalized === "3xc" || normalized === "triplecaptain") return "TRIPLE_CAPTAIN";
  return null;
}

export function fplChipDefinitions(bootstrap: FplBootstrap) {
  return bootstrap.chips.flatMap((chip) => {
    const code = fplChipCode(chip.name);
    if (!code) return [];
    return [{
      code,
      half: chip.startEvent <= 19 ? "FIRST" as const : "SECOND" as const,
      maxUses: 1,
      startEvent: chip.startEvent,
      stopEvent: chip.stopEvent,
      officialId: chip.id,
      rules: {
        chipType: chip.chipType,
        number: chip.number,
        startEvent: chip.startEvent,
        stopEvent: chip.stopEvent,
        officialId: chip.id,
        ...(code === "BENCH_BOOST" ? { includesBenchPoints: true } : {}),
        ...(code === "TRIPLE_CAPTAIN" ? { captainMultiplier: 3 } : {}),
        ...(code === "WILDCARD" ? { permanentTransfers: true } : {}),
        ...(code === "FREE_HIT" ? { unlimitedTransfers: true, restoresSquadAtNextDeadline: true } : {})
      }
    }];
  });
}

export function parseFplLiveEvent(payload: unknown, gameweek: number): FplLiveEvent {
  if (!Number.isInteger(gameweek) || gameweek < 1 || gameweek > 50) {
    throw new FplProviderError("FPL gameweek is outside the supported range.", "MALFORMED");
  }
  const root = parseRecord(payload, `event ${gameweek} live`);
  const rawElements = parseArray(root.elements, `event ${gameweek} live elements`);
  if (rawElements.length === 0) throw new FplProviderError(`FPL event ${gameweek} live payload has no player rows.`, "MALFORMED");
  const elements = rawElements.map((value, index) => {
    const row = parseRecord(value, `event ${gameweek} live elements[${index}]`);
    const providerPlayerId = String(positiveIntegerValue(row.id, `event ${gameweek} live elements[${index}].id`));
    const rawStats = parseRecord(row.stats, `event ${gameweek} live elements[${index}].stats`);
    const stats: Record<string, number> = {};
    for (const [key, value] of Object.entries(rawStats)) {
      const numericValue = typeof value === "number"
        ? value
        : typeof value === "string" && value.trim() !== ""
          ? Number(value)
          : Number.NaN;
      if (!Number.isFinite(numericValue)) {
        throw new FplProviderError(`FPL live stat ${key} for player ${providerPlayerId} is not numeric.`, "MALFORMED");
      }
      if (FPL_INTEGER_LIVE_STAT_KEYS.has(key) && !Number.isInteger(numericValue)) {
        throw new FplProviderError(`FPL live scoring stat ${key} for player ${providerPlayerId} is not an integer.`, "MALFORMED");
      }
      stats[key] = numericValue;
    }
    if (!Number.isInteger(stats.total_points)) {
      throw new FplProviderError(`FPL live player ${providerPlayerId} has no total_points value.`, "MALFORMED");
    }
    const fixtureBreakdowns = parseFplLiveFixtureBreakdowns(row.explain, gameweek, providerPlayerId, stats.minutes);
    return { providerPlayerId, stats, points: stats.total_points, fixtureBreakdowns } satisfies FplLivePlayerScore;
  });
  if (new Set(elements.map((element) => element.providerPlayerId)).size !== elements.length) {
    throw new FplProviderError(`FPL event ${gameweek} live payload has duplicate player IDs.`, "MALFORMED");
  }
  return { gameweek, elements, payload: root };
}

function parseFplLiveFixtureBreakdowns(
  value: unknown,
  gameweek: number,
  providerPlayerId: string,
  minutes: number | undefined
): FplLiveFixtureBreakdown[] {
  const rows = parseArray(value, `event ${gameweek} player ${providerPlayerId} explain`);
  if (rows.length === 0) {
    if (minutes === 0) return [];
    throw new FplProviderError(`FPL event ${gameweek} player ${providerPlayerId} has no fixture explanation rows.`, "MALFORMED");
  }
  const fixtures = rows.map((entry, fixtureIndex) => {
    const row = parseRecord(entry, `event ${gameweek} player ${providerPlayerId} explain[${fixtureIndex}]`);
    const fixtureId = String(positiveIntegerValue(row.fixture, `event ${gameweek} player ${providerPlayerId} explain[${fixtureIndex}].fixture`));
    const stats = Object.fromEntries(parseArray(row.stats, `event ${gameweek} player ${providerPlayerId} explain[${fixtureIndex}].stats`).map((stat, statIndex) => {
      const statRow = parseRecord(stat, `event ${gameweek} player ${providerPlayerId} explain[${fixtureIndex}].stats[${statIndex}]`);
      const identifier = requiredString(statRow.identifier, `event ${gameweek} player ${providerPlayerId} explain[${fixtureIndex}].stats[${statIndex}].identifier`);
      const points = finiteNumericValue(statRow.points, `event ${gameweek} player ${providerPlayerId} explain[${fixtureIndex}].stats[${statIndex}].points`);
      const statValue = finiteNumericValue(statRow.value, `event ${gameweek} player ${providerPlayerId} explain[${fixtureIndex}].stats[${statIndex}].value`);
      return [identifier, { value: statValue, points }] as const;
    }));
    return { fixtureId, stats };
  });
  if (new Set(fixtures.map((fixture) => fixture.fixtureId)).size !== fixtures.length) {
    throw new FplProviderError(`FPL event ${gameweek} player ${providerPlayerId} has duplicate fixture explanations.`, "MALFORMED");
  }
  return fixtures;
}

const FPL_INTEGER_LIVE_STAT_KEYS = new Set([
  "minutes",
  "goals_scored",
  "assists",
  "clean_sheets",
  "saves",
  "penalties_saved",
  "penalties_missed",
  "own_goals",
  "yellow_cards",
  "red_cards",
  "goals_conceded",
  "bonus",
  "defensive_contribution",
  "total_points"
]);

export function parseFplPublishedPicks(payload: Record<string, unknown>, gameweek: number): FplPublishedPicks {
  const rawPicks = parseArray(payload.picks, "picks");
  if (rawPicks.length !== 15) throw new FplProviderError(`FPL published picks returned ${rawPicks.length} players instead of 15.`, "MALFORMED");
  const picks = rawPicks.map((value, index) => {
    const row = parseRecord(value, `picks[${index}]`);
    const element = positiveIntegerValue(row.element, `picks[${index}].element`);
    const position = positiveIntegerValue(row.position, `picks[${index}].position`);
    if (position > 15) throw new FplProviderError(`FPL pick position ${position} is outside 1..15.`, "MALFORMED");
    return {
      providerPlayerId: String(element),
      position,
      isStarter: position <= 11,
      isCaptain: row.is_captain === true,
      isViceCaptain: row.is_vice_captain === true,
      multiplier: integerOrDefault(row.multiplier, 1),
      purchasePrice: moneyTenths(row.purchase_price),
      sellingPrice: moneyTenths(row.selling_price)
    } satisfies FplPick;
  });
  if (new Set(picks.map((pick) => pick.providerPlayerId)).size !== 15 || new Set(picks.map((pick) => pick.position)).size !== 15) {
    throw new FplProviderError("FPL published picks contain duplicate player or lineup positions.", "MALFORMED");
  }
  if (picks.filter((pick) => pick.isCaptain).length !== 1 || picks.filter((pick) => pick.isViceCaptain).length !== 1) {
    throw new FplProviderError("FPL published picks must contain exactly one captain and one vice-captain.", "MALFORMED");
  }
  const history = isRecord(payload.entry_history) ? payload.entry_history : {};
  return {
    gameweek,
    activeChip: typeof payload.active_chip === "string" ? payload.active_chip : null,
    picks: picks.sort((left, right) => left.position - right.position),
    entryHistory: {
      bank: moneyTenths(history.bank),
      value: moneyTenths(history.value),
      eventTransfers: integerOrNull(history.event_transfers),
      eventTransfersCost: integerOrNull(history.event_transfers_cost),
      points: integerOrNull(history.points)
    },
    payload
  };
}

function parseEvent(value: unknown, index: number): FplEvent {
  const row = parseRecord(value, `events[${index}]`);
  const id = positiveIntegerValue(row.id, `events[${index}].id`);
  const deadlineTime = parseDate(row.deadline_time, `events[${index}].deadline_time`);
  return {
    id,
    name: requiredString(row.name, `events[${index}].name`),
    deadlineTime,
    finished: row.finished === true,
    isPrevious: row.is_previous === true,
    isCurrent: row.is_current === true,
    isNext: row.is_next === true,
    released: row.released !== false,
    dataChecked: row.data_checked === true
  };
}

function parseTeam(value: unknown, index: number): FplTeam {
  const row = parseRecord(value, `teams[${index}]`);
  return {
    id: positiveIntegerValue(row.id, `teams[${index}].id`),
    name: requiredString(row.name, `teams[${index}].name`),
    shortName: requiredString(row.short_name, `teams[${index}].short_name`),
    code: positiveIntegerValue(row.code, `teams[${index}].code`)
  };
}

function parseElement(value: unknown, index: number): FplElement {
  const row = parseRecord(value, `elements[${index}]`);
  const chance = numberOrNull(row.chance_of_playing_this_round, `elements[${index}].chance_of_playing_this_round`);
  if (chance !== null && (chance < 0 || chance > 100)) throw new FplProviderError(`Invalid FPL chance of playing at elements[${index}].`, "MALFORMED");
  return {
    id: positiveIntegerValue(row.id, `elements[${index}].id`),
    code: positiveIntegerValue(row.code, `elements[${index}].code`),
    teamId: positiveIntegerValue(row.team, `elements[${index}].team`),
    elementType: positiveIntegerValue(row.element_type, `elements[${index}].element_type`),
    webName: requiredString(row.web_name, `elements[${index}].web_name`),
    firstName: stringValue(row.first_name),
    secondName: stringValue(row.second_name),
    nowCost: nonNegativeIntegerValue(row.now_cost, `elements[${index}].now_cost`),
    status: stringValue(row.status),
    chanceOfPlayingThisRound: chance,
    selectedByPercent: numberOrNull(row.selected_by_percent, `elements[${index}].selected_by_percent`),
    photo: typeof row.photo === "string" ? row.photo : null
  };
}

function parseElementType(value: unknown, index: number): FplElementType {
  const row = parseRecord(value, `element_types[${index}]`);
  return {
    id: positiveIntegerValue(row.id, `element_types[${index}].id`),
    singularNameShort: requiredString(row.singular_name_short, `element_types[${index}].singular_name_short`),
    squadSelect: positiveIntegerValue(row.squad_select, `element_types[${index}].squad_select`),
    squadMinPlay: positiveIntegerValue(row.squad_min_play, `element_types[${index}].squad_min_play`),
    squadMaxPlay: positiveIntegerValue(row.squad_max_play, `element_types[${index}].squad_max_play`)
  };
}

function parseChip(value: unknown, index: number): FplOfficialChip {
  const row = parseRecord(value, `chips[${index}]`);
  return {
    id: positiveIntegerValue(row.id, `chips[${index}].id`),
    name: requiredString(row.name, `chips[${index}].name`),
    number: positiveIntegerValue(row.number, `chips[${index}].number`),
    startEvent: positiveIntegerValue(row.start_event, `chips[${index}].start_event`),
    stopEvent: positiveIntegerValue(row.stop_event, `chips[${index}].stop_event`),
    chipType: requiredString(row.chip_type, `chips[${index}].chip_type`)
  };
}

function parseRecord(value: unknown, label: string): Record<string, unknown> {
  if (!isRecord(value)) throw new FplProviderError(`FPL ${label} is not an object.`, "MALFORMED");
  return value;
}

function parseArray(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) throw new FplProviderError(`FPL ${label} is not an array.`, "MALFORMED");
  return value;
}

function parseDate(value: unknown, label: string) {
  if (typeof value !== "string") throw new FplProviderError(`FPL ${label} is not an ISO timestamp.`, "MALFORMED");
  const result = new Date(value);
  if (Number.isNaN(result.getTime())) throw new FplProviderError(`FPL ${label} is not a valid timestamp.`, "MALFORMED");
  return result;
}

function requiredString(value: unknown, label: string) {
  const result = typeof value === "string" ? value.trim() : "";
  if (!result) throw new FplProviderError(`FPL ${label} is empty.`, "MALFORMED");
  return result;
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function positiveIntegerValue(value: unknown, label: string) {
  if (!Number.isInteger(value) || (value as number) <= 0) throw new FplProviderError(`FPL ${label} is not a positive integer.`, "MALFORMED");
  return value as number;
}

function nonNegativeIntegerValue(value: unknown, label: string) {
  if (!Number.isInteger(value) || (value as number) < 0) throw new FplProviderError(`FPL ${label} is not a non-negative integer.`, "MALFORMED");
  return value as number;
}

function numberOrNull(value: unknown, label: string) {
  if (value === null || value === undefined || value === "") return null;
  const result = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(result)) throw new FplProviderError(`FPL ${label} is not numeric.`, "MALFORMED");
  return result;
}

function integerOrNull(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  return Number.isInteger(value) ? value as number : null;
}

function integerOrDefault(value: unknown, fallback: number) {
  return Number.isInteger(value) ? value as number : fallback;
}

function moneyTenths(value: unknown) {
  const number = integerOrNull(value);
  return number === null ? null : number / 10;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function shouldRetryStatus(status: number) {
  return status === 408 || status === 425 || status === 429 || status >= 500;
}

function retryDelay(baseDelayMs: number, attempt: number, retryAfter: string | null) {
  const retryAfterSeconds = retryAfter ? Number(retryAfter) : NaN;
  if (Number.isFinite(retryAfterSeconds) && retryAfterSeconds >= 0) return Math.min(30_000, retryAfterSeconds * 1_000);
  return Math.min(30_000, baseDelayMs * 2 ** attempt);
}

function finiteNumericValue(value: unknown, label: string) {
  const result = typeof value === "number" ? value : typeof value === "string" && value.trim() !== "" ? Number(value) : Number.NaN;
  if (!Number.isFinite(result)) throw new FplProviderError(`FPL ${label} is not numeric.`, "MALFORMED");
  return result;
}

function positiveInteger(value: number | undefined, fallback: number) {
  return Number.isInteger(value) && (value ?? 0) > 0 ? value! : fallback;
}

function nonNegativeInteger(value: number | undefined, fallback: number) {
  return Number.isInteger(value) && (value ?? 0) >= 0 ? value! : fallback;
}

function boundedInteger(value: number | undefined, fallback: number, min: number, max: number) {
  return Number.isInteger(value) && (value ?? 0) >= min && (value ?? 0) <= max ? value! : fallback;
}

function environmentInteger(name: string, fallback: number, minimum: number, maximum?: number) {
  const parsed = Number(process.env[name]);
  if (!Number.isInteger(parsed) || parsed < minimum || (maximum !== undefined && parsed > maximum)) return fallback;
  return parsed;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function defaultSleep(milliseconds: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
}
