import assert from "node:assert/strict";
import test from "node:test";

import { apiError, requiredSearchParam, requiredStringParam, withApiHandler } from "./api-handler";

test("requiredStringParam accepts short non-empty strings", () => {
  assert.equal(requiredStringParam("league-1", "leagueId"), "league-1");
});

test("requiredStringParam rejects missing strings with structured api errors", () => {
  assert.throws(() => requiredStringParam("", "leagueId"), /leagueId is required/);
  assert.throws(() => requiredStringParam(null, "leagueId"), /leagueId is required/);
});

test("requiredSearchParam reads required URLSearchParams values", () => {
  const params = new URLSearchParams({ team_id: "team-1" });
  assert.equal(requiredSearchParam(params, "team_id"), "team-1");
  assert.throws(() => requiredSearchParam(params, "missing"), /missing is required/);
});

test("withApiHandler converts ApiError into structured JSON", async () => {
  const handler = withApiHandler(async () => {
    throw apiError("CUSTOM_ERROR", "Custom message.", 418);
  });
  const response = await handler();

  assert.equal(response.status, 418);
  assert.deepEqual(await response.json(), {
    error: {
      code: "CUSTOM_ERROR",
      message: "Custom message."
    }
  });
});
