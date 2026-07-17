import type { FantasySquadWorkerRequest, FantasySquadWorkerResponse } from "./fantasy-squad-worker-contract";
import { handleFantasySquadWorkerRequest } from "./fantasy-squad-worker-handler";

type OptimizerWorkerScope = {
  onmessage: ((event: MessageEvent<FantasySquadWorkerRequest>) => void) | null;
  postMessage: (response: FantasySquadWorkerResponse) => void;
};

const workerScope = self as unknown as OptimizerWorkerScope;

workerScope.onmessage = (event) => {
  try {
    workerScope.postMessage(handleFantasySquadWorkerRequest(event.data));
  } catch {
    workerScope.postMessage({ kind: event.data.kind, error: true });
  }
};
