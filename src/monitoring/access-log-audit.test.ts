import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const python = process.platform === "win32" ? "python" : "python3";
const script = resolve(process.cwd(), "ops/monitoring/analyze_caddy_access_log.py");
const now = "2026-07-16T08:00:00Z";

test("access-log audit fails closed when the 5xx rate reaches the one-percent limit", () => {
  const directory = mkdtempSync(join(tmpdir(), "fantasy-access-audit-"));
  try {
    const log = join(directory, "fantasy-access.log");
    const output = join(directory, "audit.json");
    const entries = Array.from({ length: 20 }, (_, index) => ({
      ts: Date.parse("2026-07-16T07:45:00Z") / 1000 + index,
      status: index === 0 ? 500 : 200,
      duration: (index + 1) / 1000
    }));
    writeFileSync(log, `${entries.map((entry) => JSON.stringify(entry)).join("\n")}\n`, "utf8");

    const result = runAudit(log, output, "20");
    assert.equal(result.status, 2, result.stderr);
    const report = JSON.parse(readFileSync(output, "utf8"));
    assert.equal(report.status, "breach");
    assert.equal(report.serverErrors, 1);
    assert.equal(report.serverErrorRatePercent, 5);
    assert.equal(report.durationMs.p75, 15);
    assert.equal(report.firstObservedAt, "2026-07-16T07:45:00.000Z");
    assert.equal(report.lastObservedAt, "2026-07-16T07:45:19.000Z");
    assert.equal(report.observedSpanMinutes, 0.317);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("access-log audit reports insufficient data without inventing a passing rate", () => {
  const directory = mkdtempSync(join(tmpdir(), "fantasy-access-audit-"));
  try {
    const log = join(directory, "fantasy-access.log");
    const output = join(directory, "audit.json");
    writeFileSync(log, `${JSON.stringify({ ts: Date.parse("2026-07-16T07:55:00Z") / 1000, status: 200, duration: 0.1 })}\n`, "utf8");

    const result = runAudit(log, output, "20");
    assert.equal(result.status, 0, result.stderr);
    const report = JSON.parse(readFileSync(output, "utf8"));
    assert.equal(report.status, "insufficient_data");
    assert.equal(report.requests, 1);
    assert.equal(report.observedSpanMinutes, 0);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("access-log audit excludes warning health endpoints from user error rate", () => {
  const directory = mkdtempSync(join(tmpdir(), "fantasy-access-audit-"));
  try {
    const log = join(directory, "fantasy-access.log");
    const output = join(directory, "audit.json");
    const entries = [
      ...Array.from({ length: 20 }, (_, index) => ({
        ts: Date.parse("2026-07-16T07:45:00Z") / 1000 + index,
        status: 200,
        duration: 0.01,
        request: { uri: "/machete/squad" }
      })),
      {
        ts: Date.parse("2026-07-16T07:50:00Z") / 1000,
        status: 503,
        duration: 0.02,
        request: { uri: "/api/health/data-quality?probe=1" }
      }
    ];
    writeFileSync(log, `${entries.map((entry) => JSON.stringify(entry)).join("\n")}\n`, "utf8");

    const result = runAudit(log, output, "20", ["/api/health/data-quality"]);
    assert.equal(result.status, 0, result.stderr);
    const report = JSON.parse(readFileSync(output, "utf8"));
    assert.equal(report.status, "ok");
    assert.equal(report.requests, 20);
    assert.equal(report.excludedRequests, 1);
    assert.equal(report.serverErrors, 0);
    assert.equal(report.lastObservedAt, "2026-07-16T07:45:19.000Z");
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("access-log audit excludes known synthetic probes by User-Agent without excluding real traffic", () => {
  const directory = mkdtempSync(join(tmpdir(), "fantasy-access-audit-"));
  try {
    const log = join(directory, "fantasy-access.log");
    const output = join(directory, "audit.json");
    const entries = [
      ...Array.from({ length: 20 }, (_, index) => ({
        ts: Date.parse("2026-07-16T07:45:00Z") / 1000 + index,
        status: 200,
        duration: 0.01,
        request: { uri: index === 0 ? "/login" : "/machete/squad", headers: { "User-Agent": ["Mozilla/5.0"] } }
      })),
      ...Array.from({ length: 5 }, (_, index) => ({
        ts: Date.parse("2026-07-16T07:50:00Z") / 1000 + index,
        status: 200,
        duration: 0.02,
        request: { uri: index % 2 === 0 ? "/api/health" : "/login", headers: { "User-Agent": ["Fantasy-Scout-Production-Monitor/1.0"] } }
      })),
      ...Array.from({ length: 6 }, (_, index) => ({
        ts: Date.parse("2026-07-16T07:51:00Z") / 1000 + index,
        status: 502,
        duration: 0.38,
        request: { uri: `/_next/static/chunks/${index}.js`, headers: { "User-Agent": ["fantasy-production-browser-smoke/12345"] } }
      }))
    ];
    writeFileSync(log, `${entries.map((entry) => JSON.stringify(entry)).join("\n")}\n`, "utf8");

    const result = runAudit(log, output, "20", [], [
      "fantasy-scout-production-monitor/1.0",
      "fantasy-production-browser-smoke/"
    ]);
    assert.equal(result.status, 0, result.stderr);
    const report = JSON.parse(readFileSync(output, "utf8"));
    assert.equal(report.status, "ok");
    assert.equal(report.requests, 20);
    assert.equal(report.excludedRequests, 11);
    assert.equal(report.excludedUserAgentRequests, 11);
    assert.equal(report.statusCounts["200"], 20);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

function runAudit(
  log: string,
  output: string,
  minimumRequests: string,
  excludedPaths: string[] = [],
  excludedUserAgentPrefixes: string[] = []
) {
  return spawnSync(python, [
    script,
    "--log-pattern", log,
    "--since-minutes", "60",
    "--max-5xx-rate-percent", "1",
    "--min-requests", minimumRequests,
    ...excludedPaths.flatMap((path) => ["--exclude-path", path]),
    ...excludedUserAgentPrefixes.flatMap((prefix) => ["--exclude-user-agent-prefix", prefix]),
    "--output", output,
    "--now", now
  ], { encoding: "utf8" });
}
