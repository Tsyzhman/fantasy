/** @spec spec://modules/betting/FEAT-001-virtual-league#algorithms */
import { macheteLeagueCatalog } from "@/lib/leagues/machete-catalog";
export const CUP_LEAGUES=[42,44,50,73,74,77,10216,132,133,134,137,138,139,141,149,186,193,209,235];
export const EUROPEAN_LEAGUE_ROUNDS=["1","2","3","4","5","6","7","8"];
export const DOMESTIC_LEAGUES=macheteLeagueCatalog.filter(l => l.country!=="International" && !/cup|copa|coupe|pokal|taca/i.test(l.id) && !CUP_LEAGUES.includes(Number(l.fotMobLeagueId))).map(l=>BigInt(l.fotMobLeagueId));
export function hasRegulationScore(leagueId: number, round: string | null | undefined) {
  return !CUP_LEAGUES.includes(leagueId) || ([42,73].includes(leagueId) && EUROPEAN_LEAGUE_ROUNDS.includes(round ?? ""));
}
