import { mockFotMobFixtures, mockFotMobLeague, mockFotMobTeams } from "./mock-data";
import { createXMasHeader, xMasSigningPath } from "./signing";
import type { FotMobFixture, FotMobFixtureDetails, FotMobLeague, FotMobPlayer, FotMobPlayerMatchStat, FotMobTeam } from "./types";

export interface FotMobClient {
  getLeague(leagueId: string, season?: string): Promise<FotMobLeague>;
  getTeams(leagueId: string, season?: string): Promise<FotMobTeam[]>;
  getFixtures(leagueId: string, season?: string): Promise<FotMobFixture[]>;
  getFixtureDetails(fixtureId: string): Promise<FotMobFixtureDetails>;
  getPlayer(playerId: string): Promise<FotMobPlayer>;
}

export class FotMobFixtureDetailsUnavailableError extends Error {
  constructor(
    readonly fixtureId: string,
    readonly reason: string
  ) {
    super(`FotMob matchDetails unavailable for ${fixtureId}: ${reason}`);
    this.name = "FotMobFixtureDetailsUnavailableError";
  }
}

export class MockFotMobClient implements FotMobClient {
  async getLeague() {
    return mockFotMobLeague;
  }

  async getTeams() {
    return mockFotMobTeams;
  }

  async getFixtures() {
    return mockFotMobFixtures.map(({ playerStats: _playerStats, ...fixture }) => fixture);
  }

  async getFixtureDetails(fixtureId: string) {
    const fixture = mockFotMobFixtures.find((item) => item.id === fixtureId);
    if (!fixture) throw new Error(`Mock FotMob fixture not found: ${fixtureId}`);
    return { ...fixture, raw: fixture };
  }

  async getPlayer(playerId: string) {
    const player = mockFotMobTeams.flatMap((team) => team.players).find((item) => item.id === playerId);
    if (!player) throw new Error(`Mock FotMob player not found: ${playerId}`);
    return player;
  }
}

type JsonRecord = Record<string, unknown>;

export class UnofficialFotMobClient implements FotMobClient {
  protected readonly baseUrl = process.env.MACHETE_FOTMOB_BASE_URL || "https://www.fotmob.com/api";
  protected readonly ccode3 = process.env.MACHETE_FOTMOB_CCODE3 || "GBR";
  protected readonly timezone = process.env.MACHETE_FOTMOB_TIMEZONE || "Europe/London";
  // FotMob rate-limits signed /api/data/* requests with a per-IP token
  // bucket; ~5 quick successes empty it, then several requests in a row get
  // 403 until it refills. matchDetails goes through the unsigned next-data
  // endpoint and bypasses this entirely, so the spacing only matters for
  // league/team/fixtures sync. Override via
  // MACHETE_FOTMOB_REQUEST_INTERVAL_MS if FotMob tightens or loosens the
  // limit.
  protected readonly requestIntervalMs = Number(process.env.MACHETE_FOTMOB_REQUEST_INTERVAL_MS || 2_000);
  private lastRequestAt = 0;
  private cachedBuildId: string | null = null;
  private buildIdInflight: Promise<string> | null = null;

  async getLeague(leagueId: string, season?: string): Promise<FotMobLeague> {
    const requestSeason = fotMobRequestSeason(leagueId, season);
    const payload = await this.getJson("/data/leagues", {
      id: leagueId,
      ccode3: this.ccode3,
      ...(requestSeason ? { season: requestSeason } : {})
    });
    const data = asRecord(payload);
    const details = asRecord(data.details);

    return {
      id: stringValue(details.id) ?? leagueId,
      name: stringValue(details.name) ?? "FotMob league",
      country: stringValue(details.country),
      season: stringValue(details.selectedSeason) ?? (leagueId === "77" ? requestSeason : season),
      logoUrl: leagueLogoUrl(stringValue(details.id) ?? leagueId)
    };
  }

