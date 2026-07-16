#!/usr/bin/env node

import { createHash } from "node:crypto";
import { appendFile } from "node:fs/promises";

const baseUrl = requiredUrl("MONITOR_BASE_URL");
const githubApiUrl = new URL(process.env.GITHUB_API_URL ?? "https://api.github.com");
const repository = process.env.GITHUB_REPOSITORY ?? "";
const githubToken = process.env.GITHUB_TOKEN ?? "";
const dryRun = process.env.MONITOR_DRY_RUN === "true";
const alertTitle = process.env.MONITOR_ALERT_TITLE ?? "[production-monitor] Fantasy Scout alert";
const timeoutMs = positiveInteger(process.env.MONITOR_TIMEOUT_MS, 10_000);
const now = new Date();

const checks = await Promise.all([
  checkJsonEndpoint({
    name: "Application health",
    path: "/api/health",
    severity: "critical",
    evaluate: ({ status, body }) => ({
      ok: status === 200 && body?.status === "ok",
      detail: status === 200 && body?.status === "ok" ? "healthy" : `HTTP ${status}; status=${stringValue(body?.status)}`,
      fingerprint: `${status}:${stringValue(body?.status)}`
    })
  }),
  checkTextEndpoint({
    name: "Login page",
    path: "/login",
    severity: "critical",
    evaluate: ({ status }) => ({
      ok: status === 200,
      detail: status === 200 ? "reachable" : `HTTP ${status}`,
      fingerprint: String(status)
    })
  }),
  checkJsonEndpoint({
    name: "Data update gate",
    path: "/api/health/data-quality",
    severity: "warning",
    evaluate: ({ status, body }) => {
      const results = Array.isArray(body?.results) ? body.results : [];
      const scopes = results.map((result) => {
        const scope = `${stringValue(result?.leagueId)}/${stringValue(result?.season)}`;
        const latest = result?.latestRun ?? {};
        return `${scope}: gate=${Boolean(latest.gatePassed)}, forecast=${numberValue(latest.forecastCoverage)}%, latency=${numberValue(latest.promotionLatencyCoverage)}%`;
      });
      const ok = status === 200 && body?.healthy === true;
      return {
        ok,
        detail: ok ? "fresh audit passed" : scopes.join("; ") || `HTTP ${status}; healthy=${Boolean(body?.healthy)}`,
        fingerprint: `${status}:${Boolean(body?.healthy)}:${scopes.join(";")}`
      };
    }
  }),
  checkJsonEndpoint({
    name: "Server error-rate audit",
    path: "/_monitor/access-audit.json",
    severity: "warning",
    evaluate: ({ status, body }) => {
      const generatedAt = Date.parse(stringValue(body?.generatedAt));
      const ageMinutes = Number.isFinite(generatedAt) ? Math.max(0, (now.getTime() - generatedAt) / 60_000) : Number.POSITIVE_INFINITY;
      const auditStatus = stringValue(body?.status);
      const fresh = ageMinutes <= 90;
      const ok = status === 200 && auditStatus === "ok" && fresh;
      const detail = status !== 200
        ? `HTTP ${status}`
        : `${auditStatus || "missing status"}; requests=${numberValue(body?.requests)}; 5xx=${numberValue(body?.serverErrors)} (${numberValue(body?.serverErrorRatePercent)}%); p75=${numberValue(body?.durationMs?.p75)}ms; p95=${numberValue(body?.durationMs?.p95)}ms; age=${Number.isFinite(ageMinutes) ? ageMinutes.toFixed(1) : "unknown"}m`;
      return {
        ok,
        detail,
        fingerprint: `${status}:${auditStatus}:${fresh}:${numberValue(body?.serverErrorRatePercent)}`
      };
    }
  })
]);

const criticalFailures = checks.filter((check) => !check.ok && check.severity === "critical");
const warnings = checks.filter((check) => !check.ok && check.severity === "warning");
const alertRequired = criticalFailures.length > 0 || warnings.length > 0;
const fingerprint = createHash("sha256")
  .update(JSON.stringify(checks.map(({ name, ok, severity, fingerprint: value }) => ({ name, ok, severity, value }))))
  .digest("hex")
  .slice(0, 16);
const report = buildReport({ checks, criticalFailures, warnings, fingerprint, checkedAt: now.toISOString() });

console.log(JSON.stringify({
  checkedAt: now.toISOString(),
  alertRequired,
  criticalFailures: criticalFailures.length,
  warnings: warnings.length,
  fingerprint,
  checks: checks.map(({ fingerprint: _fingerprint, ...check }) => check)
}, null, 2));

if (process.env.GITHUB_STEP_SUMMARY) {
  await appendFile(process.env.GITHUB_STEP_SUMMARY, `${report}\n`, "utf8");
}

if (!dryRun) {
  validateGitHubConfiguration(repository, githubToken);
  await synchronizeAlertIssue({ alertRequired, fingerprint, report });
}

if (criticalFailures.length > 0) process.exitCode = 1;

