import type {
  FantasyPlannerPlayer,
  FantasySquadOptimizationInput,
  FantasySquadSelection,
  FantasySquadRules,
  TransferPlanSuggestion,
  TransferSuggestionForecastSource
} from "@/machete/squad_logic";

export type TransferSuggestionWorkerInput = {
  strategy?: import("@/machete/squad_logic").FantasySquadStrategy;
  globalStrategy?: import("@/machete/global-strategy").GlobalStrategyRequestContext | null;
  pool: FantasyPlannerPlayer[];
  selections: FantasySquadSelection[];
  rules: FantasySquadRules;
  horizon: number;
  forecastSource?: TransferSuggestionForecastSource;
  transferCount: number;
  maximumPlans: number;
  freeTransfers?: number | null;
  paidTransferPointCost?: number | null;
};

export type FantasySquadWorkerRequest =
  | { kind: "OPTIMIZE_SQUAD"; input: FantasySquadOptimizationInput; startersOnly?: boolean }
  | { kind: "BUILD_TRANSFER_SUGGESTIONS"; input: TransferSuggestionWorkerInput };

export type FantasySquadWorkerResponse =
  | { kind: "OPTIMIZE_SQUAD"; optimized: FantasySquadSelection[] | null; analysis?: import("@/machete/global-strategy-planner").GlobalStrategyAnalysis | null; error: false }
  | { kind: "BUILD_TRANSFER_SUGGESTIONS"; suggestions: TransferPlanSuggestion[]; error: false }
  | { kind: FantasySquadWorkerRequest["kind"]; error: true };
