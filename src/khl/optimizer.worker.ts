/** One short-lived worker per user request; termination is the cancellation mechanism. */
import { optimizeKhl, type OptimizeInput } from "./optimizer";
self.onmessage = (event: MessageEvent<OptimizeInput>) => {
  try { self.postMessage({ result: optimizeKhl(event.data) }); }
  catch { self.postMessage({ error: "OPTIMIZER_FAILED" }); }
};
