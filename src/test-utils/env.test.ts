import assert from "node:assert/strict";
import test from "node:test";

import { withEnv } from "./env";

test("withEnv restores environment variables", async () => {
  process.env.TEST_WITH_ENV_RESTORE = "before";

  await withEnv({ TEST_WITH_ENV_RESTORE: "inside" }, () => {
    assert.equal(process.env.TEST_WITH_ENV_RESTORE, "inside");
  });

  assert.equal(process.env.TEST_WITH_ENV_RESTORE, "before");
  delete process.env.TEST_WITH_ENV_RESTORE;
});

test("withEnv serializes concurrent environment mutations", async () => {
  let releaseFirst: () => void = () => undefined;
  const firstCanFinish = new Promise<void>((resolve) => {
    releaseFirst = resolve;
  });
  let secondStarted = false;

  const first = withEnv({ TEST_WITH_ENV_LOCK: "first" }, async () => {
    assert.equal(process.env.TEST_WITH_ENV_LOCK, "first");
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(secondStarted, false);
    releaseFirst();
    await firstCanFinish;
    assert.equal(process.env.TEST_WITH_ENV_LOCK, "first");
  });

  const second = withEnv({ TEST_WITH_ENV_LOCK: "second" }, () => {
    secondStarted = true;
    assert.equal(process.env.TEST_WITH_ENV_LOCK, "second");
  });

  await Promise.all([first, second]);
  assert.equal(process.env.TEST_WITH_ENV_LOCK, undefined);
});
