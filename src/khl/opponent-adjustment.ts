/** @spec spec://modules/khl/FEAT-003-khl-projections-and-optimizer#rolling-beta */
import { noVig, type HockeyMarket } from '@/providers/fonbet/hockey-markets';
import type { KhlMatchExpectation } from './contracts';
export function opponentAdjustment(input: { markets?: HockeyMarket[]; home: boolean; startsAt: Date; observedAt?: Date; asOf: Date; source?: string; snapshotIds?: string[] }): KhlMatchExpectation['adjustment'] {
  const fallback = (reason: string) => ({ factor: 1, probability: null, source: input.source ?? null, observedAt: input.observedAt?.toISOString() ?? null, snapshotIds: input.snapshotIds ?? [], reason });
  const until = input.startsAt.getTime() - input.asOf.getTime(), age = input.observedAt ? input.asOf.getTime() - input.observedAt.getTime() : Infinity;
  if (until <= 0 || age < 0 || age > (until <= 6 * 3600000 ? 5 * 60000 : 30 * 60000)) return fallback('Свежей линии нет: используется базовый темп игрока.');
  const markets = input.markets;
  if (!markets || markets.some(m => m.type !== '1X2' || m.scope !== 'REGULATION_60' || m.period !== 0 || m.line !== null)) return fallback('Рынок 1/X/2 за 60 минут не подтверждён.');
  const probabilities = noVig(markets);
  if (!probabilities) return fallback('Линия неполная или приостановлена: используется базовый темп.');
  const probability = probabilities.find(p => p.selection === (input.home ? 'HOME' : 'AWAY'))!.probability + 0.5 * probabilities.find(p => p.selection === 'DRAW')!.probability;
  return { ...fallback('Фонбет: P(победы за 60 минут) + 0,5 × P(ничьей), маржа удалена. Beta-поправка, не обученная модель.'), probability, factor: 0.75 + 0.5 * probability };
}
