import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

void main();

async function main(): Promise<void> {
  loadDotEnv();

  const leagueId = process.argv[2] ?? "47";
  const season = process.argv[3];
  const outDir = resolve(process.cwd(), "tmp_fotmob_smoke");
  mkdirSync(outDir, { recursive: true });

  if (!process.env.MACHETE_FOTMOB_PROVIDER_MODE || process.env.MACHETE_FOTMOB_PROVIDER_MODE === "mock") {
    process.env.MACHETE_FOTMOB_PROVIDER_MODE = "browser";
    console.info("[fotmob:smoke] No provider mode set; defaulting to 'browser' for this run.");
  }

  const { createFotMobClient } = await import("../src/providers/fotmob/client");
  const { closeFotMobBrowser } = await import("../src/providers/fotmob/browser-manager");

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

    const finishedFixture = fixtures.find((f) => f.status === "FINISHED");
    if (finishedFixture) {
      console.info(`[fotmob:smoke] Fetching matchDetails for ${finishedFixture.id}...`);
      const details = await client.getFixtureDetails(finishedFixture.id);
      writeFileSync(resolve(outDir, `match-${finishedFixture.id}.json`), JSON.stringify(details, null, 2));
      const content = asRecord(asRecord(details.raw).content);
      summary.sampleMatch = {
        id: finishedFixture.id,
        hasContent: Object.keys(content).length > 0,
        contentKeys: Object.keys(content),
        hasPlayerStats: "playerStats" in content,
        hasShotmap: "shotmap" in content,
        hasLineup: "lineup" in content,
        hasMatchFacts: "matchFacts" in content
      };
      console.info("[fotmob:smoke] matchDetails OK; content keys:", Object.keys(content).join(", "));
    } else {
      summary.sampleMatch = null;
      console.warn("[fotmob:smoke] No finished fixtures available to test matchDetails.");
    }

    writeFileSync(resolve(outDir, `summary-${leagueId}.json`), JSON.stringify(summary, null, 2));
    console.info(`[fotmob:smoke] Done. Outputs in ${outDir}.`);
  } catch (error) {
    console.error("[fotmob:smoke] Failed:", error instanceof Error ? error.message : error);
    process.exitCode = 1;
  } finally {
    await closeFotMobBrowser();
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
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