async function checkJsonEndpoint(input) {
  return checkEndpoint({ ...input, parseBody: parseJsonBody });
}

async function checkTextEndpoint(input) {
  return checkEndpoint({ ...input, parseBody: async () => null });
}

async function checkEndpoint({ name, path, severity, parseBody, evaluate }) {
  const startedAt = performance.now();
  try {
    const response = await fetch(new URL(path, baseUrl), {
      headers: { "user-agent": "fantasy-scout-production-monitor/1.0" },
      redirect: "follow",
      signal: AbortSignal.timeout(timeoutMs)
    });
    const body = await parseBody(response);
    const evaluation = evaluate({ status: response.status, body });
    return {
      name,
      path,
      severity,
      ok: evaluation.ok,
      httpStatus: response.status,
      durationMs: Math.round(performance.now() - startedAt),
      detail: evaluation.detail,
      fingerprint: evaluation.fingerprint
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      name,
      path,
      severity,
      ok: false,
      httpStatus: null,
      durationMs: Math.round(performance.now() - startedAt),
      detail: `request failed: ${message}`,
      fingerprint: `request-failed:${error instanceof Error ? error.name : "unknown"}`
    };
  }
}

async function parseJsonBody(response) {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function buildReport({ checks: rows, criticalFailures: critical, warnings: warningRows, fingerprint: reportFingerprint, checkedAt }) {
  const table = rows.map((check) =>
    `| ${check.ok ? "OK" : check.severity.toUpperCase()} | ${escapeMarkdown(check.name)} | ${check.httpStatus ?? "—"} | ${check.durationMs} | ${escapeMarkdown(check.detail)} |`
  ).join("\n");

  return `## Production monitor\n\n` +
    `Checked: \`${checkedAt}\`  \n` +
    `Critical failures: **${critical.length}** · warnings: **${warningRows.length}**  \n` +
    `Prices are intentionally excluded from this monitor until the official feed exists.\n\n` +
    `| State | Check | HTTP | ms | Detail |\n` +
    `|---|---|---:|---:|---|\n${table}\n\n` +
    `<!-- monitor-fingerprint:${reportFingerprint} -->`;
}

async function synchronizeAlertIssue({ alertRequired: shouldAlert, fingerprint: currentFingerprint, report: issueBody }) {
  const issues = await githubRequest(`/repos/${repository}/issues?state=all&per_page=100`);
  const issue = Array.isArray(issues)
    ? issues.find((candidate) => !candidate.pull_request && candidate.title === alertTitle)
    : null;

  if (shouldAlert) {
    if (!issue) {
      await githubRequest(`/repos/${repository}/issues`, {
        method: "POST",
        body: JSON.stringify({ title: alertTitle, body: issueBody })
      });
      return;
    }

    const previousFingerprint = monitorFingerprint(issue.body);
    if (issue.state !== "open" || previousFingerprint !== currentFingerprint) {
      await githubRequest(`/repos/${repository}/issues/${issue.number}`, {
        method: "PATCH",
        body: JSON.stringify({ state: "open", body: issueBody })
      });
    }
    return;
  }

  if (issue?.state === "open") {
    await githubRequest(`/repos/${repository}/issues/${issue.number}`, {
      method: "PATCH",
      body: JSON.stringify({ state: "closed", state_reason: "completed", body: issueBody })
    });
  }
}

async function githubRequest(path, init = {}) {
  const response = await fetch(new URL(path, githubApiUrl), {
    ...init,
    headers: {
      accept: "application/vnd.github+json",
      authorization: `Bearer ${githubToken}`,
      "content-type": "application/json",
      "user-agent": "fantasy-scout-production-monitor/1.0",
      "x-github-api-version": "2026-03-10",
      ...init.headers
    },
    signal: AbortSignal.timeout(timeoutMs)
  });

  const text = await response.text();
  if (!response.ok) throw new Error(`GitHub API ${init.method ?? "GET"} ${path} returned ${response.status}: ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : null;
}

function monitorFingerprint(body) {
  const match = typeof body === "string" ? body.match(/<!-- monitor-fingerprint:([a-f0-9]+) -->/) : null;
  return match?.[1] ?? null;
}

function requiredUrl(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required.`);
  const url = new URL(value);
  if (url.protocol !== "https:" && !isLoopback(url.hostname)) throw new Error(`${name} must use HTTPS outside loopback tests.`);
  return url;
}

function validateGitHubConfiguration(repo, token) {
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo)) throw new Error("GITHUB_REPOSITORY must be owner/repository.");
  if (!token) throw new Error("GITHUB_TOKEN is required unless MONITOR_DRY_RUN=true.");
}

function positiveInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function stringValue(value) {
  return typeof value === "string" ? value : value === null || value === undefined ? "" : String(value);
}

function numberValue(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Number(parsed.toFixed(3)) : 0;
}

function escapeMarkdown(value) {
  return String(value).replaceAll("|", "\\|").replaceAll("\n", " ");
}

function isLoopback(hostname) {
  return hostname === "127.0.0.1" || hostname === "localhost" || hostname === "::1";
}
