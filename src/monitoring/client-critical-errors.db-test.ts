import assert from "node:assert/strict";
import { after, test } from "node:test";

import { POST } from "@/app/api/client-errors/route";
import { GET } from "@/app/api/health/client-errors/route";
import { prisma } from "@/lib/db";

after(async () => {
  if (process.env.DATABASE_URL) await prisma.clientCriticalErrorEvent.deleteMany();
  await prisma.$disconnect();
});

test(
  "anonymous client errors aggregate by minute and make health fail closed",
  { skip: process.env.DATABASE_URL ? false : "DATABASE_URL is required for DB integration tests." },
  async () => {
    await prisma.clientCriticalErrorEvent.deleteMany();
    const request = () =>
      new Request("http://localhost/api/client-errors", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind: "WINDOW_ERROR", routeGroup: "machete" })
      });

    assert.equal((await POST(request())).status, 202);
    assert.equal((await POST(request())).status, 202);

    const rows = await prisma.clientCriticalErrorEvent.findMany();
    assert.equal(rows.length, 1);
    assert.equal(rows[0]?.count, 2);

    const unhealthy = await GET();
    assert.equal(unhealthy.status, 503);
    assert.equal((await unhealthy.json()).total, 2);

    await prisma.clientCriticalErrorEvent.deleteMany();
    const healthy = await GET();
    assert.equal(healthy.status, 200);
    assert.equal((await healthy.json()).total, 0);
  }
);
