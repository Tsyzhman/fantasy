import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";

import { prisma } from "@/lib/db";

after(async () => {
  await prisma.$disconnect();
});

test(
  "submission contract rejects only real valid runs without submitted provenance",
  { skip: process.env.DATABASE_URL ? false : "DATABASE_URL is required for DB integration tests." },
  async () => {
    const suffix = randomUUID();
    const user = await prisma.user.create({
      data: { email: `submission-contract-${suffix}@example.invalid` }
    });

    const insertRun = (id: string, synthetic: boolean, valid: boolean | null, submitted: boolean) =>
      prisma.$executeRaw`
        INSERT INTO "beta_test_runs" (
          "id", "user_id", "device_class", "viewport_width", "synthetic", "valid",
          "submitted_at", "updated_at"
        ) VALUES (
          ${id}, ${user.id}, 'desktop', 1280, ${synthetic}, ${valid},
          ${submitted ? new Date() : null}, CURRENT_TIMESTAMP
        )
      `;

    try {
      const rejectedId = `contract-rejected-${suffix}`;
      await assert.rejects(insertRun(rejectedId, false, true, false));
      assert.equal(await prisma.betaTestRun.count({ where: { id: rejectedId } }), 0);

      await insertRun(`contract-submitted-${suffix}`, false, true, true);
      await insertRun(`contract-invalid-${suffix}`, false, false, false);
      await insertRun(`contract-open-${suffix}`, false, null, false);
      await insertRun(`contract-synthetic-${suffix}`, true, true, false);

      const constraints = await prisma.$queryRaw<
        Array<{ convalidated: boolean; definition: string }>
      >`
        SELECT convalidated, pg_get_constraintdef(oid, true) AS definition
        FROM pg_constraint
        WHERE conrelid = '"beta_test_runs"'::regclass
          AND conname = 'beta_test_runs_real_valid_requires_submission_check'
      `;
      assert.equal(constraints.length, 1);
      assert.equal(constraints[0]?.convalidated, false);
      assert.match(constraints[0]?.definition ?? "", /submitted_at IS NOT NULL/);
    } finally {
      await prisma.user.delete({ where: { id: user.id } });
    }
  }
);
