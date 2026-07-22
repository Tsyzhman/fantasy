import assert from "node:assert/strict";
import test from "node:test";
import type { PrismaClient } from "@prisma/client";

import { waitForIngestionJobTerminal } from "@/server/machete-daily-sync";

test("nightly follow-up waits until the queued FotMob job completes", async () => {
  const statuses = ["pending", "running", "completed"];
  const prisma = {
    ingestionJob: {
      async findUnique() {
        return { status: statuses.shift() ?? "completed" };
      }
    }
  } as unknown as PrismaClient;
  let waits = 0;

  const status = await waitForIngestionJobTerminal(prisma, "job-1", {
    pollIntervalMs: 0,
    maximumWaitMs: 1_000,
    wait: async () => { waits += 1; }
  });

  assert.equal(status, "completed");
  assert.equal(waits, 2);
});

test("nightly follow-up does not treat failed FotMob ingestion as completed", async () => {
  const prisma = {
    ingestionJob: {
      async findUnique() {
        return { status: "failed" };
      }
    }
  } as unknown as PrismaClient;

  assert.equal(await waitForIngestionJobTerminal(prisma, "job-2"), "failed");
});
