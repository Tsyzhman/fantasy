import assert from "node:assert/strict";
import { after, test } from "node:test";

import { prisma } from "@/lib/db";
import { GET } from "./route";

after(async () => {
  await prisma.$disconnect();
});

test(
  "health route reports ok against a configured database",
  { skip: process.env.DATABASE_URL ? false : "DATABASE_URL is required for DB integration tests." },
  async () => {
    const response = await GET();
    const body = (await response.json()) as { status?: unknown; uptimeSeconds?: unknown };

    assert.equal(response.status, 200);
    assert.equal(body.status, "ok");
    assert.equal(typeof body.uptimeSeconds, "number");
  }
);
