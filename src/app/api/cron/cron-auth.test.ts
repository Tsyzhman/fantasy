import assert from "node:assert/strict";
import test from "node:test";

import { withEnv } from "../../../test-utils/env";

import { GET as dailyIngestionCron } from "./ingestion/daily/route";
import { GET as leagueSeasonRetentionCron } from "./retention/league-seasons/route";

test("cron routes reject requests without the bearer secret", async () => {
  await withEnv({ CRON_SECRET: "expected-secret" }, async () => {
    const dailyResponse = await dailyIngestionCron(new Request("http://localhost/api/cron/ingestion/daily"));
    assert.equal(dailyResponse.status, 403);
    assert.equal((await dailyResponse.json()).error.code, "FORBIDDEN");

    const retentionResponse = await leagueSeasonRetentionCron(new Request("http://localhost/api/cron/retention/league-seasons"));
    assert.equal(retentionResponse.status, 403);
    assert.equal((await retentionResponse.json()).error.code, "FORBIDDEN");
  });
});

test("cron routes reject requests with the wrong bearer secret", async () => {
  await withEnv({ CRON_SECRET: "expected-secret", DATABASE_URL: "postgresql://user:pass@localhost:5432/app" }, async () => {
    const headers = { authorization: "Bearer wrong-secret" };
    const dailyResponse = await dailyIngestionCron(new Request("http://localhost/api/cron/ingestion/daily", { headers }));
    assert.equal(dailyResponse.status, 403);
    assert.equal((await dailyResponse.json()).error.code, "FORBIDDEN");

    const retentionResponse = await leagueSeasonRetentionCron(
      new Request("http://localhost/api/cron/retention/league-seasons", { headers })
    );
    assert.equal(retentionResponse.status, 403);
    assert.equal((await retentionResponse.json()).error.code, "FORBIDDEN");
  });
});

test("cron routes reject bearer tokens that only share a prefix", async () => {
  await withEnv({ CRON_SECRET: "expected-secret", DATABASE_URL: "postgresql://user:pass@localhost:5432/app" }, async () => {
    const headers = { authorization: "Bearer expected-secret-extra" };
    const dailyResponse = await dailyIngestionCron(new Request("http://localhost/api/cron/ingestion/daily", { headers }));
    assert.equal(dailyResponse.status, 403);
    assert.equal((await dailyResponse.json()).error.code, "FORBIDDEN");
  });
});

test("cron routes reject requests when CRON_SECRET is not configured", async () => {
  await withEnv({ CRON_SECRET: undefined, DATABASE_URL: "postgresql://user:pass@localhost:5432/app" }, async () => {
    const headers = { authorization: "Bearer anything" };
    const dailyResponse = await dailyIngestionCron(new Request("http://localhost/api/cron/ingestion/daily", { headers }));
    assert.equal(dailyResponse.status, 403);
    assert.equal((await dailyResponse.json()).error.code, "FORBIDDEN");

    const retentionResponse = await leagueSeasonRetentionCron(
      new Request("http://localhost/api/cron/retention/league-seasons", { headers })
    );
    assert.equal(retentionResponse.status, 403);
    assert.equal((await retentionResponse.json()).error.code, "FORBIDDEN");
  });
});

test("cron routes report missing database after bearer auth succeeds", async () => {
  await withEnv({ CRON_SECRET: "expected-secret", DATABASE_URL: "" }, async () => {
    const headers = { authorization: "Bearer expected-secret" };
    const dailyResponse = await dailyIngestionCron(new Request("http://localhost/api/cron/ingestion/daily", { headers }));
    assert.equal(dailyResponse.status, 503);
    assert.equal((await dailyResponse.json()).error.code, "DATABASE_NOT_CONFIGURED");

    const retentionResponse = await leagueSeasonRetentionCron(
      new Request("http://localhost/api/cron/retention/league-seasons", { headers })
    );
    assert.equal(retentionResponse.status, 503);
    assert.equal((await retentionResponse.json()).error.code, "DATABASE_NOT_CONFIGURED");
  });
});
