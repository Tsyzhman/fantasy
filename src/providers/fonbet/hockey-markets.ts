/** @spec spec://modules/khl/INFRA-003-khl-fonbet-odds#markets */
export type HockeyScope = "REGULATION_60" | "INCLUDING_OT_SO";
export interface HockeyMarket {
  type: "1X2" | "WINNER" | "TOTAL"; scope: HockeyScope; period: number;
  selection: string; line: number | null; odds: number | null;
  status: "AVAILABLE" | "SUSPENDED" | "WITHDRAWN";
}
// Intentionally no numeric factor IDs until ODD-00 is verified against hockey samples.
export const HOCKEY_DICTIONARY = { version: "unverified", verified: false, factors: {} } as const;
export function hockeyMarketKey(m: HockeyMarket) { return JSON.stringify([m.type, m.scope, m.period, m.selection, m.line]); }
export function noVig(markets: HockeyMarket[]) {
  const first = markets[0];
  if (!first || first.type === "TOTAL") return null; // Push probability needs a separate model.
  const expected = first.type === "1X2" ? ["HOME", "DRAW", "AWAY"] : ["HOME", "AWAY"];
  if (markets.length !== expected.length || new Set(markets.map(m => m.selection)).size !== expected.length || markets.some(m => !expected.includes(m.selection) || m.type !== first.type || m.scope !== first.scope || m.period !== first.period || m.line !== first.line || m.status !== "AVAILABLE" || m.odds === null || !Number.isFinite(m.odds) || m.odds <= 1)) return null;
  const denominator = markets.reduce((n, m) => n + 1 / m.odds!, 0);
  return markets.map(m => ({ selection: m.selection, probability: (1 / m.odds!) / denominator, quality: "ESTIMATE" as const }));
}
export function reconcileMarkets(previous: HockeyMarket[], incoming: HockeyMarket[], complete: boolean, success: boolean) {
  if (!success) return { markets: previous, stale: true };
  const map = new Map(incoming.map(m => [hockeyMarketKey(m), m]));
  for (const m of previous) if (!map.has(hockeyMarketKey(m))) map.set(hockeyMarketKey(m), complete ? { ...m, status: "WITHDRAWN" } : m);
  return { markets: [...map.values()].sort((a, b) => hockeyMarketKey(a).localeCompare(hockeyMarketKey(b))), stale: false };
}
export function matchHockeyEvent(event: { homeId: string; awayId: string; startsAt: number; seasonId: string; parentId: string | null; live: boolean }, matches: { id: string; homeId: string; awayId: string; startsAt: number; seasonId: string }[]) {
  if (event.parentId || event.live) return { status: "UNMATCHED", matchId: null };
  const candidates = matches.filter(m => m.seasonId === event.seasonId && m.homeId === event.homeId && m.awayId === event.awayId && Math.abs(m.startsAt - event.startsAt) <= 15 * 60000);
  return { status: candidates.length === 1 ? "MATCHED" : candidates.length ? "AMBIGUOUS" : "UNMATCHED", matchId: candidates.length === 1 ? candidates[0].id : null };
}
