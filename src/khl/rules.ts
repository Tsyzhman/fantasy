/** @spec spec://modules/khl/FEAT-001-khl-module-and-rules#rules */
import type { KhlPlayer, KhlPosition, KhlWeek } from "./contracts";
export const KHL_RULES = { size: 17, positions: { G: 2, D: 6, F: 9 }, initialBudget: 20000, clubLimit: 3, weeklyTransfers: 5 } as const;
export function validateRoster(players: KhlPlayer[], capital: number | null, complete = true): string[] {
  const errors = new Set<string>();
  if (players.length > 17 || (complete && players.length !== 17)) errors.add("ROSTER_SIZE");
  if (new Set(players.map(p => p.id)).size !== players.length) errors.add("DUPLICATE_PLAYER");
  if (new Set(players.map(p => p.contestId)).size > 1) errors.add("CONTEST_MISMATCH");
  for (const position of Object.keys(KHL_RULES.positions) as KhlPosition[]) {
    const count = players.filter(p => p.position === position).length;
    if (count > KHL_RULES.positions[position] || (complete && count !== KHL_RULES.positions[position])) errors.add(`POSITION_${position}`);
  }
  const clubs = new Map<string, number>();
  for (const p of players) clubs.set(p.clubId, (clubs.get(p.clubId) ?? 0) + 1);
  if ([...clubs.values()].some(n => n > 3)) errors.add("CLUB_LIMIT");
  if (players.some(p => p.price.value === null || !Number.isSafeInteger(p.price.value) || p.price.value < 0)) errors.add("PRICE_UNKNOWN");
  if (capital === null || !Number.isSafeInteger(capital) || capital < 0) errors.add("CAPITAL_UNKNOWN");
  else if (!errors.has("PRICE_UNKNOWN") && players.reduce((sum, p) => sum + p.price.value!, 0) > capital) errors.add("BUDGET_EXCEEDED");
  return [...errors];
}
export function weekAt(weeks: KhlWeek[], at: number): KhlWeek | null {
  const matches = weeks.filter(w => w.verified && w.startsAt && w.endsAt && Date.parse(w.startsAt) <= at && at < Date.parse(w.endsAt));
  return matches.length === 1 ? matches[0] : null;
}
export function transferAvailability(p: KhlPlayer, now: number): string | null {
  if (p.fixtures.some(f => f.status === "LIVE" || (f.status === "SCHEDULED" && now >= Date.parse(f.startsAt) - 30 * 60000))) return "MATCH_LOCK";
  const lockTime = p.providerLock.asOf ? Date.parse(p.providerLock.asOf) : NaN;
  if (p.providerLock.value === null || !Number.isFinite(lockTime) || now < lockTime || now - lockTime > 60000) return "LOCK_UNKNOWN_OR_STALE";
  if (p.providerLock.value) return "PROVIDER_LOCK";
  const priceTime = p.price.asOf ? Date.parse(p.price.asOf) : NaN;
  if (p.price.value === null || !Number.isFinite(priceTime) || now < priceTime || now - priceTime > 300000) return "PRICE_UNKNOWN_OR_STALE";
  return null;
}