  async getTeams(leagueId: string, season?: string): Promise<FotMobTeam[]> {
    const requestSeason = fotMobRequestSeason(leagueId, season);
    const leaguePayload = await this.getJson("/data/leagues", {
      id: leagueId,
      ccode3: this.ccode3,
      ...(requestSeason ? { season: requestSeason } : {})
    });
    const league = asRecord(leaguePayload);
    const tableTeams = extractLeagueTeamsFromLeaguePayload(league, { leagueId, season: requestSeason ?? season });
    const teams: FotMobTeam[] = [];

    for (const tableTeam of tableTeams) {
      if (!tableTeam.id) continue;
      const teamPayload = await this.getJson("/data/teams", {
        id: tableTeam.id,
        ccode3: this.ccode3
      });
      teams.push(normalizeTeam(teamPayload, leagueId, tableTeam));
    }

    return teams;
  }

  async getFixtures(leagueId: string, season?: string): Promise<FotMobFixture[]> {
    const requestSeason = fotMobRequestSeason(leagueId, season);
    const payload = await this.getJson("/data/fixtures", {
      id: leagueId,
      ccode3: this.ccode3,
      timezone: this.timezone,
      ...(requestSeason ? { season: requestSeason } : {})
    });
    if (!Array.isArray(payload)) return [];

    return payload.map((item) => normalizeFixture(item, leagueId)).filter((item): item is FotMobFixture => item !== null);
  }

  async getFixtureDetails(fixtureId: string): Promise<FotMobFixtureDetails> {
    // The /api/data/matchDetails endpoint is signed AND rate-limited at ~5
    // requests per IP bucket. The Next.js page-data endpoint serves the same
    // payload, is unsigned, and is cached at Cloudflare's edge — much higher
    // throughput. We resolve the slug via the same buildId path, then fetch
    // the matches/<slug>.json blob.
    const pageProps = await this.fetchMatchPageProps(fixtureId);
    const validated = validatedMatchDetailsPayload(fixtureId, pageProps, "next-data");

    const general = asRecord(asRecord(pageProps).general);
    const header = asRecord(asRecord(pageProps).header);
    const fixture = normalizeFixtureFromPageProps(fixtureId, general, header);
    if (!fixture) {
      throw new FotMobFixtureDetailsUnavailableError(fixtureId, "next-data payload could not be normalized");
    }

    return {
      ...fixture,
      playerStats: [],
      raw: validated
    };
  }

  private async fetchMatchPageProps(matchId: string): Promise<unknown> {
    let buildId = await this.getBuildId();
    let slug: string;
    try {
      slug = await this.resolveMatchSlug(matchId, buildId);
    } catch (error) {
      // Stale buildId after a FotMob deploy → refetch once and retry.
      if (isNotFoundError(error)) {
        buildId = await this.getBuildId({ force: true });
        slug = await this.resolveMatchSlug(matchId, buildId);
      } else {
        throw error;
      }
    }

    const url = `https://www.fotmob.com/_next/data/${buildId}/matches/${slug}.json`;
    const data = await this.fetchUnsignedJson(url);
    const pageProps = asRecord(asRecord(data).pageProps);
    if (Object.keys(pageProps).length === 0) {
      throw new FotMobFixtureDetailsUnavailableError(matchId, "next-data response missing pageProps");
    }
    return pageProps;
  }

