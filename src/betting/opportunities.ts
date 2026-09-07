/** @spec spec://modules/betting/FEAT-001-virtual-league#opportunities */
import { BOTS, STRATEGY_VERSION, recommend, type ModelInput, type Selection } from "./domain";
import type { AdviceMarket } from "./match-advice";

export const OPPORTUNITY_VERSION = `1:${STRATEGY_VERSION}`;
export type EventSort = "value" | "time";
export type QuoteState = { closed?: boolean; kickoff: string; fetchedAt: string | null };
export type OpportunitySummary = { version: string; fetchedAt: string; kickoff: string; count: number; bestEv: number | null };

export function quoteUnavailable(event: QuoteState, now: number): string | null {
  if (!now) return "Проверяем свежесть котировок";
  const kickoff = Date.parse(event.kickoff), fetched = Date.parse(event.fetchedAt ?? "");
  if (event.closed || !Number.isFinite(kickoff) || kickoff <= now) return "Приём ставок на матч закрыт";
  if (!Number.isFinite(fetched) || fetched > now || now - fetched > 300000) return "Котировки устарели — обновите матч";
  return null;
}

export function marketOpportunities(markets: AdviceMarket[]) {
  const seen = new Set<string>();
  return markets.flatMap(market => {
    if (seen.has(market.key)) return [];
    seen.add(market.key);
    if (!market.enabled || !market.rule || market.manual) return [];
    const supporters = BOTS.flatMap(bot => {
      const r = market.recommendations.find(r => r.name === bot.name);
      return r?.decision === "BET" && r.ev !== null && Number.isFinite(r.ev) && r.ev > 0 ? [r] : [];
    });
    if (!supporters.length) return [];
    return [{ market, supporters, bestEv: Math.max(...supporters.map(r => r.ev!)) }];
  }).sort((a,b) => b.bestEv - a.bestEv || a.market.key.localeCompare(b.market.key));
}

export function matchOpportunities(event: QuoteState & { markets: AdviceMarket[] }, now: number) {
  return quoteUnavailable(event, now) ? [] : marketOpportunities(event.markets);
}

// One small derived value per existing quote snapshot; never retain histories in memory.
export function opportunitySnapshot(markets: Selection[], model: ModelInput, fetchedAt: string, kickoff: string): OpportunitySummary {
  const choices = marketOpportunities(markets.filter(m => m.enabled && m.rule && !m.manual)
    .map(m => ({ ...m, recommendations: recommend(m, model) })));
  return { version: OPPORTUNITY_VERSION, fetchedAt, kickoff, count: choices.length, bestEv: choices[0]?.bestEv ?? null };
}

export function currentOpportunity(event: QuoteState & { opportunity?: OpportunitySummary | null }, now: number) {
  const s = event.opportunity;
  if (!s || quoteUnavailable(event, now) || s.version !== OPPORTUNITY_VERSION
    || Date.parse(s.fetchedAt) !== Date.parse(event.fetchedAt ?? "") || Date.parse(s.kickoff) !== Date.parse(event.kickoff)
    || !Number.isSafeInteger(s.count) || s.count < 0
    || (s.count > 0 && (s.bestEv === null || !Number.isFinite(s.bestEv) || s.bestEv <= 0))) return null;
  return s;
}
