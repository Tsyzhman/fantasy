/** @spec spec://modules/khl/FEAT-001-khl-module-and-rules#scoring */
import type { KhlPosition } from "./contracts";
export interface ScoreInput {
  position: KhlPosition; toiSeconds: number | null;
  result: "W60" | "W_OTSO" | "L_OTSO" | "L60" | null;
  goals: number | null; assists: number | null; plusMinus: number | null; pim: number | null;
  saves: number | null; goalsAgainst: number | null; fullGame: boolean | null; teamShutout: boolean | null;
}
export function scoreMatch(s: ScoreInput) {
  const warnings: string[] = [];
  const threshold = s.position === "G" ? 2400 : 600;
  const time = s.toiSeconds;
  if (time === threshold) warnings.push("EXACT_TOI_BOUNDARY_UNVERIFIED");
  if (time === 0) warnings.push("NON_PARTICIPATION_UNVERIFIED");
  const breakdown: Record<string, number | null> = {
    participation: time === null || time === 0 || time === threshold ? null : time > threshold ? 2 : 1,
    result: s.result === null || time === null || time === 0 ? null : { W60: 3, W_OTSO: 2, L_OTSO: 1, L60: 0 }[s.result]
  };
  if (s.position === "G") {
    breakdown.saves = s.saves === null ? null : Math.floor(s.saves / 2);
    breakdown.conceded = s.goalsAgainst === null ? null : -3 * s.goalsAgainst;
    breakdown.shutout = s.fullGame === null || s.goalsAgainst === null ? null : s.fullGame && s.goalsAgainst === 0 ? 20 : 0;
    if (s.goals || s.assists || s.pim) warnings.push("GOALIE_EVENT_UNVERIFIED");
    if (s.fullGame !== true) warnings.push("GOALIE_SUBSTITUTION_UNVERIFIED");
  } else {
    breakdown.goals = s.goals === null ? null : s.goals * 10;
    breakdown.assists = s.assists === null ? null : s.assists * 5;
    breakdown.plusMinus = s.plusMinus === null ? null : s.plusMinus * 2;
    breakdown.penalty = s.pim === null ? null : -s.pim;
    if (s.position === "D") breakdown.shutout = s.teamShutout === null ? null : !s.teamShutout ? 0 : time === null || time === 0 || time === threshold ? null : time > threshold ? 10 : 5;
  }
  const incomplete = Object.values(breakdown).some(v => v === null);
  return { breakdown, total: incomplete || warnings.length ? null : Object.values(breakdown).reduce<number>((sum, n) => sum + n!, 0), status: incomplete ? "insufficient_data" : "provisional", warnings };
}