  private async resolveMatchSlug(matchId: string, buildId: string): Promise<string> {
    const url = `https://www.fotmob.com/_next/data/${buildId}/match/${matchId}.json`;
    const data = await this.fetchUnsignedJson(url);
    const pageProps = asRecord(asRecord(data).pageProps);
    const redirect = stringValue(pageProps.__N_REDIRECT);
    if (!redirect) {
      throw new FotMobFixtureDetailsUnavailableError(matchId, "next-data slug redirect missing");
    }
    return redirect.replace(/^\/matches\//, "").replace(/#.*$/, "");
  }

  private async getBuildId(options: { force?: boolean } = {}): Promise<string> {
    if (options.force) {
      this.cachedBuildId = null;
    }
    if (this.cachedBuildId) return this.cachedBuildId;
    if (!this.buildIdInflight) {
      this.buildIdInflight = this.fetchBuildId().finally(() => { this.buildIdInflight = null; });
    }
    this.cachedBuildId = await this.buildIdInflight;
    return this.cachedBuildId;
  }

  private async fetchBuildId(): Promise<string> {
    const html = await this.fetchUnsignedText("https://www.fotmob.com/");
    const match = html.match(/"buildId":"([^"]+)"/);
    if (!match?.[1]) {
      throw new Error("FotMob homepage did not include a buildId — unable to use Next.js data endpoint.");
    }
    return match[1];
  }

  private async fetchUnsignedJson(url: string): Promise<unknown> {
    const text = await this.fetchUnsignedText(url);
    try {
      return JSON.parse(text);
    } catch (error) {
      throw new Error(`FotMob next-data endpoint returned non-JSON: ${(error as Error).message}`);
    }
  }

  private async fetchUnsignedText(url: string): Promise<string> {
    let lastError: unknown;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const response = await fetch(url, {
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
            Accept: "application/json, text/plain, */*",
            "Accept-Language": "en-US,en;q=0.9",
            Referer: "https://www.fotmob.com/"
          },
          signal: AbortSignal.timeout(20_000)
        });

        if (response.status === 404) {
          throw new NextDataNotFoundError(url);
        }
        if (!response.ok) {
          throw new Error(`FotMob next-data request failed with ${response.status} ${response.statusText}`);
        }

        return await response.text();
      } catch (error) {
        if (error instanceof NextDataNotFoundError) throw error;
        lastError = error;
        if (attempt === 2) break;
        await wait(750 * 2 ** attempt + Math.floor(Math.random() * 250));
      }
    }
    throw lastError instanceof Error ? lastError : new Error("FotMob next-data request failed.");
  }

  async getPlayer(playerId: string): Promise<FotMobPlayer> {
    const payload = await this.getJson("/data/playerData", { id: playerId });
    const data = asRecord(payload);
    const primaryTeam = asRecord(data.primaryTeam);
    const playerInformation = asRecord(data.playerInformation);

    return {
      id: playerId,
      teamId: stringValue(primaryTeam.teamId) ?? "",
      name: stringValue(data.name) ?? stringValue(playerInformation.name) ?? `FotMob player ${playerId}`,
      position: stringValue(playerInformation.positionDescription) ?? stringValue(data.positionDescription),
      age: numberValue(playerInformation.age),
      nationality: stringValue(playerInformation.country),
      height: formatHeight(numberValue(playerInformation.height)),
      foot: stringValue(playerInformation.foot),
      photoUrl: playerPhotoUrl(playerId)
    };
  }

  protected async getJson(path: string, params: Record<string, string | number | undefined>): Promise<unknown> {
    const url = new URL(`${this.baseUrl}${path}`);
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }

    const maxAttempts = 5;
    let lastError: unknown;
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      try {
        await this.throttle();
        const response = await fetch(url, {
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
            Accept: "application/json, text/plain, */*",
            "Accept-Language": "en-US,en;q=0.9",
            Referer: "https://www.fotmob.com/",
            "x-mas": createXMasHeader(xMasSigningPath(url))
          },
          signal: AbortSignal.timeout(20_000)
        });

        if (response.status === 403 || response.status === 429) {
          // FotMob rate-limits signed requests sporadically. Back off long
          // enough that the per-IP/per-token bucket refills before the next
          // attempt, then retry with a fresh `code` timestamp.
          throw new RateLimitedError(response.status);
        }

        if (!response.ok) {
          throw new Error(`FotMob request failed with ${response.status} ${response.statusText}`);
        }

        const contentType = response.headers.get("content-type") ?? "";
        if (!contentType.includes("application/json")) {
          throw new Error(`FotMob returned ${contentType || "non-JSON"} for ${path}.`);
        }

        const data = await response.json();
        const record = asRecord(data);
        if (record.code === "TURNSTILE_REQUIRED" || record.error === "Verification required") {
          throw new Error("FotMob rejected the signed request (TURNSTILE_REQUIRED). The x-mas secret may have rotated; update src/providers/fotmob/signing.ts.");
        }

        return data;
      } catch (error) {
        lastError = error;
        if (attempt === maxAttempts - 1) break;
        const isRateLimit = error instanceof RateLimitedError;
        // 3s, 6s, 12s, 24s for rate limit; 0.75s, 1.5s, 3s, 6s for transient
        const backoff = isRateLimit ? 3_000 * 2 ** attempt : 750 * 2 ** attempt;
        const jitter = Math.floor(Math.random() * 500);
        await wait(backoff + jitter);
      }
    }

    throw lastError instanceof Error ? lastError : new Error("FotMob request failed.");
  }

  private async throttle(): Promise<void> {
    if (this.requestIntervalMs <= 0) return;
    const now = Date.now();
    const earliestNext = this.lastRequestAt + this.requestIntervalMs;
    if (now < earliestNext) {
      const jitter = Math.floor(Math.random() * 300);
      await wait(earliestNext - now + jitter);
    }
    this.lastRequestAt = Date.now();
  }
}

