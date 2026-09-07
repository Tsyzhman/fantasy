/** @spec spec://modules/betting/FEAT-001-virtual-league#ui */
import { BOTS, type Recommendation, type Selection } from "./domain";
export type AdviceMarket = Selection & { recommendations: Recommendation[] };
export function matchAdvice(event: { markets: AdviceMarket[]; closed?: boolean; kickoff: string; fetchedAt: string | null }, now: number) {
  const unavailable = now === 0 ? "Проверяем свежесть котировок" : event.closed || !Number.isFinite(Date.parse(event.kickoff)) || Date.parse(event.kickoff) <= now
    ? "Приём ставок на матч закрыт"
    : !event.fetchedAt || !Number.isFinite(Date.parse(event.fetchedAt)) || now - Date.parse(event.fetchedAt) > 300000
      ? "Котировки устарели — обновите матч" : null;
  return BOTS.map(bot => {
    const eligible = event.markets.filter(m => m.enabled && m.rule && !m.manual).flatMap(m => {
      const recommendation = m.recommendations.find(r => r.name === bot.name);
      return recommendation ? [{ market: m, recommendation }] : [];
    }).sort((a, b) => (b.recommendation.ev ?? -Infinity) - (a.recommendation.ev ?? -Infinity) || a.market.key.localeCompare(b.market.key));
    const best = !unavailable ? eligible.find(v => v.recommendation.decision === "BET" && v.recommendation.ev !== null) : undefined;
    return { name: bot.name, market: best?.market ?? null, recommendation: best?.recommendation ?? null,
      reason: unavailable ?? best?.recommendation.reason ?? eligible[0]?.recommendation.reason ?? "Нет доступных рынков с подтверждённой моделью" };
  });
}
