import { buildTransferPlanSuggestions, optimizeFantasySquad } from "@/machete/squad_logic";
import { optimizeGlobalSquad } from "@/machete/global-strategy-planner";
import type { FantasySquadWorkerRequest, FantasySquadWorkerResponse } from "./fantasy-squad-worker-contract";

/** @spec spec://modules/machete/FEAT-001-global-ranking-strategy#contracts */
export function handleFantasySquadWorkerRequest(request: FantasySquadWorkerRequest): FantasySquadWorkerResponse {
  if (request.kind === "BUILD_TRANSFER_SUGGESTIONS") {
    return {
      kind: request.kind,
      suggestions: buildTransferPlanSuggestions(request.input),
      error: false
    };
  }
  if (request.input.strategy === "GLOBAL_AUTO") {
    const result = optimizeGlobalSquad(request.input, Date.now(), request.startersOnly);
    return { kind: request.kind, optimized: result.selections, analysis: result.analysis, error: false };
  }
  return { kind: request.kind, optimized: optimizeFantasySquad(request.input), error: false };
}
