export type BetaLoadTarget = {
  name: string;
  path: string;
  expectedStatus?: number;
};

export type BetaLoadSample = {
  durationMs: number;
  status: number;
  bytes: number;
};

export type BetaLoadTargetStats = {
  count: number;
  p50Ms: number | null;
  p75Ms: number | null;
  p95Ms: number | null;
  p99Ms: number | null;
  maxMs: number | null;
  averageBytes: number;
  statuses: number[];
};

export type BetaLoadFailure = {
  target: string;
  status?: number;
  error?: string;
};

export type BetaLoadTestConfig = {
  baseUrl: string;
  targets: BetaLoadTarget[];
  concurrency: number;
  durationMs: number;
  timeoutMs: number;
  headers?: Record<string, string>;
  runId?: string;
};

export type BetaLoadTestResult = {
  baseUrl: string;
  concurrency: number;
  requestedDurationMs: number;
  actualDurationMs: number;
  attempts: number;
  failureCount: number;
  errorRate: number;
  targets: Record<string, BetaLoadTargetStats>;
  failureExamples: BetaLoadFailure[];
};

export type BetaLoadGate = {
  maxErrorRateExclusive: number;
  maxP75MsByTarget: Record<string, number>;
};

export type BetaLoadGateResult = {
  passed: boolean;
  violations: string[];
};

type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

export async function runBetaLoadTest(
  config: BetaLoadTestConfig,
  dependencies: { fetch?: FetchLike; now?: () => number } = {}
): Promise<BetaLoadTestResult> {
  const normalized = validateBetaLoadTestConfig(config);
  const fetchRequest = dependencies.fetch ?? fetch;
  const now = dependencies.now ?? Date.now;
  const startedAt = now();
  const stopAt = startedAt + normalized.durationMs;
  const samplesByTarget = new Map(normalized.targets.map((target) => [target.name, [] as BetaLoadSample[]]));
  const failures: BetaLoadFailure[] = [];
  let attempts = 0;
  let requestSequence = 0;

  async function runWorker(workerId: number) {
    let iteration = 0;
    while (now() < stopAt) {
      for (const target of normalized.targets) {
        const sequence = requestSequence++;
        const requestStartedAt = now();
        attempts += 1;

        try {
          const response = await fetchRequest(
            buildBetaLoadUrl(normalized.baseUrl, target.path, `${normalized.runId}-${workerId}-${iteration}-${sequence}`),
            {
              headers: normalized.headers,
              redirect: "manual",
              signal: AbortSignal.timeout(normalized.timeoutMs)
            }
          );
          const bytes = (await response.arrayBuffer()).byteLength;
          const sample: BetaLoadSample = {
            durationMs: Math.max(0, now() - requestStartedAt),
            status: response.status,
            bytes
          };
          samplesByTarget.get(target.name)?.push(sample);

          if (response.status !== (target.expectedStatus ?? 200)) {
            failures.push({ target: target.name, status: response.status });
          }
        } catch (error) {
          failures.push({
            target: target.name,
            error: error instanceof Error ? error.message : String(error)
          });
        }
      }
      iteration += 1;
    }
  }

  await Promise.all(Array.from({ length: normalized.concurrency }, (_, index) => runWorker(index)));

  return {
    baseUrl: normalized.baseUrl,
    concurrency: normalized.concurrency,
    requestedDurationMs: normalized.durationMs,
    actualDurationMs: Math.max(0, now() - startedAt),
    attempts,
    failureCount: failures.length,
    errorRate: attempts === 0 ? 1 : failures.length / attempts,
    targets: Object.fromEntries(
      normalized.targets.map((target) => [target.name, summarizeBetaLoadSamples(samplesByTarget.get(target.name) ?? [])])
    ),
    failureExamples: failures.slice(0, 20)
  };
}

