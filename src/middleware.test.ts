import assert from "node:assert/strict";
import test from "node:test";

import { NextRequest } from "next/server";

import { middleware } from "../middleware";
import { withEnv } from "./test-utils/env";

test("middleware reports missing database before API auth checks", async () => {
  await withEnv({ DATABASE_URL: "" }, async () => {
    const response = middleware(new NextRequest("http://localhost/api/machete/sync-status"));
    assert.equal(response.status, 503);
    assert.equal((await response.json()).error.code, "DATABASE_NOT_CONFIGURED");
  });
});

test("middleware allows logout even when database is missing", () => {
  return withEnv({ DATABASE_URL: "" }, () => {
    const response = middleware(new NextRequest("http://localhost/api/auth/logout", { method: "POST" }));
    assert.equal(response.status, 200);
  });
});

test("middleware lets health route report database status", () => {
  return withEnv({ DATABASE_URL: "" }, () => {
    const response = middleware(new NextRequest("http://localhost/api/health"));
    assert.equal(response.status, 200);
  });
});

test("middleware lets nested health routes report operational status", () => {
  return withEnv({ DATABASE_URL: "" }, () => {
    const response = middleware(new NextRequest("http://localhost/api/health/data-quality"));
    assert.equal(response.status, 200);
  });
});

test("middleware lets anonymous client-error collection enforce its own bounds", () => {
  return withEnv({ DATABASE_URL: "postgresql://user:pass@localhost:5432/app" }, () => {
    const response = middleware(new NextRequest("http://localhost/api/client-errors", { method: "POST" }));
    assert.equal(response.status, 200);
  });
});

test("middleware lets cron routes enforce their bearer secret", () => {
  return withEnv({ DATABASE_URL: "postgresql://user:pass@localhost:5432/app" }, () => {
    const response = middleware(new NextRequest("http://localhost/api/cron/ingestion/daily"));
    assert.equal(response.status, 200);
  });
});

test("middleware does not make cron-like API paths public", async () => {
  await withEnv({ DATABASE_URL: "postgresql://user:pass@localhost:5432/app" }, async () => {
    const response = middleware(new NextRequest("http://localhost/api/crony"));
    assert.equal(response.status, 401);
    assert.equal((await response.json()).error.code, "UNAUTHORIZED");
  });
});
