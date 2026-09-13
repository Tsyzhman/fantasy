/** @spec spec://modules/khl/FEAT-003-khl-projections-and-optimizer#rolling-beta */
import { seasonStatFields, type KhlHistoricalStats, type KhlPosition, type KhlForecastExplanation } from "./contracts";

export type HistoryFact = Partial<Record<typeof seasonStatFields[number], number | null>> & { points: number | null; participationStatus: string };
export function summarizeHockeyHistory(rows: HistoryFact[], seasonKey: string, source: string): KhlHistoricalStats {
  const played = rows.filter(r => r.participationStatus === "PLAYED");
  const totals = Object.fromEntries(seasonStatFields.map(field => {
    const known = played.flatMap(r => r[field] == null ? [] : [r[field]!]);
    return [field, { value: known.length ? known.reduce((a, b) => a + b, 0) : null, knownGames: known.length }];
  })) as KhlHistoricalStats["totals"];
  const scores = played.flatMap(r => r.points === null ? [] : [r.points]);
  const residual = played.flatMap(r => r.points === null || [r.goals, r.assists, r.plusMinus, r.pimMinutes].some(n => n == null) ? [] : [r.points - 10 * r.goals! - 5 * r.assists! - 2 * r.plusMinus! + r.pimMinutes!]);
  return { seasonKey, source, asOf: null, games: played.length, dnp: rows.filter(r => r.participationStatus === "DNP").length, totals,
    officialFp: { sum: scores.reduce((a, b) => a + b, 0), count: scores.length }, otherPoints: { sum: residual.reduce((a, b) => a + b, 0), count: residual.length } };
}
export function blendHistory(current: { sum: number; count: number }, previous?: { sum: number; count: number }) {
  const weight = Math.min(20, previous?.count ?? 0), count = current.count + weight;
  return count ? (current.sum + (weight ? weight * previous!.sum / previous!.count : 0)) / count : null;
}
export function projectHistory(input: { position: KhlPosition; current: KhlHistoricalStats; previous?: KhlHistoricalStats; pairedGoals: number; pairedShots: number; leagueGoals: number; leagueShots: number }): KhlForecastExplanation | null {
  const { current, previous } = input;
  const rate = (key: keyof KhlHistoricalStats["totals"]) => blendHistory({ sum: current.totals[key].value ?? 0, count: current.totals[key].knownGames }, previous && { sum: previous.totals[key].value ?? 0, count: previous.totals[key].knownGames });
  const appearanceRate = blendHistory({ sum: current.games, count: current.games + current.dnp }, previous && { sum: previous.games, count: previous.games + previous.dnp });
  const officialMean = blendHistory(current.officialFp, previous?.officialFp);
  if (appearanceRate === null || officialMean === null) return null;
  const components: Record<string, number> = {}, warnings: string[] = ["BETA_UNCALIBRATED", "XG_UNAVAILABLE"];
  if (!previous?.games) warnings.push("PREVIOUS_SEASON_UNAVAILABLE");
  if (!current.games) warnings.push("PREVIOUS_SEASON_ONLY");
  let perGame = officialMean;
  if (input.position === "G") components.officialFp = officialMean;
  else {
    const goals = rate("goals"), assists = rate("assists"), plusMinus = rate("plusMinus"), pim = rate("pimMinutes"), shots = rate("shotsOnGoal");
    const other = blendHistory(current.otherPoints, previous?.otherPoints);
    if (goals === null || assists === null || plusMinus === null || pim === null || other === null) {
      warnings.push("EVENTS_INCOMPLETE"); components.officialFp = officialMean;
    } else {
      let expectedGoals = goals;
      if (shots !== null && input.leagueShots > 0) {
        const priorShots = Math.min(50, input.leagueShots);
        const conversion = (input.pairedGoals + priorShots * input.leagueGoals / input.leagueShots) / (input.pairedShots + priorShots);
        expectedGoals = (goals + shots * conversion) / 2;
        components.shotsPerGame = shots; components.shotConversion = conversion;
      } else warnings.push("SHOTS_UNAVAILABLE");
      components.goals = 10 * expectedGoals; components.assists = 5 * assists;
      components.plusMinus = 2 * plusMinus; components.penalty = -pim; components.other = other;
      perGame = components.goals + components.assists + components.plusMinus + components.penalty + components.other;
    }
  }
  return { perGame, appearanceRate, components, warnings, currentGames: current.games, previousGames: previous?.games ?? 0, previousSeason: previous?.seasonKey ?? null, priorWeight: Math.min(20, previous?.games ?? 0) };
}
