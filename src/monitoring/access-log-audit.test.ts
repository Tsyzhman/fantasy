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
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

function runAudit(log: string, output: string, minimumRequests: string) {
  return spawnSync(python, [
    script,
    "--log-pattern", log,
    "--since-minutes", "60",
    "--max-5xx-rate-percent", "1",
    "--min-requests", minimumRequests,
    "--output", output,
    "--now", now
  ], { encoding: "utf8" });
}
