import { mockFotMobFixtures, mockFotMobLeague, mockFotMobTeams } from "./mock-data";
import type { FotMobFixture, FotMobFixtureDetails, FotMobLeague, FotMobPlayer, FotMobTeam } from "./types";

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
  return process.env.MACHETE_FOTMOB_PROVIDER_MODE === "real" ? new RealFotMobClient() : new MockFotMobClient();
}
