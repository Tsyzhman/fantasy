import { buildTransferPlanSuggestions, optimizeFantasySquad } from "@/machete/squad_logic";
import type { FantasySquadWorkerRequest, FantasySquadWorkerResponse } from "./fantasy-squad-worker-contract";

export function handleFantasySquadWorkerRequest(request: FantasySquadWorkerRequest): FantasySquadWorkerResponse {
  if (request.kind === "BUILD_TRANSFER_SUGGESTIONS") {
    return {
      kind: request.kind,
      suggestions: buildTransferPlanSuggestions(request.input),
      error: false
    };
  }
  return { kind: request.kind, optimized: optimizeFantasySquad(request.input), error: false };
}