class RateLimitedError extends Error {
  constructor(readonly status: number) {
    super(`FotMob rate-limited the signed request with ${status}`);
    this.name = "RateLimitedError";
  }
}

class NextDataNotFoundError extends Error {
  constructor(readonly url: string) {
    super(`FotMob next-data 404: ${url}`);
    this.name = "NextDataNotFoundError";
  }
}

function isNotFoundError(error: unknown): boolean {
  return error instanceof NextDataNotFoundError;
}

function normalizeFixtureFromPageProps(
  fixtureId: string,
  general: JsonRecord,
  header: JsonRecord
): FotMobFixture | null {
  const homeTeam = asRecord(general.homeTeam);
  const awayTeam = asRecord(general.awayTeam);
  const homeTeamId = stringValue(homeTeam.id) ?? stringValue(homeTeam.teamId);
  const awayTeamId = stringValue(awayTeam.id) ?? stringValue(awayTeam.teamId);
  if (!homeTeamId || !awayTeamId) return null;

  const headerStatus = asRecord(header.status);
  const teamsArray = Array.isArray(header.teams) ? header.teams.map(asRecord) : [];

  return {
    id: fixtureId,
    leagueId: stringValue(general.leagueId) ?? "",
    homeTeamId,
    awayTeamId,
    kickoffAt:
      stringValue(general.matchTimeUTCDate) ??
      stringValue(general.matchTimeUTC) ??
      stringValue(headerStatus.utcTime) ??
      new Date(0).toISOString(),
    status: normalizePagePropsStatus(general, headerStatus),
    homeScore: numberValue(teamsArray[0]?.score) ?? numberValue(headerStatus.homeScore),
    awayScore: numberValue(teamsArray[1]?.score) ?? numberValue(headerStatus.awayScore)
  };
}

function normalizePagePropsStatus(general: JsonRecord, headerStatus: JsonRecord): FotMobFixture["status"] {
  if (headerStatus.finished === true) return "FINISHED";
  if (headerStatus.started === true || headerStatus.ongoing === true) return "LIVE";
  const matchStatus = asRecord(general.matchStatus);
  if (matchStatus.finished === true) return "FINISHED";
  if (matchStatus.started === true) return "LIVE";
  return "SCHEDULED";
}

