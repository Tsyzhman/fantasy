/** @spec spec://modules/machete/FEAT-001-global-ranking-strategy#acceptance */
import { mkdirSync, writeFileSync } from "node:fs";
import { performance } from "node:perf_hooks";
import { defaultFantasySquadRules, optimizeFantasySquad, type FantasyPlannerPlayer } from "../src/machete/squad_logic";
import { optimizeGlobalSquad } from "../src/machete/global-strategy-planner";
import { globalStrategyConfig } from "../src/machete/global-strategy-config";
import type { GlobalStrategyRequestContext } from "../src/machete/global-strategy";

const results = [];
for (const provider of ["FPL", "SPORTS_RU"] as const) {
  const positions = ["GK", "DEF", "MID", "FWD"] as const;
  const pool: FantasyPlannerPlayer[] = Array.from({ length: 120 }, (_, i) => ({ id: String(i + 1), playerId: String(i + 1), providerPlayerId: String(i + 1),
    teamId: String(Math.floor(i / 6)), name: `Player ${i + 1}`, teamName: `Team ${Math.floor(i / 6)}`, leagueName: "Synthetic fixed benchmark", position: positions[i % 4], positionGroup: positions[i % 4],
    price: 4 + (i % 12) * 0.5, priceSource: provider, predictedFp: 2 + (i % 9) * 0.6, roundPoints: [2 + (i % 9) * 0.6, 3 + (i % 7) * 0.4, 2 + (i % 11) * 0.3],
    ownershipPercent: (i * 7) % 101, valueScore: 1, fixtures: [], fixtureDifficulties: [] }));
  const now = Date.parse("2026-09-07T10:00:00Z");
  const request: GlobalStrategyRequestContext = { config: globalStrategyConfig(provider, provider === "FPL" ? "fpl" : "russia"), ownershipRevision: "fixed-ownership", forecastRevision: "fixed-synthetic-pool",
    ownershipExpiresAt: "2026-09-07T10:05:00Z", context: { provider, contestId: provider, tournamentKey: provider === "FPL" ? "fpl" : "russia", season: "2026/2027", providerSquadId: "1", revision: "fixed-context", fieldSize: 500,
      rank: 490, managerPoints: 300, leaderPoints: 600, totalRounds: 38, remainingRounds: 1, roundScoreScale: 70, scoreSampleCount: 6, standingsRoundId: "37", observedAt: "2026-09-07T09:59:00Z", expiresAt: "2026-09-07T10:05:00Z" } };
  const input = { pool, rules: { ...defaultFantasySquadRules, maxPlayersPerTeam: provider === "FPL" ? 3 : 2 }, horizon: 3, globalStrategy: request };
  for (let i = 0; i < 2; i++) { optimizeFantasySquad(input); optimizeGlobalSquad(input, now); }
  const before = process.memoryUsage();
  const baseline: number[] = [], strategy: number[] = [], heapSamples: number[] = [];
  for (let run = 0; run < 20; run++) {
    let at = performance.now();
    if (!optimizeFantasySquad(input)) throw new Error("Baseline not found");
    baseline.push(performance.now() - at);
    at = performance.now();
    const result = optimizeGlobalSquad(input, now);
    if (!result.selections || !result.analysis || result.analysis.evaluation.status !== "READY" || result.analysis.expectedPointsLoss > result.analysis.maxExpectedPointsLoss + 1e-7) throw new Error("Invalid strategy plan");
    strategy.push(performance.now() - at);
    global.gc?.();
    heapSamples.push(process.memoryUsage().heapUsed);
  }
  const p95 = (values: number[]) => [...values].sort((a, b) => a - b)[Math.ceil(values.length * 0.95) - 1];
  results.push({ provider, poolSize: pool.length, fixtureKind: "SYNTHETIC_NOT_LIVE_PROVIDER_EVIDENCE", warmups: 2, runs: 20, baselineP95Ms: p95(baseline), strategyP95Ms: p95(strategy), ratio: p95(strategy) / p95(baseline),
    memoryBefore: before, memoryAfter: process.memoryUsage(), gcAvailable: Boolean(global.gc), heapSamples, baselineMs: baseline, strategyMs: strategy });
  console.log(`${provider}: p95 ratio ${(p95(strategy) / p95(baseline)).toFixed(3)}`);
}
mkdirSync("specs/work/evidence", { recursive: true });
writeFileSync("specs/work/evidence/WI-001-performance.json", JSON.stringify({ measuredAt: new Date().toISOString(), results }, null, 2) + "\n");
if (results.some((result) => result.ratio > 2.5)) process.exitCode = 1;
