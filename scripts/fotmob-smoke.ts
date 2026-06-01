import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

void main();

async function main(): Promise<void> {
  loadDotEnv();

  const args = parseArgs(process.argv.slice(2));
  const leagueId = args.positionals[0] ?? "47";
  const season = args.positionals[1];
  const outDir = resolve(args.outDir ?? resolve(tmpdir(), "fantasy-export-fotmob-smoke"));
  mkdirSync(outDir, { recursive: true });

  if (!process.env.MACHETE_FOTMOB_PROVIDER_MODE || process.env.MACHETE_FOTMOB_PROVIDER_MODE === "mock") {
    process.env.MACHETE_FOTMOB_PROVIDER_MODE = "unofficial";
    console.info("[fotmob:smoke] No provider mode set; defaulting to 'unofficial' for this run.");
  }

  const { createFotMobClient } = await import("../src/providers/fotmob/client");

  const client = createFotMobClient();
  const summary: Record<string, unknown> = { leagueId, season: season ?? null };

  try {
    console.info(`[fotmob:smoke] Fetching league ${leagueId} metadata...`);
    const league = await client.getLeague(leagueId, season);
    writeFileSync(resolve(outDir, `league-${leagueId}.json`), JSON.stringify(league, null, 2));
    summary.league = { id: league.id, name: league.name, season: league.season, country: league.country };
    console.info(`[fotmob:smoke] League OK: ${league.name} / season=${league.season ?? "?"}.`);

    console.info(`[fotmob:smoke] Fetching fixtures for league ${leagueId}...`);
    const fixtures = await client.getFixtures(leagueId, league.season ?? season);
    writeFileSync(resolve(outDir, `fixtures-${leagueId}.json`), JSON.stringify(fixtures, null, 2));
    summary.fixturesTotal = fixtures.length;
    summary.fixturesFinished = fixtures.filter((f) => f.status === "FINISHED").length;
    summary.fixturesScheduled = fixtures.filter((f) => f.status === "SCHEDULED").length;
    console.info(`[fotmob:smoke] Fixtures OK: total=${fixtures.length}, finished=${summary.fixturesFinished}.`);

    const requestedSampleCount = Number(args.positionals[2] || 5);
    const sampleCount = Number.isFinite(requestedSampleCount) ? requestedSampleCount : 5;
    const candidates = fixtures
      .filter((f) => f.status === "FINISHED")
      .sort((a, b) => (b.kickoffAt > a.kickoffAt ? 1 : b.kickoffAt < a.kickoffAt ? -1 : 0))
      .slice(0, sampleCount);

    const sampleResults: Array<Record<string, unknown>> = [];
    let succeeded = 0;
    for (const fixture of candidates) {
      console.info(`[fotmob:smoke] Fetching matchDetails for ${fixture.id} (kickoff ${fixture.kickoffAt})...`);
      try {
        const details = await client.getFixtureDetails(fixture.id);
        writeFileSync(resolve(outDir, `match-${fixture.id}.json`), JSON.stringify(details, null, 2));
        const content = asRecord(asRecord(details.raw).content);
        const record = {
          id: fixture.id,
          ok: true,
          kickoffAt: fixture.kickoffAt,
          contentKeys: Object.keys(content),
          hasPlayerStats: "playerStats" in content,
          hasShotmap: "shotmap" in content,
          hasLineup: "lineup" in content,
          hasMatchFacts: "matchFacts" in content
        };
        sampleResults.push(record);
        succeeded += 1;
        console.info(`[fotmob:smoke] ${fixture.id} OK; content keys: ${record.contentKeys.join(", ")}`);
      } catch (error) {
        sampleResults.push({
          id: fixture.id,
          ok: false,
          kickoffAt: fixture.kickoffAt,
          error: error instanceof Error ? error.message : String(error)
        });
        console.warn(`[fotmob:smoke] ${fixture.id} FAILED: ${error instanceof Error ? error.message : error}`);
      }
    }
    summary.sampleMatches = {
      tried: candidates.length,
      succeeded,
      failed: candidates.length - succeeded,
      results: sampleResults
    };
    if (candidates.length > 0 && succeeded === 0) {
      throw new Error(`All ${candidates.length} sampled matches failed; signed FotMob client is not returning detailed payloads.`);
    }
    if (candidates.length === 0) {
      console.warn("[fotmob:smoke] No finished fixtures available to test matchDetails.");
    } else {
      console.info(`[fotmob:smoke] matchDetails sample: ${succeeded}/${candidates.length} matches returned detailed payloads.`);
    }

    writeFileSync(resolve(outDir, `summary-${leagueId}.json`), JSON.stringify(summary, null, 2));
    console.info(`[fotmob:smoke] Done. Outputs in ${outDir}.`);
  } catch (error) {
    console.error("[fotmob:smoke] Failed:", error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function parseArgs(argv: string[]) {
  const positionals: string[] = [];
  let outDir: string | undefined;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--out-dir") {
      const next = argv[index + 1];
      if (next && !next.startsWith("--")) {
        outDir = next;
        index += 1;
      }
      continue;
    }
    if (arg.startsWith("--out-dir=")) {
      outDir = arg.slice("--out-dir=".length);
      continue;
    }
    positionals.push(arg);
  }

  return { positionals, outDir };
}

function loadDotEnv(): void {
  const envPath = resolve(process.cwd(), ".env");
  if (!existsSync(envPath)) return;
  const lines = readFileSync(envPath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const equalsIndex = trimmed.indexOf("=");
    if (equalsIndex <= 0) continue;
    const key = trimmed.slice(0, equalsIndex).trim();
    const value = trimmed.slice(equalsIndex + 1).trim().replace(/^['"]|['"]$/g, "");
    if (!(key in process.env)) process.env[key] = value;
  }
}
