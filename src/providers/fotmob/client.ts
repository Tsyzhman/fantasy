import { mockFotMobFixtures, mockFotMobLeague, mockFotMobTeams } from "./mock-data";
import type { FotMobFixture, FotMobFixtureDetails, FotMobLeague, FotMobPlayer, FotMobPlayerMatchStat, FotMobTeam } from "./types";

export interface FotMobClient {
  getLeague(leagueId: string, season?: string): Promise<FotMobLeague>;
  getTeams(leagueId: string, season?: string): Promise<FotMobTeam[]>;
  getFixtures(leagueId: string, season?: string): Promise<FotMobFixture[]>;
  getFixtureDetails(fixtureId: string): Promise<FotMobFixtureDetails>;
  getPlayer(playerId: string): Promise<FotMobPlayer>;
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
    return fixture;
  }

  async getPlayer(playerId: string) {
    const player = mockFotMobTeams.flatMap((team) => team.players).find((item) => item.id === playerId);
    if (!player) throw new Error(`Mock FotMob player not found: ${playerId}`);
    return player;
  }
}

type JsonRecord = Record<string, unknown>;

export class UnofficialFotMobClient implements FotMobClient {
  private readonly baseUrl = process.env.MACHETE_FOTMOB_BASE_URL || "https://www.fotmob.com/api";
  private readonly ccode3 = process.env.MACHETE_FOTMOB_CCODE3 || "GBR";
  private readonly timezone = process.env.MACHETE_FOTMOB_TIMEZONE || "Europe/London";

  async getLeague(leagueId: string, season?: string): Promise<FotMobLeague> {
    const payload = await this.getJson("/data/leagues", {
      id: leagueId,
      ccode3: this.ccode3,
      ...(season ? { season: normalizeFotMobSeason(season) } : {})
    });
    const data = asRecord(payload);
    const details = asRecord(data.details);

    return {
      id: stringValue(details.id) ?? leagueId,
      name: stringValue(details.name) ?? "FotMob league",
      country: stringValue(details.country),
      season: stringValue(details.selectedSeason) ?? season,
      logoUrl: leagueLogoUrl(stringValue(details.id) ?? leagueId)
    };
  }

  async getTeams(leagueId: string, season?: string): Promise<FotMobTeam[]> {
    const leaguePayload = await this.getJson("/data/leagues", {
      id: leagueId,
      ccode3: this.ccode3,
      ...(season ? { season: normalizeFotMobSeason(season) } : {})
    });
    const league = asRecord(leaguePayload);
    const tableTeams = extractLeagueTableTeams(league);
    const teams: FotMobTeam[] = [];

    for (const tableTeam of tableTeams) {
      const teamPayload = await this.getJson("/data/teams", {
        id: tableTeam.id,
        ccode3: this.ccode3
      });
      teams.push(normalizeTeam(teamPayload, leagueId, tableTeam));
    }

    return teams;
  }

  async getFixtures(leagueId: string, season?: string): Promise<FotMobFixture[]> {
    const payload = await this.getJson("/data/fixtures", {
      id: leagueId,
      ccode3: this.ccode3,
      timezone: this.timezone,
      ...(season ? { season: normalizeFotMobSeason(season) } : {})
    });
    if (!Array.isArray(payload)) return [];

    return payload.map((item) => normalizeFixture(item, leagueId)).filter((item): item is FotMobFixture => item !== null);
  }

  async getFixtureDetails(fixtureId: string): Promise<FotMobFixtureDetails> {
    const payload = await this.getJson("/data/match", { id: fixtureId });
    const fixture = normalizeFixture(payload, stringValue(asRecord(payload).leagueId) ?? "");
    if (!fixture) throw new Error(`FotMob match payload could not be normalized: ${fixtureId}`);

    return {
      ...fixture,
      playerStats: []
    };
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

  private async getJson(path: string, params: Record<string, string | number | undefined>): Promise<unknown> {
    const url = new URL(`${this.baseUrl}${path}`);
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }

    let lastError: unknown;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const response = await fetch(url, {
          headers: {
            "User-Agent": "Mozilla/5.0",
            Accept: "application/json, text/plain, */*",
            "Accept-Language": "en-US,en;q=0.9",
            Referer: "https://www.fotmob.com/"
          },
          signal: AbortSignal.timeout(20_000)
        });

        if (response.status === 403 || response.status === 429) {
          throw new Error(`FotMob request blocked with ${response.status}; stop syncing and use an approved provider or a larger cache interval.`);
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
          throw new Error("FotMob verification is required for this endpoint; Machete will not bypass anti-bot protection.");
        }

        return data;
      } catch (error) {
        lastError = error;
        if (error instanceof Error && (error.message.includes("403") || error.message.includes("429") || error.message.includes("verification"))) {
          throw error;
        }
        if (attempt === 2) break;
        await wait(2 ** attempt * 750);
      }
    }

    throw lastError instanceof Error ? lastError : new Error("FotMob request failed.");
  }
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
  if (process.env.MACHETE_FOTMOB_PROVIDER_MODE === "real") return new RealFotMobClient();
  if (process.env.MACHETE_FOTMOB_PROVIDER_MODE === "unofficial") return new UnofficialFotMobClient();
  return new MockFotMobClient();
}

function extractLeagueTableTeams(league: JsonRecord) {
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
    age: numberValue(data.age),
    nationality: stringValue(data.cname) ?? stringValue(data.ccode),
    height: formatHeight(numberValue(data.height)),
    photoUrl: playerPhotoUrl(id),
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
