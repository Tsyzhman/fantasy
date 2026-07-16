import {
  optimizeFantasySquad,
  type FantasySquadOptimizationInput,
  type FantasySquadSelection
} from "@/machete/squad_logic";

type OptimizerWorkerRequest = {
  input: FantasySquadOptimizationInput;
};

type OptimizerWorkerResponse = {
  optimized: FantasySquadSelection[] | null;
  error: boolean;
};

type OptimizerWorkerScope = {
  onmessage: ((event: MessageEvent<OptimizerWorkerRequest>) => void) | null;
  postMessage: (response: OptimizerWorkerResponse) => void;
};

const workerScope = self as unknown as OptimizerWorkerScope;

workerScope.onmessage = (event) => {
  try {
    workerScope.postMessage({ optimized: optimizeFantasySquad(event.data.input), error: false });
  } catch {
    workerScope.postMessage({ optimized: null, error: true });
  }
};
