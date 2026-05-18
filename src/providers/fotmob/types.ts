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
  age?: number;
  nationality?: string;
  height?: string;
  foot?: string;
  photoUrl?: string;
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
  minutes: number;
  rating: number;
  goals: number;
  assists: number;
  shots: number;
  shotsOnTarget: number;
  keyPasses: number;
  tackles: number;
  interceptions: number;
  saves: number;
  yellowCards: number;
  redCards: number;
};

export type FotMobFixtureDetails = FotMobFixture & {
  playerStats: FotMobPlayerMatchStat[];
};
