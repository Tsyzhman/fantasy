/** @spec spec://modules/khl/FEAT-003-khl-projections-and-optimizer#optimizer */
import type { KhlPlayer, KhlPosition } from "./contracts";
import { KHL_RULES, transferAvailability, validateRoster } from "./rules";
export interface OptimizeInput {
  players: KhlPlayer[]; capital: number; keep: string[]; exclude: string[];
  owned: string[]; maxTransfers: number; now: number; timeoutMs?: number;
}
// Exact branch-and-bound with an explicit time budget. No truncated candidate pool.
export function optimizeKhl(input: OptimizeInput, cancelled: () => boolean = () => false) {
  const started = performance.now();
  const timeout = Math.min(5000, Math.max(0, input.timeoutMs ?? 5000));
  const owned = new Set(input.owned), keep = new Set(input.keep), exclude = new Set(input.exclude);
  let best: KhlPlayer[] | null = null, bestScore = -Infinity, stopped = false, aborted = false;
  const finish = (status: string) => ({ status, players: best, score: best ? bestScore : null, optimality: stopped || aborted ? "not_proven" : "proven", elapsedMs: performance.now() - started });
  if (input.players.length > 1000 || new Set(input.players.map(p => p.id)).size !== input.players.length || new Set(input.players.map(p => p.contestId)).size > 1 || !Number.isSafeInteger(input.capital) || input.capital < 0 || !Number.isInteger(input.maxTransfers) || input.maxTransfers < 0 || input.maxTransfers > 17 || input.keep.some(id => exclude.has(id) || !owned.has(id))) return finish("INVALID_INPUT");
  const pool = input.players.filter(p => !exclude.has(p.id) && p.playerId && p.price.value !== null && Number.isSafeInteger(p.price.value) && p.price.value >= 0 && p.ep.value !== null && Number.isFinite(p.ep.value) && (owned.has(p.id) || !transferAvailability(p, input.now)))
    .sort((a, b) => b.ep.value! - a.ep.value! || a.id.localeCompare(b.id));
  // Locked holdings cannot be removed, independently of the user's keep choice.
  input.players.filter(p => owned.has(p.id) && transferAvailability(p, input.now)).forEach(p => keep.add(p.id));
  if ([...keep].some(id => !pool.some(p => p.id === id))) return finish("KEEP_CONFLICT");
  const fixed = pool.filter(p => keep.has(p.id));
  if (validateRoster(fixed, input.capital, false).length) return finish("KEEP_CONFLICT");
  const candidates = pool.filter(p => !keep.has(p.id));
  const counts: Record<KhlPosition, number> = { G: 0, D: 0, F: 0 };
  const clubs = new Map<string, number>();
  fixed.forEach(p => { counts[p.position]++; clubs.set(p.clubId, (clubs.get(p.clubId) ?? 0) + 1); });
  const chosen = [...fixed];
  function visit(index: number, cost: number, score: number, bought: number) {
    if (cancelled()) { aborted = true; return; }
    if (performance.now() - started >= timeout) { stopped = true; return; }
    if (cost > input.capital || bought > input.maxTransfers) return;
    const needed = 17 - chosen.length;
    if (needed === 0) {
      if (score > bestScore) { bestScore = score; best = [...chosen]; }
      return;
    }
    if (candidates.length - index < needed) return;
    // Optimistic bound ignores position, club and money constraints, hence is safe.
    let bound = score;
    for (let k = 0; k < needed; k++) bound += candidates[index + k].ep.value!;
    if (bound <= bestScore) return;
    for (const pos of ["G", "D", "F"] as const) {
      let available = 0;
      for (let k = index; k < candidates.length; k++) if (candidates[k].position === pos) available++;
      if (counts[pos] + available < KHL_RULES.positions[pos]) return;
    }
    const p = candidates[index];
    const clubCount = clubs.get(p.clubId) ?? 0;
    if (counts[p.position] < KHL_RULES.positions[p.position] && clubCount < 3) {
      counts[p.position]++; clubs.set(p.clubId, clubCount + 1); chosen.push(p);
      visit(index + 1, cost + p.price.value!, score + p.ep.value!, bought + (owned.has(p.id) ? 0 : 1));
      chosen.pop(); counts[p.position]--; clubs.set(p.clubId, clubCount);
    }
    if (!stopped && !aborted) visit(index + 1, cost, score, bought);
  }
  visit(0, fixed.reduce((n, p) => n + p.price.value!, 0), fixed.reduce((n, p) => n + p.ep.value!, 0), 0);
  return finish(aborted ? "CANCELLED" : stopped ? best ? "TIME_LIMIT" : "TIME_LIMIT_NO_SOLUTION" : best ? "OK" : "INFEASIBLE");
}