export function validatedMatchDetailsPayload(fixtureId: string, payload: unknown, source: string) {
  const record = asRecord(payload);
  const general = asRecord(record.general);
  const header = asRecord(record.header);
  const matchId = stringValue(general.matchId) ?? stringValue(header.matchId) ?? stringValue(record.matchId) ?? stringValue(record.id);

  if (matchId !== fixtureId) {
    throw new FotMobFixtureDetailsUnavailableError(fixtureId, `${source} payload id mismatch: ${matchId ?? "missing"}`);
  }

  if (!hasDetailedMatchContent(record)) {
    throw new FotMobFixtureDetailsUnavailableError(fixtureId, `${source} payload missing detailed match content`);
  }

  return payload;
}

function hasDetailedMatchContent(payload: JsonRecord) {
  const content = asRecord(payload.content);
  return ["playerStats", "shotmap", "lineup", "stats", "matchFacts"].some((key) => content[key] !== undefined);
}

export class RealFotMobClient implements FotMobClient {
  private readonly baseUrl = process.env.MACHETE_FOTMOB_BASE_URL;
  private readonly apiKey = process.env.MACHETE_FOTMOB_API_KEY;

  async getLeague(): Promise<FotMobLeague> {
    return this.unconfigured();
  }

  async getTeams(): Promise<FotMobTeam[]> {
    return this.unconfigured();
  }

  async getFixtures(): Promise<FotMobFixture[]> {
    return this.unconfigured();
  }

  async getFixtureDetails(): Promise<FotMobFixtureDetails> {
    return this.unconfigured();
  }

  async getPlayer(): Promise<FotMobPlayer> {
    return this.unconfigured();
  }

  private unconfigured(): never {
    if (!this.baseUrl || !this.apiKey) {
      throw new Error("Real FotMob provider is not configured. Set MACHETE_FOTMOB_BASE_URL and MACHETE_FOTMOB_API_KEY for an approved data source.");
    }
    throw new Error("Real FotMob provider boundary exists, but no scraping or unofficial API implementation is included.");
  }
}

export function createFotMobClient(): FotMobClient {
  const mode = process.env.MACHETE_FOTMOB_PROVIDER_MODE;
  if (mode === "real") return new RealFotMobClient();
  if (mode === "unofficial") return new UnofficialFotMobClient();
  return new MockFotMobClient();
}

type FotMobTeamSummary = {
  id: string;
  name: string;
  shortName?: string;
};

type ExtractLeagueTeamsOptions = {
  leagueId?: string;
  season?: string;
};

export function extractLeagueTeamsFromLeaguePayload(payload: unknown, options: ExtractLeagueTeamsOptions = {}): FotMobTeamSummary[] {
  const league = asRecord(payload);
  const tableTeams = extractLeagueTableTeams(league);
  if (tableTeams.length > 0) return tableTeams;

  const fixtureTeams = extractLeagueFixtureTeams(league);
  if (options.leagueId === "77" && options.season === "2026" && fixtureTeams.length > 48) {
    console.warn(
      `[fotmob] World Cup fallback extracted ${fixtureTeams.length} teams after placeholder filtering; review fixture payload shape.`
    );
  }

  return fixtureTeams;
}

function extractLeagueTableTeams(league: JsonRecord): FotMobTeamSummary[] {
  const tableBlocks = Array.isArray(league.table) ? league.table : [];
  for (const block of tableBlocks) {
    const data = asRecord(asRecord(block).data);
    const table = asRecord(data.table);
    const all = table.all;
    if (Array.isArray(all)) {
      return all
        .map((item) => {
          const team = asRecord(item);
          return {
            id: stringValue(team.id) ?? "",
            name: stringValue(team.name) ?? "",
            shortName: stringValue(team.shortName)
          };
        })
        .filter((team) => team.id && team.name);
    }
  }
  return [];
}

