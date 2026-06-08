import assert from "node:assert/strict";
import test from "node:test";

import { withEnv } from "../../../test-utils/env";

import { GET } from "./route";

test("health route reports unhealthy when database is not configured", async () => {
  await withEnv({ DATABASE_URL: "" }, async () => {
    const response = await GET();
    const payload = await response.json();

    assert.equal(response.status, 503);
    assert.equal(payload.status, "error");
    assert.equal(typeof payload.uptimeSeconds, "number");
  });
});
