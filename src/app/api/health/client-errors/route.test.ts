import assert from "node:assert/strict";
import test from "node:test";

import { withEnv } from "../../../../test-utils/env";

import { GET } from "./route";

test("client-error health fails closed without a configured database", async () => {
  await withEnv({ DATABASE_URL: "", CLIENT_CRITICAL_ERROR_WINDOW_MINUTES: "15" }, async () => {
    const response = await GET();
    const body = await response.json();
    assert.equal(response.status, 503);
    assert.equal(body.healthy, false);
    assert.equal(body.windowMinutes, 15);
    assert.equal(body.total, null);
    assert.deepEqual(body.byKind, []);
    assert.equal(body.lastSeenAt, null);
  });
});
