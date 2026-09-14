/** @spec spec://modules/khl/FEAT-003-khl-projections-and-optimizer#rolling-beta */
import { expectedStatKeys, formatKhlNumber as n, type KhlPlayer, type KhlRateInput, type ExpectedStatKey, type KhlForecastExplanation, type KhlMatchExpectation, type KhlExpectedStats } from './contracts';

export const expectedStatLabels: Record<ExpectedStatKey, string> = { goals: 'Голы', assists: 'Передачи', shotsOnGoal: 'Броски в створ', pimMinutes: 'Штрафные минуты', plusMinus: 'Плюс-минус' };
export function rateCalculation(r: KhlRateInput) {
  if (r.mean === null) return 'Недостаточно известных наблюдений.';
  const pastMean = r.previousCount ? r.previousSum / r.previousCount : null;
  return `Текущие: ${n(r.currentSum)} / ${r.currentCount} матчей; прошлые: ${n(r.previousSum)} / ${r.previousCount} = ${n(pastMean)} за матч. Вес прошлого: min(20; ${r.previousCount}) = ${r.previousWeight}. Среднее = (${n(r.currentSum)} + ${r.previousWeight} × ${n(pastMean ?? 0)}) / (${r.currentCount} + ${r.previousWeight}) = ${n(r.mean)}.`;
}
export function goalCalculation(e: KhlForecastExplanation) {
  const d = e.details;
  if (!d || d.mode !== 'events') return 'Событийная разбивка недоступна; использовано среднее официальных FP.';
  const c = d.conversion;
  if (!c) return `Нет броскового сигнала: ожидание голов = ${n(d.rates.goals.mean)} по темпу голов.`;
  const archiveRatio = c.previousGames ? c.previousWeight / c.previousGames : 0;
  return `Реализация: (${n(c.currentGoals)} текущих голов + ${n(c.previousGoals * archiveRatio)} взвешенных прошлых + ${n(c.leagueShots ? c.leagueWeight * c.leagueGoals / c.leagueShots : 0)} голов лигового prior) / (${n(c.currentShots)} текущих бросков + ${n(c.previousShots * archiveRatio)} взвешенных прошлых + ${n(c.leagueWeight)} бросков prior) = ${n(c.value * 100)}%. Архив пары: ${n(c.previousGoals)} голов / ${n(c.previousShots)} бросков в ${c.previousGames} матчах, вес ${c.previousWeight} матчей. Лига: ${n(c.leagueGoals)} / ${n(c.leagueShots)}, вес до 50 бросков. Ожидаемые голы = (${n(d.rates.goals.mean)} + ${n(d.rates.shotsOnGoal.mean)} × ${n(c.value * 100)}%) / 2 = ${n(d.expected.goals)}.`;
}
export function forecastFixtures(player: KhlPlayer) {
  return player.fixtures.filter(f => f.status === 'SCHEDULED' && player.forecastHorizonEnd && f.startsAt < player.forecastHorizonEnd);
}
export function expectedTotals(player: KhlPlayer): KhlExpectedStats {
  const fixtures = forecastFixtures(player), e = player.forecastExplanation;
  return Object.fromEntries(expectedStatKeys.map(key => {
    const values = fixtures.map(f => f.forecast?.expected[key]);
    return [key, player.ep.value !== null && e && values.length && values.every(v => v != null) ? values.reduce<number>((sum, v) => sum + v! * e.appearanceRate, 0) : null];
  })) as KhlExpectedStats;
}
export function expectedTooltip(player: KhlPlayer) {
  const e = player.forecastExplanation;
  if (!e?.details) return 'Разбор исходных ожиданий ещё не опубликован.';
  const total = expectedTotals(player);
  return ['Ожидаемые показатели: база за сыгранный матч → выбранный период с участием и соперниками', ...expectedStatKeys.map(k => `${expectedStatLabels[k]}: ${n(e.details!.expected[k])} → ${n(total[k])}`), goalCalculation(e), 'Окно модели: последние 10 записей PLAYED/DNP; табличное окно 5/10/20 его не меняет.', 'Нажмите EP, чтобы открыть исходные средние и прогноз каждого матча.'].join('\n');
}
export function applyOpponent(e: KhlForecastExplanation, adjustment: KhlMatchExpectation['adjustment']): KhlMatchExpectation {
  const expected = { ...e.details!.expected };
  if (e.details?.mode !== 'events') return { expected, perGame: e.perGame, adjustment: { ...adjustment, factor: 1, reason: 'Прогноз по официальным FP: поправка атаки неприменима.' } };
  for (const key of ['goals', 'assists', 'shotsOnGoal'] as const) if (expected[key] !== null) expected[key] *= adjustment.factor;
  const perGame = 10 * expected.goals! + 5 * expected.assists! + 2 * expected.plusMinus! - expected.pimMinutes! + e.components.other;
  return { expected, perGame, adjustment };
}
