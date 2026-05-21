// Diagnostic CLI: dump what FotMob returns for a list of match ids and the
// surrounding fixtures-list entries, so duplicates and slug collisions can be
// distinguished from genuine FotMob outages.
//
// Usage:
//   docker compose exec ingestion-browser \
//     npm run fotmob:inspect -- <leagueId> <matchId> [<matchId>...]
//
// Example:
//   npm run fotmob:inspect -- 47 4813374 4813595

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

void main();

async function main(): Promise<void> {
  loadDotEnv();

  const leagueId = process.argv[2];
  const matchIds = process.argv.slice(3);
  if (!leagueId || matchIds.length === 0) {
    console.error("Usage: npm run fotmob:inspect -- <leagueId> <matchId> [<matchId>...]");
    process.exitCode = 1;
    return;
  }

  if (!process.env.MACHETE_FOTMOB_PROVIDER_MODE || process.env.MACHETE_FOTMOB_PROVIDER_MODE === "mock") {
    process.env.MACHETE_FOTMOB_PROVIDER_MODE = "browser";
    console.info("[fotmob:inspect] No provider mode set; defaulting to 'browser'.");
  }

  const outDir = resolve(process.cwd(), "tmp_fotmob_inspect");
  mkdirSync(outDir, { recursive: true });

  const { createFotMobClient } = await import("../src/providers/fotmob/client");
  const { closeFotMobBrowser } = await import("../src/providers/fotmob/browser-manager");

  const client = createFotMobClient();
  // The factory returns the same network seam the production code uses
  // (Mock/Unofficial/Browser/Real). We poke its protected getJson via a cast
  // so the inspector shares the exact transport — Turnstile cookies and all.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const protectedClient = client as any;
  const callGetJson = async (path: string, params: Record<string, string>): Promise<unknown> => {
    if (typeof protectedClient.getJson !== "function") {
      throw new Error("Active FotMob client does not expose a getJson method (mock/real?)");
    }
    return protectedClient.getJson(path, params) as Promise<unknown>;
  };
  const report: Record<string, unknown> = { leagueId, matchIds };

  try {
    console.info(`[fotmob:inspect] Loading fixtures for league ${leagueId}...`);
    const fixtures = await client.getFixtures(leagueId);
    writeFileSync(resolve(outDir, `fixtures-${leagueId}.json`), JSON.stringify(fixtures, null, 2));
    report.fixturesCount = fixtures.length;

    const fixtureSummaries = matchIds.map((id) => {
      const fixture = fixtures.find((f) => f.id === id) ?? null;
      return {
        id,
        listed: !!fixture,
        kickoffAt: fixture?.kickoffAt ?? null,
        homeTeamId: fixture?.homeTeamId ?? null,
        awayTeamId: fixture?.awayTeamId ?? null,
        status: fixture?.status ?? null
      };
    });
    report.fixturesList = fixtureSummaries;
    for (const summary of fixtureSummaries) {
      console.info(
        `[fotmob:inspect] In fixtures list: id=${summary.id} listed=${summary.listed} ` +
          `kickoff=${summary.kickoffAt} home=${summary.homeTeamId} away=${summary.awayTeamId} status=${summary.status}`
      );
    }

    const matchDetails: Array<Record<string, unknown>> = [];
    for (const id of matchIds) {
      console.info(`[fotmob:inspect] Querying /data/match?id=${id}...`);
      const entry: Record<string, unknown> = { id };
      try {
        const summary = await callGetJson("/data/match", { id });
        writeFileSync(resolve(outDir, `summary-${id}.json`), JSON.stringify(summary, null, 2));
        const record = asRecord(summary);
        entry.summaryId = stringValue(record.id);
        entry.summaryLeagueId = stringValue(record.leagueId);
        entry.summaryPageUrl = stringValue(record.pageUrl);
        entry.summaryHome = stringValue(asRecord(record.home).id) ?? stringValue(asRecord(record.home).name);
        entry.summaryAway = stringValue(asRecord(record.away).id) ?? stringValue(asRecord(record.away).name);
        entry.summaryKickoff = stringValue(asRecord(record.status).utcTime) ?? stringValue(record.matchDate);
        entry.summaryFinished = asRecord(record.status).finished === true;
      } catch (error) {
        entry.summaryError = error instanceof Error ? error.message : String(error);
      }

      console.info(`[fotmob:inspect] Querying RAW /data/matchDetails?matchId=${id} (no validation)...`);
      try {
        const raw = await callGetJson("/data/matchDetails", { matchId: id });
        writeFileSync(resolve(outDir, `raw-matchDetails-${id}.json`), JSON.stringify(raw, null, 2));
        const record = asRecord(raw);
        const general = asRecord(record.general);
        const header = asRecord(record.header);
        const content = asRecord(record.content);
        entry.rawDirectId =
          stringValue(general.matchId) ?? stringValue(header.matchId) ?? stringValue(record.matchId) ?? stringValue(record.id) ?? null;
        entry.rawDirectIdMatches = entry.rawDirectId === id;
        entry.rawDirectLeagueId = stringValue(general.leagueId) ?? stringValue(header.leagueId);
        entry.rawDirectKickoff = stringValue(general.matchTimeUTCDate) ?? stringValue(general.matchTimeUTC);
        entry.rawDirectContentKeys = Object.keys(content);
      } catch (error) {
        entry.rawDirectError = error instanceof Error ? error.message : String(error);
      }

      console.info(`[fotmob:inspect] Calling client.getFixtureDetails(${id})...`);
      try {
        const details = await client.getFixtureDetails(id);
        writeFileSync(resolve(outDir, `details-${id}.json`), JSON.stringify(details, null, 2));
        const raw = asRecord(details.raw);
        const general = asRecord(raw.general);
        const header = asRecord(raw.header);
        const content = asRecord(raw.content);
        entry.detailsRequested = id;
        entry.detailsReturnedId =
          stringValue(general.matchId) ?? stringValue(header.matchId) ?? stringValue(raw.matchId) ?? stringValue(raw.id) ?? null;
        entry.detailsContentKeys = Object.keys(content);
        entry.detailsLeagueId = stringValue(general.leagueId) ?? stringValue(header.leagueId);
        entry.detailsKickoff = stringValue(general.matchTimeUTCDate) ?? stringValue(general.matchTimeUTC);
      } catch (error) {
        entry.detailsError = error instanceof Error ? error.message : String(error);
      }

      matchDetails.push(entry);
      console.info(`[fotmob:inspect] ${id} done.`);
    }
    report.matchDetails = matchDetails;

    writeFileSync(resolve(outDir, `report-${leagueId}.json`), JSON.stringify(report, null, 2));
    console.info(`\n[fotmob:inspect] Summary saved to ${resolve(outDir, `report-${leagueId}.json`)}\n`);

    // Pretty-print the comparison so the user sees the key facts on stdout.
    console.info("================= REPORT =================");
    console.info(JSON.stringify(report, null, 2));
    console.info("==========================================");
  } catch (error) {
    console.error("[fotmob:inspect] Fatal:", error instanceof Error ? error.message : error);
    process.exitCode = 1;
  } finally {
    await closeFotMobBrowser();
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function stringValue(value: unknown): string | undefined {
  if (typeof value === "string" && value.length > 0) return value;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return undefined;
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
