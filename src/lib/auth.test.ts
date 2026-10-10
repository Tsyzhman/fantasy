import assert from "node:assert/strict";
import test from "node:test";

import { withEnv } from "../test-utils/env";

import { createUserSession, getCurrentUser, isSafeRedirectPath, requireApiAdmin, requireApiUser } from "./auth";

/** @spec spec://common/FEAT-009-session-authentication#redirects */
test("internal returns reject external and ambiguous URL interpretations", () => {
  for (const value of [null, "", "https://evil.invalid", "//evil.invalid", "/\\evil.invalid", "/%5cevil.invalid",
    "/%2fevil.invalid", "/%252fevil.invalid", "/%255cevil.invalid", "/\n/evil.invalid", "/%0a/evil.invalid", "/%zz"]) {
    assert.equal(isSafeRedirectPath(value), false, String(value));
  }
  for (const value of ["/", "/machete/squad", "/machete/squad?league=42#pool", "/search?q=two%20words"]) {
    assert.equal(isSafeRedirectPath(value), true, value);
  }
});

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
