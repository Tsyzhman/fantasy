/** @spec spec://modules/betting/FEAT-001-virtual-league#algorithms */
import { macheteLeagueCatalog } from "@/lib/leagues/machete-catalog";
export const CUP_LEAGUES=[42,44,50,73,74,77,10216,132,133,134,137,138,139,141,149,186,193,209,235];
export const EUROPEAN_LEAGUE_ROUNDS=["1","2","3","4","5","6","7","8"];
export const DOMESTIC_LEAGUES=macheteLeagueCatalog.filter(l => l.country!=="International" && !/cup|copa|coupe|pokal|taca/i.test(l.id) && !CUP_LEAGUES.includes(Number(l.fotMobLeagueId))).map(l=>BigInt(l.fotMobLeagueId));
export function hasRegulationScore(leagueId: number, round: string | null | undefined) {
  return !CUP_LEAGUES.includes(leagueId) || ([42,73].includes(leagueId) && EUROPEAN_LEAGUE_ROUNDS.includes(round ?? ""));
}

/** Team-level provider goals are an explicit observation, not a sum of player goals. */
export function historicalScore(match: { homeTeamId: bigint | null; awayTeamId: bigint | null; homeScore: number | null; awayScore: number | null; teamStats: { teamId: bigint; goals: number | null }[] }) {
  const valid=(n: number | null | undefined): n is number => n != null && Number.isSafeInteger(n) && n >= 0;
  if(valid(match.homeScore) && valid(match.awayScore))return { home:match.homeScore, away:match.awayScore, source:"MATCH" as const };
  const home=match.teamStats.find(s=>s.teamId===match.homeTeamId)?.goals;
  const away=match.teamStats.find(s=>s.teamId===match.awayTeamId)?.goals;
  if(!valid(home) || !valid(away) || match.homeScore!==null && match.homeScore!==home || match.awayScore!==null && match.awayScore!==away)return null;
  return { home,away,source:"TEAM_STATS" as const };
}
