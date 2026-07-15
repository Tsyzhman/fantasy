import {
  evaluateBetaLoadGate,
  runBetaLoadTest,
  type BetaLoadTarget
} from "../src/performance/beta_load_test";

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const cookie = process.env.BETA_LOAD_COOKIE?.trim();
  const result = await runBetaLoadTest({
    baseUrl: options.baseUrl,
    targets: options.targets,
    concurrency: options.concurrency,
    durationMs: options.durationSeconds * 1_000,
    timeoutMs: options.timeoutMs,
    headers: {
      "user-agent": "fantasy-scout-beta-load-verifier/1.0",
      ...(cookie ? { cookie } : {})
    }
  });
  const gate = evaluateBetaLoadGate(result, {
    maxErrorRateExclusive: options.maxErrorRate,
    maxP75MsByTarget: { [options.primaryTarget]: options.maxPrimaryP75Ms }
  });

  process.stdout.write(
    `${JSON.stringify(
      {
        ...result,
        cookieConfigured: Boolean(cookie),
        gate
      },
      null,
      2
    )}\n`
  );

  if (!gate.passed) process.exitCode = 1;
}

type CliOptions = {
  baseUrl: string;
  targets: BetaLoadTarget[];
  primaryTarget: string;
  concurrency: number;
  durationSeconds: number;
  timeoutMs: number;
  maxErrorRate: number;
  maxPrimaryP75Ms: number;
};

export function parseArguments(args: string[]): CliOptions {
  const targets: BetaLoadTarget[] = [];
  let baseUrl = process.env.BETA_LOAD_BASE_URL?.trim() || "http://127.0.0.1:3000";
  let concurrency = 3;
  let durationSeconds = 30;
  let timeoutMs = 20_000;
  let maxErrorRate = 0.01;
  let maxPrimaryP75Ms = 2_500;
  let requestedPrimaryTarget: string | null = null;

  for (const argument of args) {
    if (argument.startsWith("--base-url=")) {
      baseUrl = argument.slice("--base-url=".length);
    } else if (argument.startsWith("--target=")) {
      targets.push(parseTarget(argument.slice("--target=".length)));
    } else if (argument.startsWith("--primary-target=")) {
      requestedPrimaryTarget = argument.slice("--primary-target=".length);
    } else if (argument.startsWith("--concurrency=")) {
      concurrency = numberArgument(argument, "--concurrency=");
    } else if (argument.startsWith("--duration-seconds=")) {
      durationSeconds = numberArgument(argument, "--duration-seconds=");
    } else if (argument.startsWith("--timeout-ms=")) {
      timeoutMs = numberArgument(argument, "--timeout-ms=");
    } else if (argument.startsWith("--max-error-rate=")) {
      maxErrorRate = numberArgument(argument, "--max-error-rate=");
    } else if (argument.startsWith("--max-primary-p75-ms=")) {
      maxPrimaryP75Ms = numberArgument(argument, "--max-primary-p75-ms=");
    } else {
      throw new Error(`Unknown beta load-test argument: ${argument}`);
    }
  }

  const normalizedTargets = targets.length > 0 ? targets : [{ name: "health", path: "/api/health", expectedStatus: 200 }];
  const primaryTarget = requestedPrimaryTarget ?? normalizedTargets[0].name;
  if (!normalizedTargets.some((target) => target.name === primaryTarget)) {
    throw new Error(`Primary target is not present in --target arguments: ${primaryTarget}`);
  }
  if (!Number.isFinite(maxErrorRate) || maxErrorRate <= 0 || maxErrorRate > 1) {
    throw new Error("--max-error-rate must be greater than 0 and at most 1.");
  }
  if (!Number.isFinite(maxPrimaryP75Ms) || maxPrimaryP75Ms <= 0) {
    throw new Error("--max-primary-p75-ms must be a positive number.");
  }

  return {
    baseUrl,
    targets: normalizedTargets,
    primaryTarget,
    concurrency,
    durationSeconds,
    timeoutMs,
    maxErrorRate,
    maxPrimaryP75Ms
  };
}

function parseTarget(value: string): BetaLoadTarget {
  const separator = value.indexOf("=");
  if (separator <= 0 || separator === value.length - 1) {
    throw new Error(`--target must use name=/path format: ${value}`);
  }
  return {
    name: value.slice(0, separator),
    path: value.slice(separator + 1),
    expectedStatus: 200
  };
}

function numberArgument(argument: string, prefix: string) {
  const value = Number(argument.slice(prefix.length));
  if (!Number.isFinite(value)) throw new Error(`Invalid numeric argument: ${argument}`);
  return value;
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
