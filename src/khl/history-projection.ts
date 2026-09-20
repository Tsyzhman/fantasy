/** @spec spec://modules/khl/FEAT-003-khl-projections-and-optimizer#rolling-beta */
import { seasonStatFields, expectedStatKeys, type KhlHistoricalStats, type KhlPosition, type KhlForecastExplanation, type KhlRateInput, type KhlForecastDetails, type KhlExpectedStats } from "./contracts";

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
function rateInput(current: { sum: number; count: number }, previous: { sum: number; count: number } | undefined, previousSource: string | null): KhlRateInput {
  return { currentSum: current.sum, currentCount: current.count, previousSum: previous?.sum ?? 0, previousCount: previous?.count ?? 0, previousWeight: Math.min(20, previous?.count ?? 0), previousSource, mean: blendHistory(current, previous) };
}
export function projectHistory(input: { position: KhlPosition; current: KhlHistoricalStats; previous?: KhlHistoricalStats; pairedGoals: number; pairedShots: number; leagueGoals: number; leagueShots: number }): KhlForecastExplanation | null {
  const { current, previous } = input;
  const rate = (key: keyof KhlHistoricalStats["totals"]) => {
    const past = key === "shotsOnGoal" && previous?.protocolStats ? previous.protocolStats.totals[key] : previous?.totals[key];
    return rateInput({ sum: current.totals[key].value ?? 0, count: current.totals[key].knownGames }, past && { sum: past.value ?? 0, count: past.knownGames }, key === "shotsOnGoal" && previous?.protocolStats ? previous.protocolStats.source : previous?.source ?? null);
  };
  const priorAppearance = previous && previous.sourceKind !== 'KHL_PROTOCOL' ? { sum: previous.games, count: previous.games + previous.dnp } : undefined;
  const appearanceRate = blendHistory({ sum: current.games, count: current.games + current.dnp }, priorAppearance);
  const officialMean = blendHistory(current.officialFp, previous?.officialFp);
  if (appearanceRate === null || officialMean === null) return null;
  const rates = Object.fromEntries(expectedStatKeys.map(key => [key, rate(key)])) as KhlForecastDetails["rates"];
  rates.otherPoints = rateInput(current.otherPoints, previous?.otherPoints, previous?.source ?? null);
  rates.officialFp = rateInput(current.officialFp, previous?.officialFp, previous?.source ?? null);
  const details: KhlForecastDetails = { version: 1, historyWindow: 10, mode: "official-fp", rates,
    expected: Object.fromEntries(expectedStatKeys.map(key => [key, null])) as KhlExpectedStats,
    appearance: rateInput({ sum: current.games, count: current.games + current.dnp }, priorAppearance, priorAppearance ? previous!.source : null) };
  const components: Record<string, number> = {}, warnings: string[] = ["BETA_UNCALIBRATED", "XG_UNAVAILABLE"];
  if (!previous?.games) warnings.push("PREVIOUS_SEASON_UNAVAILABLE");
  if (!current.games) warnings.push("PREVIOUS_SEASON_ONLY");
  let perGame = officialMean;
  if (input.position === "G") components.officialFp = officialMean;
  else {
    const goals = rates.goals.mean, assists = rates.assists.mean, plusMinus = rates.plusMinus.mean, pim = rates.pimMinutes.mean, shots = rates.shotsOnGoal.mean;
    const other = blendHistory(current.otherPoints, previous?.otherPoints);
    if (goals === null || assists === null || plusMinus === null || pim === null || other === null) {
      warnings.push("EVENTS_INCOMPLETE"); components.officialFp = officialMean;
    } else {
      let expectedGoals = goals;
      const archive = previous?.protocolStats;
      if (shots !== null && (input.leagueShots > 0 || input.pairedShots > 0 || (archive?.pairedShots ?? 0) > 0)) {
        const priorShots = Math.min(50, input.leagueShots);
        const archiveWeight = archive?.pairedGames ? Math.min(20, archive.pairedGames) / archive.pairedGames : 0;
        const conversion = (input.pairedGoals + archiveWeight * (archive?.pairedGoals ?? 0) + (priorShots ? priorShots * input.leagueGoals / input.leagueShots : 0)) / (input.pairedShots + archiveWeight * (archive?.pairedShots ?? 0) + priorShots);
        if (archive?.pairedGames) components.previousShotGames = archive.pairedGames;
        expectedGoals = (goals + shots * conversion) / 2;
        components.shotsPerGame = shots; components.shotConversion = conversion;
        details.conversion = { currentGoals: input.pairedGoals, currentShots: input.pairedShots, previousGoals: archive?.pairedGoals ?? 0, previousShots: archive?.pairedShots ?? 0, previousGames: archive?.pairedGames ?? 0, previousWeight: Math.min(20, archive?.pairedGames ?? 0), leagueGoals: input.leagueGoals, leagueShots: input.leagueShots, leagueWeight: priorShots, value: conversion };
      } else warnings.push("SHOTS_UNAVAILABLE");
      components.goals = 10 * expectedGoals; components.assists = 5 * assists;
      components.plusMinus = 2 * plusMinus; components.penalty = -pim; components.other = other;
      perGame = components.goals + components.assists + components.plusMinus + components.penalty + components.other;
      details.mode = "events";
      details.expected = { goals: expectedGoals, assists, shotsOnGoal: shots, pimMinutes: pim, plusMinus };
    }
  }
  return { perGame, appearanceRate, components, warnings, details, currentGames: current.games, previousGames: previous?.games ?? 0, previousSeason: previous?.seasonKey ?? null, priorWeight: Math.min(20, previous?.games ?? 0) };
}
