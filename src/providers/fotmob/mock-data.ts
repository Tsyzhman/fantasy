import type { FotMobFixtureDetails, FotMobLeague, FotMobTeam } from "./types";

export const mockFotMobLeague: FotMobLeague = {
  id: "championship-2025",
  name: "Championship",
  country: "England",
  season: "2025/26",
  logoUrl: nullishLogo("CH")
};

export const mockFotMobTeams: FotMobTeam[] = [
  {
    id: "fotmob-team-wrexham",
    leagueId: mockFotMobLeague.id,
    name: "Wrexham",
    shortName: "WRE",
    country: "Wales",
    logoUrl: "/team-logos/championship/wrexham.png",
    players: [
      player("fotmob-player-mullin", "fotmob-team-wrexham", "Paul Mullin", "FWD", 31, "England"),
      player("fotmob-player-lee", "fotmob-team-wrexham", "Elliot Lee", "MID", 31, "England"),
      player("fotmob-player-okonkwo", "fotmob-team-wrexham", "Arthur Okonkwo", "GK", 24, "England")
    ]
  },
  {
    id: "fotmob-team-birmingham",
    leagueId: mockFotMobLeague.id,
    name: "Birmingham City",
    shortName: "BIR",
    country: "England",
    logoUrl: "/team-logos/championship/birmingham-city.png",
    players: [
      player("fotmob-player-stansfield", "fotmob-team-birmingham", "Jay Stansfield", "FWD", 23, "England"),
      player("fotmob-player-iwata", "fotmob-team-birmingham", "Tomoki Iwata", "MID", 29, "Japan"),
      player("fotmob-player-allsop", "fotmob-team-birmingham", "Ryan Allsop", "GK", 33, "England")
    ]
  },
  {
    id: "fotmob-team-charlton",
    leagueId: mockFotMobLeague.id,
    name: "Charlton Athletic",
    shortName: "CHA",
    country: "England",
    logoUrl: "/team-logos/championship/charlton-athletic.png",
    players: [
      player("fotmob-player-leaburn", "fotmob-team-charlton", "Miles Leaburn", "FWD", 22, "England"),
      player("fotmob-player-dobson", "fotmob-team-charlton", "George Dobson", "MID", 28, "England"),
      player("fotmob-player-mannion", "fotmob-team-charlton", "Ashley Maynard-Brewer", "GK", 26, "Australia")
    ]
  },
  {
    id: "fotmob-team-sheffield-wednesday",
    leagueId: mockFotMobLeague.id,
    name: "Sheffield Wednesday",
    shortName: "SHW",
    country: "England",
    logoUrl: "/team-logos/championship/sheffield-wednesday.png",
    players: [
      player("fotmob-player-windass", "fotmob-team-sheffield-wednesday", "Josh Windass", "FWD", 32, "England"),
      player("fotmob-player-bannan", "fotmob-team-sheffield-wednesday", "Barry Bannan", "MID", 36, "Scotland"),
      player("fotmob-player-beadle", "fotmob-team-sheffield-wednesday", "James Beadle", "GK", 22, "England")
    ]
  }
];

export const mockFotMobFixtures: FotMobFixtureDetails[] = [
  fixture("fotmob-fixture-001", "fotmob-team-wrexham", "fotmob-team-birmingham", "2025-08-09T14:00:00.000Z", 2, 1),
  fixture("fotmob-fixture-002", "fotmob-team-charlton", "fotmob-team-sheffield-wednesday", "2025-08-10T14:00:00.000Z", 1, 1),
  fixture("fotmob-fixture-003", "fotmob-team-birmingham", "fotmob-team-charlton", "2025-08-16T14:00:00.000Z", 3, 0),
  fixture("fotmob-fixture-004", "fotmob-team-sheffield-wednesday", "fotmob-team-wrexham", "2025-08-17T14:00:00.000Z", 0, 2)
];

function player(id: string, teamId: string, name: string, position: string, age: number, nationality: string) {
  return {
    id,
    teamId,
    name,
    position,
    age,
    nationality,
    height: position === "GK" ? "190 cm" : "180 cm",
    foot: position === "MID" ? "Left" : "Right"
  };
}

function fixture(id: string, homeTeamId: string, awayTeamId: string, kickoffAt: string, homeScore: number, awayScore: number) {
  const teams = [homeTeamId, awayTeamId];
  return {
    id,
    leagueId: mockFotMobLeague.id,
    homeTeamId,
    awayTeamId,
    kickoffAt,
    status: "FINISHED" as const,
    homeScore,
    awayScore,
    playerStats: teams.flatMap((teamId, teamIndex) =>
      mockFotMobTeams
        .find((team) => team.id === teamId)!
        .players.map((mockPlayer, index) => {
          const isGoalkeeper = mockPlayer.position === "GK";
          const attackingBoost = teamIndex === 0 ? homeScore : awayScore;
          return {
            fixtureId: id,
            playerId: mockPlayer.id,
            teamId,
            minutes: index === 2 ? 90 : 78 + index * 6,
            rating: Number((6.4 + attackingBoost * 0.25 + index * 0.18).toFixed(1)),
            goals: !isGoalkeeper && index === 0 ? Math.max(0, attackingBoost - 1) : 0,
            assists: !isGoalkeeper && index === 1 && attackingBoost > 0 ? 1 : 0,
            shots: isGoalkeeper ? 0 : 2 + index,
            shotsOnTarget: isGoalkeeper ? 0 : 1 + (attackingBoost > 1 ? 1 : 0),
            keyPasses: isGoalkeeper ? 0 : 1 + index,
            tackles: isGoalkeeper ? 0 : 2 + teamIndex,
            interceptions: isGoalkeeper ? 0 : 1 + index,
            saves: isGoalkeeper ? 2 + Math.max(0, 3 - attackingBoost) : 0,
            yellowCards: index === 1 && attackingBoost === 0 ? 1 : 0,
            redCards: 0
          };
        })
    )
  };
}

function nullishLogo(label: string) {
  return `data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='80' height='80'><rect width='80' height='80' rx='12' fill='%2318202f'/><text x='40' y='47' text-anchor='middle' font-size='24' font-family='Arial' fill='white'>${label}</text></svg>`;
}