export function validateBetaLoadTestConfig(config: BetaLoadTestConfig): Required<Omit<BetaLoadTestConfig, "headers">> & {
  headers: Record<string, string>;
} {
  const baseUrl = new URL(config.baseUrl);
  if (baseUrl.username || baseUrl.password) {
    throw new Error("The load-test base URL must not contain credentials.");
  }
  if (baseUrl.protocol !== "https:" && !isLoopbackHostname(baseUrl.hostname)) {
    throw new Error("External load-test targets must use HTTPS.");
  }
  if (!Number.isInteger(config.concurrency) || config.concurrency < 1 || config.concurrency > 20) {
    throw new Error("Load-test concurrency must be an integer between 1 and 20.");
  }
  if (!Number.isFinite(config.durationMs) || config.durationMs < 1_000 || config.durationMs > 300_000) {
    throw new Error("Load-test duration must be between 1 and 300 seconds.");
  }
  if (!Number.isFinite(config.timeoutMs) || config.timeoutMs < 100 || config.timeoutMs > 60_000) {
    throw new Error("Load-test request timeout must be between 100 and 60000 milliseconds.");
  }
  if (config.targets.length < 1 || config.targets.length > 5) {
    throw new Error("Load-test target count must be between 1 and 5.");
  }

  const seenNames = new Set<string>();
  const targets = config.targets.map((target) => {
    const name = target.name.trim();
    if (!/^[a-z0-9][a-z0-9_-]*$/i.test(name) || seenNames.has(name)) {
      throw new Error(`Load-test target name is invalid or duplicated: ${target.name}`);
    }
    if (!target.path.startsWith("/")) {
      throw new Error(`Load-test target path must start with /: ${target.path}`);
    }
    seenNames.add(name);
    return { ...target, name };
  });

  return {
    baseUrl: baseUrl.origin,
    targets,
    concurrency: config.concurrency,
    durationMs: config.durationMs,
    timeoutMs: config.timeoutMs,
    headers: { ...(config.headers ?? {}) },
    runId: config.runId?.trim() || `beta-${Date.now()}`
  };
}

export function buildBetaLoadUrl(baseUrl: string, path: string, requestId: string) {
  const url = new URL(path, baseUrl);
  url.searchParams.set("_beta_load", requestId);
  return url;
}

export function summarizeBetaLoadSamples(samples: BetaLoadSample[]): BetaLoadTargetStats {
  const durations = samples.map((sample) => sample.durationMs);
  return {
    count: samples.length,
    p50Ms: nearestRankPercentile(durations, 0.5),
    p75Ms: nearestRankPercentile(durations, 0.75),
    p95Ms: nearestRankPercentile(durations, 0.95),
    p99Ms: nearestRankPercentile(durations, 0.99),
    maxMs: durations.length === 0 ? null : Math.max(...durations),
    averageBytes:
      samples.length === 0 ? 0 : Math.round(samples.reduce((total, sample) => total + sample.bytes, 0) / samples.length),
    statuses: [...new Set(samples.map((sample) => sample.status))].sort((left, right) => left - right)
  };
}

export function nearestRankPercentile(values: number[], percentile: number) {
  if (values.length === 0) return null;
  if (!Number.isFinite(percentile) || percentile <= 0 || percentile > 1) {
    throw new Error("Percentile must be greater than 0 and at most 1.");
  }
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.ceil(sorted.length * percentile) - 1];
}

export function evaluateBetaLoadGate(result: BetaLoadTestResult, gate: BetaLoadGate): BetaLoadGateResult {
  const violations: string[] = [];
  if (result.errorRate >= gate.maxErrorRateExclusive) {
    violations.push(
      `Error rate ${(result.errorRate * 100).toFixed(3)}% must be below ${(gate.maxErrorRateExclusive * 100).toFixed(3)}%.`
    );
  }

  for (const [target, limitMs] of Object.entries(gate.maxP75MsByTarget)) {
    const p75Ms = result.targets[target]?.p75Ms ?? null;
    if (p75Ms === null) {
      violations.push(`Target ${target} has no successful HTTP response samples.`);
    } else if (p75Ms > limitMs) {
      violations.push(`Target ${target} p75 ${p75Ms}ms exceeds ${limitMs}ms.`);
    }
  }

  return { passed: violations.length === 0, violations };
}

function isLoopbackHostname(hostname: string) {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1" || hostname === "[::1]";
}
