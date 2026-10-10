/** @spec spec://modules/franchises/FEAT-005-franchise-analytics#style
 * Frozen pre-remediation algorithm, only for equivalence tests and benchmarks. */
import type { Summary } from "./analytics";
export function referenceRankStyle(rows: Summary[]) {
  const keys = ["own_cohort_gap", "cap_gap", "buy_delta_gap"];
  const eligible = rows.filter(row => keys.every(key => row.metrics[key] !== null));
  for (const row of eligible) row.rarity = keys.reduce((sum, key, index) => {
    const value = row.metrics[key]!;
    const below = eligible.filter(x => x.metrics[key]! < value).length;
    const equal = eligible.filter(x => x.metrics[key] === value).length;
    const rank = below + (equal + 1) / 2;
    return sum + (eligible.length > 1 ? ((eligible.length - rank) / (eligible.length - 1)) * 100 : 50) * [0.4, 0.3, 0.3][index];
  }, 0);
  rows.sort((a, b) => (b.rarity ?? -1) - (a.rarity ?? -1) || a.name.localeCompare(b.name, "ru"));
  for (const row of eligible) row.rank = 1 + eligible.filter(x => x.rarity! > row.rarity! + 1e-9).length;
  return rows;
}
export function rankFixture(count: number): Summary[] {
  return Array.from({ length: count }, (_, i) => ({ id: String(i), name: `Менеджер ${i}`, franchise: null, count: 1, leagues: 1, buys: 0,
    metrics: { own_cohort_gap: i % 37, cap_gap: (i * 11) % 53, buy_delta_gap: i % 19 === 0 ? null : ((i * 13) % 97) / 7 },
    rarity: null, rank: null, xfoComplete: 0, xfoEligible: 0, xfoCoverage: null, xfoFilled: 0, activeRounds: 0, reserveRounds: 0, personalRounds: 0, missingLineups: 0 }));
}