function extractLeagueFixtureTeams(payload: unknown): FotMobTeamSummary[] {
  const teams: FotMobTeamSummary[] = [];
  const indexesById = new Map<string, number>();
  const indexesByName = new Map<string, number>();

  function addTeam(value: unknown) {
    const record = asRecord(value);
    const rawId = stringValue(record.id) ?? stringValue(record.teamId) ?? "";
    const id = isNumericFotMobId(rawId) ? rawId : "";
    const name = stringValue(record.name) ?? stringValue(record.teamName);
    if (!name || is_placeholder_team(name)) return;

    const nameKey = normalizeTeamNameKey(name);
    if (id && indexesById.has(id)) return;
    if (!id && (!nameKey || indexesByName.has(nameKey))) return;

    const team = {
      id,
      name,
      shortName: stringValue(record.shortName)
    };

    const existingNameIndex = nameKey ? indexesByName.get(nameKey) : undefined;
    if (existingNameIndex !== undefined) {
      if (teams[existingNameIndex]?.id) return;
      if (id && !teams[existingNameIndex]?.id) indexesById.set(id, existingNameIndex);
      teams[existingNameIndex] = team;
      return;
    }

    if (id) indexesById.set(id, teams.length);
    if (nameKey && existingNameIndex === undefined) indexesByName.set(nameKey, teams.length);
    teams.push(team);
  }

  function addFixtureTeams(record: JsonRecord) {
    if ("home" in record && "away" in record) {
      addTeam(record.home);
      addTeam(record.away);
    }
    if ("homeTeam" in record && "awayTeam" in record) {
      addTeam(record.homeTeam);
      addTeam(record.awayTeam);
    }
  }

  function visit(value: unknown) {
    if (Array.isArray(value)) {
      for (const item of value) visit(item);
      return;
    }

    const record = asRecord(value);
    addFixtureTeams(record);
    for (const nested of Object.values(record)) {
      visit(nested);
    }
  }

  visit(payload);
  return teams;
}

