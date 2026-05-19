export type FotMobLeague = {
  id: string;
  name: string;
  country?: string;
  season?: string;
  logoUrl?: string;
};

export type FotMobPlayer = {
  id: string;
  teamId: string;
  name: string;
  position?: string;
  shirtNumber?: number;
  age?: number;
  nationality?: string;
  height?: string;
  foot?: string;
  photoUrl?: string;
  seasonStat?: Omit<FotMobPlayerMatchStat, "fixtureId">;
  raw?: unknown;
};

export type FotMobTeam = {
  id: string;
  leagueId: string;
  name: string;
  shortName?: string;
  country?: string;
  logoUrl?: string;
  players: FotMobPlayer[];
};

export type FotMobFixture = {
  id: string;
  leagueId: string;
  homeTeamId: string;
  awayTeamId: string;
  kickoffAt: string;
  status: "SCHEDULED" | "FINISHED" | "LIVE";
  homeScore?: number;
  awayScore?: number;
};

export type FotMobPlayerMatchStat = {
  fixtureId: string;
  playerId: string;
  teamId: string;
  minutes: number | null;
  rating: number | null;
  goals: number | null;
  assists: number | null;
  shots: number | null;
  shotsOnTarget: number | null;
  keyPasses: number | null;
  tackles: number | null;
  interceptions: number | null;
  saves: number | null;
  yellowCards: number | null;
  redCards: number | null;
  aggregateMatches?: number | null;
  raw?: unknown;
};

export type FotMobFixtureDetails = FotMobFixture & {
  playerStats: FotMobPlayerMatchStat[];
  raw?: unknown;
};
