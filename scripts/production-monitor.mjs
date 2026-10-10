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
const githubMaximumAttempts = Math.min(5, positiveInteger(process.env.MONITOR_GITHUB_MAX_ATTEMPTS, 3));
const githubRetryBaseMs = positiveInteger(process.env.MONITOR_GITHUB_RETRY_BASE_MS, 250);
const expectedFixedWindowStart = stringValue(process.env.MONITOR_FIXED_WINDOW_EXPECTED_START).trim();
const minimumFixedWindowObservedSpan = configuredPositiveNumber(process.env.MONITOR_FIXED_WINDOW_MIN_OBSERVED_SPAN_MINUTES);
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
  ...["fantasy-prices", "fpl"].map(source => checkJsonEndpoint({
    name: `${source} source health`, path: `/api/health/${source}`, severity: "warning",
    evaluate: ({ status, body }) => ({ ok: status === 200 && (body?.healthy === true || body?.status === "ok"),
      detail: `HTTP ${status}; status=${stringValue(body?.status)}; reasons=${JSON.stringify(body?.results ?? body?.reason ?? [])}`,
      fingerprint: `${status}:${Boolean(body?.healthy)}:${stringValue(body?.status)}` }),
  })),
  checkJsonEndpoint({
    name: "Client critical errors",
    path: "/api/health/client-errors",
    severity: "warning",
    evaluate: ({ status, body }) => {
      const total = numberValue(body?.total);
      const healthy = status === 200 && body?.healthy === true && total === 0;
      return {
        ok: healthy,
        detail: healthy ? `clean ${numberValue(body?.windowMinutes)}m window` : `HTTP ${status}; total=${total}; last=${stringValue(body?.lastSeenAt) || "unknown"}`,
        fingerprint: `${status}:${Boolean(body?.healthy)}:${total}:${stringValue(body?.lastSeenAt)}`
      };
    }
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
        : `${auditStatus || "missing status"}; requests=${numberValue(body?.requests)}; 5xx=${numberValue(body?.serverErrors)} (${numberValue(body?.serverErrorRatePercent)}%); p75=${numberValue(body?.durationMs?.p75)}ms; p95=${numberValue(body?.durationMs?.p95)}ms; observed-span=${numberValue(body?.observedSpanMinutes)}m; age=${Number.isFinite(ageMinutes) ? ageMinutes.toFixed(1) : "unknown"}m`;
      return {
        ok,
        detail,
        fingerprint: `${status}:${auditStatus}:${fresh}:${numberValue(body?.serverErrorRatePercent)}`
      };
    }
  }),
  checkJsonEndpoint({
    name: "Rolling 24-hour server SLO",
    path: "/_monitor/rolling-slo-audit.json",
    severity: "warning",
    evaluate: ({ status, body }) => {
      const generated = Date.parse(stringValue(body?.generatedAt));
      const cutoff = Date.parse(stringValue(body?.cutoff));
      const coverageEnd = Date.parse(stringValue(body?.logCoverageEnd));
      const fresh = Number.isFinite(generated) && Math.abs(now.getTime() - generated) <= 90 * 60000;
      const exactWindow = numberValue(body?.windowMinutes) === 1440 && Number.isFinite(cutoff) && Math.abs(generated - cutoff - 86400000) <= 1000;
      const coverage = body?.retentionCoversWindowStart === true && Number.isFinite(coverageEnd) && generated - coverageEnd <= 90 * 60000;
      const ok = status === 200 && body?.status === "ok" && fresh && exactWindow && coverage;
      return { ok, detail: `HTTP ${status}; status=${stringValue(body?.status)}; fresh=${fresh}; window-24h=${exactWindow}; retention-covers-start=${body?.retentionCoversWindowStart === true}; coverage=${coverage}; requests=${numberValue(body?.requests)}; 5xx=${numberValue(body?.serverErrors)} (${numberValue(body?.serverErrorRatePercent)}%)`,
        fingerprint: `${status}:${stringValue(body?.status)}:${fresh}:${exactWindow}:${coverage}:${numberValue(body?.serverErrorRatePercent)}` };
    }
  }),
  ...(process.env.MONITOR_FIXED_WINDOW_ENABLED === "true" ? [checkJsonEndpoint({
    name: "Retained beta error-rate window",
    path: "/_monitor/beta-access-audit.json",
    severity: "warning",
    evaluate: ({ status, body }) => {
      const generatedAt = Date.parse(stringValue(body?.generatedAt));
      const ageMinutes = Number.isFinite(generatedAt) ? Math.max(0, (now.getTime() - generatedAt) / 60_000) : Number.POSITIVE_INFINITY;
      const auditStatus = stringValue(body?.status);
      const windowMode = stringValue(body?.windowMode);
      const windowStart = stringValue(body?.windowStart);
      const observedSpanMinutes = numberValue(body?.observedSpanMinutes);
      const retentionCoversWindowStart = body?.retentionCoversWindowStart === true;
      const fresh = ageMinutes <= 90;
      const hasFixedWindow = windowMode === "fixed_start" && Number.isFinite(Date.parse(windowStart));
      const expectedStartConfigured = expectedFixedWindowStart.length > 0;
      const expectedStartValid = expectedStartConfigured && Number.isFinite(Date.parse(expectedFixedWindowStart));
      const exactStartMatches = expectedStartValid && windowStart === expectedFixedWindowStart;
      const minimumSpanConfigured = minimumFixedWindowObservedSpan.configured && minimumFixedWindowObservedSpan.valid;
      const minimumSpanReached = minimumSpanConfigured && observedSpanMinutes >= minimumFixedWindowObservedSpan.value;
      const ok = status === 200 && auditStatus === "ok" && fresh && hasFixedWindow &&
        retentionCoversWindowStart && exactStartMatches && minimumSpanReached;
      const fixedGate = `expected-start=${expectedStartConfigured ? expectedFixedWindowStart : "not configured"} (${exactStartMatches ? "exact" : expectedStartValid ? "mismatch" : "invalid/missing"}); ` +
        `minimum-span=${minimumSpanConfigured ? `${minimumFixedWindowObservedSpan.value}m` : "invalid/missing"} (${minimumSpanReached ? "reached" : "not reached"}); ` +
        `retention-covers-start=${retentionCoversWindowStart}`;
      const detail = status !== 200
        ? `HTTP ${status}`
        : `${auditStatus || "missing status"}; start=${windowStart || "missing"}; requests=${numberValue(body?.requests)}; 5xx=${numberValue(body?.serverErrors)} (${numberValue(body?.serverErrorRatePercent)}%); observed-span=${observedSpanMinutes}m; ${fixedGate}; age=${Number.isFinite(ageMinutes) ? ageMinutes.toFixed(1) : "unknown"}m`;
      return {
        ok,
        detail,
        fingerprint: `${status}:${auditStatus}:${fresh}:${windowMode}:${windowStart}:${retentionCoversWindowStart}:${expectedFixedWindowStart}:${minimumFixedWindowObservedSpan.raw}:${observedSpanMinutes}:${numberValue(body?.serverErrorRatePercent)}`
      };
    }
  })] : [])
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
  const method = String(init.method ?? "GET").toUpperCase();
  const retryableMethod = method === "GET" || method === "HEAD";
  let lastError = null;
  for (let attempt = 1; attempt <= githubMaximumAttempts; attempt += 1) {
    let response;
    try {
      response = await fetch(new URL(path, githubApiUrl), {
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
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (!retryableMethod || attempt === githubMaximumAttempts) throw lastError;
      await delay(githubRetryBaseMs * 2 ** (attempt - 1));
      continue;
    }

    const text = await response.text();
    if (response.ok) return text ? JSON.parse(text) : null;
    lastError = new Error(`GitHub API ${method} ${path} returned ${response.status}: ${text.slice(0, 300)}`);
    if (!retryableMethod || !githubStatusIsRetryable(response.status) || attempt === githubMaximumAttempts) throw lastError;
    await delay(githubRetryBaseMs * 2 ** (attempt - 1));
  }
  throw lastError ?? new Error(`GitHub API ${method} ${path} failed without a response.`);
}

function githubStatusIsRetryable(status) {
  return status === 429 || status >= 500;
}

function delay(milliseconds) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds));
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

function configuredPositiveNumber(value) {
  const raw = stringValue(value).trim();
  if (!raw) return { configured: false, valid: false, value: Number.NaN, raw };
  const parsed = Number(raw);
  return { configured: true, valid: Number.isFinite(parsed) && parsed > 0, value: parsed, raw };
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
