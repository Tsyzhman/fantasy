import { performance } from "node:perf_hooks";

import {
  createFantasyAddEvaluator,
  defaultFantasySquadRules,
  fantasyAddBlockReason,
  type FantasyPlannerPlayer
} from "../src/machete/squad_logic";

const positions = ["GK", "DEF", "MID", "FWD"] as const;
const players: FantasyPlannerPlayer[] = Array.from({ length: 430 }, (_, index) => ({
  id: String(index),
  playerId: String(index),
  teamId: String(index % 16),
  name: `Player ${index}`,
  teamName: `Team ${index % 16}`,
  leagueName: "Benchmark league",
  position: positions[index % positions.length],
  positionGroup: positions[index % positions.length],
  price: 5 + (index % 16) * 0.5,
  priceSource: "ESTIMATED",
  predictedFp: 3,
  valueScore: 1,
  roundPoints: [3],
  fixtures: [],
  fixtureDifficulties: []
}));

const runs = 20;
let isolatedMs = 0;
let sharedMs = 0;
for (let run = 0; run < runs; run += 1) {
  let startedAt = performance.now();
  for (const player of players) fantasyAddBlockReason(player, players, [], defaultFantasySquadRules);
  isolatedMs += performance.now() - startedAt;

  startedAt = performance.now();
  const evaluator = createFantasyAddEvaluator(players, [], defaultFantasySquadRules);
  for (const player of players) evaluator.reason(player);
  sharedMs += performance.now() - startedAt;
}

const beforeMs = isolatedMs / runs;
const afterMs = sharedMs / runs;
console.log(JSON.stringify({
  players: players.length,
  runs,
  beforeMs: Number(beforeMs.toFixed(2)),
  afterMs: Number(afterMs.toFixed(2)),
  improvementPercent: Number(((1 - afterMs / beforeMs) * 100).toFixed(1))
}, null, 2));
