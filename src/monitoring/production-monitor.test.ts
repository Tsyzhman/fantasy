import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { resolve } from "node:path";
import test from "node:test";

type CapturedRequest = {
  method: string;
  path: string;
  body: Record<string, unknown> | null;
};

test("production monitor opens a warning issue for a failed data-update gate without failing the workflow", async () => {
  const requests: CapturedRequest[] = [];
  const server = createMonitorServer({ dataHealthy: false, appHealthy: true, requests });
  const origin = await listen(server);

  try {
    const result = await runMonitor(origin);
    assert.equal(result.code, 0, result.stderr);
    const createIssue = requests.find((request) => request.method === "POST" && request.path === "/repos/owner/repo/issues");
    assert.ok(createIssue);
    assert.match(String(createIssue.body?.body), /Data update gate/);
    assert.match(String(createIssue.body?.body), /warnings: \*\*1\*\*/);
  } finally {
    server.close();
  }
});

test("production monitor opens an issue and fails when application health is unavailable", async () => {
  const requests: CapturedRequest[] = [];
  const server = createMonitorServer({ dataHealthy: true, appHealthy: false, requests });
  const origin = await listen(server);

  try {
    const result = await runMonitor(origin);
    assert.equal(result.code, 1, result.stderr);
    const createIssue = requests.find((request) => request.method === "POST" && request.path === "/repos/owner/repo/issues");
    assert.ok(createIssue);
    assert.match(String(createIssue.body?.body), /Critical failures: \*\*1\*\*/);
  } finally {
    server.close();
  }
});

test("production monitor retries transient GitHub API failures before synchronizing the issue", async () => {
  const requests: CapturedRequest[] = [];
  const server = createMonitorServer({ dataHealthy: false, appHealthy: true, requests, githubIssueListFailures: 2 });
  const origin = await listen(server);

  try {
    const result = await runMonitor(origin);
    assert.equal(result.code, 0, result.stderr);
    const issueListRequests = requests.filter((request) => request.method === "GET" && request.path === "/repos/owner/repo/issues");
    assert.equal(issueListRequests.length, 3);
    assert.ok(requests.some((request) => request.method === "POST" && request.path === "/repos/owner/repo/issues"));
  } finally {
    server.close();
  }
});

function createMonitorServer(input: { dataHealthy: boolean; appHealthy: boolean; requests: CapturedRequest[]; githubIssueListFailures?: number }) {
  let githubIssueListFailures = input.githubIssueListFailures ?? 0;
  return createServer(async (request, response) => {
    const body = await readBody(request);
    const path = new URL(request.url ?? "/", "http://127.0.0.1").pathname;
    input.requests.push({ method: request.method ?? "GET", path, body });

    if (path === "/api/health") {
      return json(response, input.appHealthy ? 200 : 503, { status: input.appHealthy ? "ok" : "error" });
    }
    if (path === "/login") return text(response, 200, "login");
    if (path === "/api/health/data-quality") {
      return json(response, input.dataHealthy ? 200 : 503, {
        healthy: input.dataHealthy,
        results: [{
          leagueId: "47",
          season: "2025/2026",
          latestRun: { gatePassed: input.dataHealthy, forecastCoverage: 99, promotionLatencyCoverage: input.dataHealthy ? 100 : 0 }
        }]
      });
    }
    if (path === "/_monitor/access-audit.json") {
      return json(response, 200, {
        status: "ok",
        generatedAt: new Date().toISOString(),
        requests: 100,
        serverErrors: 0,
        serverErrorRatePercent: 0,
        durationMs: { p75: 100, p95: 200 }
      });
    }
    if (path === "/repos/owner/repo/issues" && request.method === "GET") {
      if (githubIssueListFailures > 0) {
        githubIssueListFailures -= 1;
        return text(response, 503, "transient GitHub API failure");
      }
      return json(response, 200, []);
    }
    if (path === "/repos/owner/repo/issues" && request.method === "POST") return json(response, 201, { number: 1 });
    return json(response, 404, { message: "not found" });
  });
}

function runMonitor(origin: string) {
  return new Promise<{ code: number | null; stdout: string; stderr: string }>((resolvePromise, reject) => {
    const child = spawn(process.execPath, [resolve(process.cwd(), "scripts/production-monitor.mjs")], {
      env: {
        ...process.env,
        GITHUB_API_URL: origin,
        GITHUB_REPOSITORY: "owner/repo",
        GITHUB_TOKEN: "test-token",
        MONITOR_BASE_URL: origin,
        MONITOR_TIMEOUT_MS: "2000",
        MONITOR_GITHUB_RETRY_BASE_MS: "1"
      },
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += String(chunk); });
    child.stderr.on("data", (chunk) => { stderr += String(chunk); });
    child.on("error", reject);
    child.on("close", (code) => resolvePromise({ code, stdout, stderr }));
  });
}

function listen(server: ReturnType<typeof createServer>) {
  return new Promise<string>((resolvePromise, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") return reject(new Error("Expected TCP server address."));
      resolvePromise(`http://127.0.0.1:${address.port}`);
    });
  });
}

async function readBody(request: IncomingMessage) {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk));
  if (chunks.length === 0) return null;
  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<string, unknown>;
}

function json(response: ServerResponse, status: number, body: unknown) {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(body));
}

function text(response: ServerResponse, status: number, body: string) {
  response.writeHead(status, { "content-type": "text/plain" });
  response.end(body);
}
