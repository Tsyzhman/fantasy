import assert from "node:assert/strict";
import test from "node:test";

import { defaultFantasySquadRules } from "@/machete/squad_logic";
import { handleFantasySquadWorkerRequest } from "./fantasy-squad-worker-handler";

test("worker handler calculates transfer suggestions without using the UI thread contract", () => {
  const response = handleFantasySquadWorkerRequest({
    kind: "BUILD_TRANSFER_SUGGESTIONS",
    input: {
      pool: [],
      selections: [],
      rules: defaultFantasySquadRules,
      horizon: 5,
      forecastSource: "FO",
      transferCount: 3,
      maximumPlans: 6
    }
  });

  assert.equal(response.kind, "BUILD_TRANSFER_SUGGESTIONS");
  assert.equal(response.error, false);
  if (!response.error && response.kind === "BUILD_TRANSFER_SUGGESTIONS") assert.deepEqual(response.suggestions, []);
});
