import assert from "node:assert/strict";
import test from "node:test";

import { withEnv } from "../test-utils/env";

import { createUserSession, getCurrentUser, requireApiAdmin, requireApiUser } from "./auth";

test("auth helpers fail softly when DATABASE_URL is missing", async () => {
  await withEnv({ DATABASE_URL: undefined }, async () => {
    assert.equal(await getCurrentUser(), null);
    await assert.rejects(() => createUserSession("user-1"), /DATABASE_URL is not configured/);

    const auth = await requireApiUser();
    assert.equal(auth.user, null);
    assert.equal(auth.response?.status, 503);
    assert.deepEqual(await auth.response?.json(), {
      error: {
        code: "DATABASE_NOT_CONFIGURED",
        message: "Configure DATABASE_URL before using the API."
      }
    });

    const adminAuth = await requireApiAdmin();
    assert.equal(adminAuth.user, null);
    assert.equal(adminAuth.response?.status, 503);
    assert.deepEqual(await adminAuth.response?.json(), {
      error: {
        code: "DATABASE_NOT_CONFIGURED",
        message: "Configure DATABASE_URL before using the API."
      }
    });
  });
});
