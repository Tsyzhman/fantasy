import assert from "node:assert/strict";
import test from "node:test";

import { withEnv } from "../../../../test-utils/env";
import { evaluateDataQualityAuditRunHealth } from "../../../../machete/data_quality_monitor";

import { GET } from "./route";

test("data-quality health reports an unconfigured database", async () => {
  await withEnv({ DATABASE_URL: "" }, async () => {
    const response = await GET();
    assert.equal(response.status, 503);
    assert.equal((await response.json()).reason, "DATABASE_NOT_CONFIGURED");
  });
});

test("data-quality health accepts only recent completed passing runs", () => {
  const now = new Date("2026-07-15T10:00:00.000Z").getTime();
  assert.deepEqual(
    evaluateDataQualityAuditRunHealth(
      { status: "COMPLETED", gatePassed: true, completedAt: new Date("2026-07-15T09:00:00.000Z") },
      now,
      26
    ),
    { healthy: true, ageHours: 1 }
  );
  assert.equal(
    evaluateDataQualityAuditRunHealth(
      { status: "COMPLETED", gatePassed: true, completedAt: new Date("2026-07-14T07:00:00.000Z") },
      now,
      26
    ).healthy,
    false
  );
  assert.equal(
    evaluateDataQualityAuditRunHealth(
      { status: "COMPLETED", gatePassed: false, completedAt: new Date("2026-07-15T09:00:00.000Z") },
      now,
      26
    ).healthy,
    false
  );
  assert.equal(evaluateDataQualityAuditRunHealth(null, now, 26).healthy, false);
});