export function is_placeholder_team(name: unknown): boolean {
  const value = typeof name === "string" ? name.trim() : "";
  if (!value) return true;

  const normalized = value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[._-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (/^(tbd|tba|to be decided|to be determined|unknown|placeholder|n\/a|na)$/.test(normalized)) return true;
  if (/^(winner|loser|runner up|runnerup)\s+(group\s+)?[a-z0-9]+$/.test(normalized)) return true;
  if (/^([a-z]\d+|\d+[a-z])$/.test(normalized)) return true;
  if (/^[wl]\d+$/.test(normalized)) return true;

  const cyrillic = value.toLowerCase();
  if (/(победител|группа|не\s*определ|будет\s*определ|заглушк)/i.test(cyrillic)) return true;

  return false;
}

function normalizeTeam(payload: unknown, leagueId: string, tableTeam: { id: string; name: string; shortName?: string }): FotMobTeam {
  const data = asRecord(payload);
  const details = asRecord(data.details);
  const teamId = stringValue(details.id) ?? tableTeam.id;

  return {
    id: teamId,
    leagueId,
    name: stringValue(details.name) ?? tableTeam.name,
    shortName: stringValue(details.shortName) ?? tableTeam.shortName,
    country: stringValue(details.country),
    logoUrl: teamLogoUrl(teamId),
    players: extractSquadPlayers(data, teamId)
  };
}

function extractSquadPlayers(teamPayload: JsonRecord, teamId: string): FotMobPlayer[] {
  const squadContainer = asRecord(teamPayload.squad);
  const groups = Array.isArray(squadContainer.squad) ? squadContainer.squad : [];

  return groups.flatMap((group) => {
    const groupRecord = asRecord(group);
    if (groupRecord.title === "coach") return [];

    const members = Array.isArray(groupRecord.members) ? groupRecord.members : [];
    return members
      .map((member) => normalizeSquadMember(member, teamId))
      .filter((player): player is FotMobPlayer => player !== null);
  });
}

function normalizeSquadMember(member: unknown, teamId: string): FotMobPlayer | null {
  const data = asRecord(member);
  const id = stringValue(data.id);
  const name = stringValue(data.name);
  if (!id || !name) return null;

  const role = asRecord(data.role);
  const goals = numberValue(data.goals) ?? 0;
  const assists = numberValue(data.assists) ?? 0;
  const yellowCards = numberValue(data.ycards) ?? 0;
  const redCards = numberValue(data.rcards) ?? 0;
  const rating = numberValue(data.rating);

  return {
    id,
    teamId,
    name,
    position: stringValue(data.positionIdsDesc) ?? stringValue(role.fallback),
    shirtNumber: numberValue(data.shirtNumber ?? data.shirt_number ?? data.number),
    age: numberValue(data.age),
    nationality: stringValue(data.cname) ?? stringValue(data.ccode),
    height: formatHeight(numberValue(data.height)),
    photoUrl: playerPhotoUrl(id),
    raw: data,
    seasonStat: {
      playerId: id,
      teamId,
      minutes: nullNumber(),
      rating,
      goals,
      assists,
      shots: 0,
      shotsOnTarget: 0,
      keyPasses: 0,
      tackles: 0,
      interceptions: 0,
      saves: 0,
      yellowCards,
      redCards,
      raw: data
    } as FotMobPlayerMatchStat
  };
}

function normalizeFixture(payload: unknown, leagueId: string): FotMobFixture | null {
  const data = asRecord(payload);
  const id = stringValue(data.id);
  const home = asRecord(data.home);
  const away = asRecord(data.away);
  const homeTeamId = stringValue(home.id);
  const awayTeamId = stringValue(away.id);
  const status = asRecord(data.status);

  if (!id || !homeTeamId || !awayTeamId) return null;

  return {
    id,
    leagueId: stringValue(data.leagueId) ?? leagueId,
    homeTeamId,
    awayTeamId,
    kickoffAt: stringValue(status.utcTime) ?? stringValue(data.matchDate) ?? new Date(0).toISOString(),
    status: normalizeStatus(status),
    homeScore: numberValue(data.homeScore) ?? numberValue(home.score),
    awayScore: numberValue(data.awayScore) ?? numberValue(away.score)
  };
}

function normalizeStatus(status: JsonRecord): FotMobFixture["status"] {
  if (status.finished === true) return "FINISHED";
  if (status.started === true || status.ongoing === true) return "LIVE";
  return "SCHEDULED";
}

function normalizeFotMobSeason(season: string) {
  const match = season.match(/^(\d{4})\/(\d{2})$/);
  if (!match) return season;
  return `${match[1]}/20${match[2]}`;
}

function fotMobRequestSeason(leagueId: string, season: string | undefined) {
  if (leagueId === "77") return fotMobWorldCupSeason(season);
  return season ? normalizeFotMobSeason(season) : undefined;
}

function fotMobWorldCupSeason(season: string | undefined) {
  if (!season) return "2026";
  const years = season.match(/\d{4}/g);
  return years?.length ? years[years.length - 1] : season;
}

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : {};
}

function stringValue(value: unknown): string | undefined {
  if (typeof value === "string" && value.length > 0) return value;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return undefined;
}

function numberValue(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function isNumericFotMobId(value: string) {
  return /^\d+$/.test(value.trim());
}

function normalizeTeamNameKey(value: string) {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function nullNumber(): number | null {
  return null;
}

function formatHeight(heightCm: number | undefined) {
  return heightCm ? `${heightCm} cm` : undefined;
}

function teamLogoUrl(teamId: string) {
  return `https://images.fotmob.com/image_resources/logo/teamlogo/${teamId}.png`;
}

function leagueLogoUrl(leagueId: string) {
  return `https://images.fotmob.com/image_resources/logo/leaguelogo/${leagueId}.png`;
}

function playerPhotoUrl(playerId: string) {
  return `https://images.fotmob.com/image_resources/playerimages/${playerId}.png`;
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
