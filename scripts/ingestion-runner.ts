import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { resolve } from "node:path";

type InitialBackfillMode = "current_league_47" | "full";

void main();

async function main() {
  loadDotEnv();

  const { prisma } = await import("../src/lib/db");
  const {
    getIngestionAdminStatus,
    run_incremental_update,
    start_initial_backfill
  } = await import("../src/core_data/ingestion-jobs");
  const { persist_match_payload, reparse_match } = await import("../src/core_data/ingestion");
  const { runIngestionWorkerLoop, runIngestionWorkerTick } = await import("../src/core_data/worker");

  const command = process.argv[2] ?? "status";

  try {
    if (command === "initial-backfill") {
      const mode = parseInitialBackfillMode(process.argv[3]);
      const started = await start_initial_backfill(prisma, { startedByUserId: null, mode });
      console.info(`[ingestion:cli] ${started.started ? "Queued" : "Reusing active"} ${mode} initial backfill job ${started.job.id}.`);
      const result = await runIngestionWorkerTick(prisma);
      console.info(`[ingestion:cli] Finished runner for job ${result.job?.id ?? "none"} with status ${result.job?.status ?? "none"}.`);
    } else if (command === "queue-initial-backfill") {
      const mode = parseInitialBackfillMode(process.argv[3]);
      const started = await start_initial_backfill(prisma, { startedByUserId: null, mode });
      console.info(`[ingestion:cli] ${started.started ? "Queued" : "Reusing active"} ${mode} initial backfill job ${started.job.id}.`);
    } else if (command === "incremental-update") {
      const started = await run_incremental_update(prisma, { startedByUserId: null });
      console.info(`[ingestion:cli] ${started.started ? "Queued" : "Reusing active"} incremental update job ${started.job.id}.`);
      const result = await runIngestionWorkerTick(prisma);
      console.info(`[ingestion:cli] Finished runner for job ${result.job?.id ?? "none"} with status ${result.job?.status ?? "none"}.`);
    } else if (command === "queue-incremental-update") {
      const started = await run_incremental_update(prisma, { startedByUserId: null });
      console.info(`[ingestion:cli] ${started.started ? "Queued" : "Reusing active"} incremental update job ${started.job.id}.`);
    } else if (command === "run-next") {
      const result = await runIngestionWorkerTick(prisma);
      console.info(`[ingestion:cli] ${result.ran ? "Ran" : "No active"} ingestion job ${result.job?.id ?? ""}.`);
    } else if (command === "worker") {
      await runIngestionWorkerLoop(prisma);
    } else if (command === "status") {
      const status = await getIngestionAdminStatus(prisma);
      console.dir(status, { depth: null });
    } else if (command === "reparse-raw") {
      const limit = parsePositiveInt(process.argv[3]);
      const raws = await prisma.rawMatchPayload.findMany({
        select: { matchId: true },
        orderBy: { fetchedAt: "desc" },
        ...(limit ? { take: limit } : {})
      });
      let reparsed = 0;
      let failed = 0;
      for (const raw of raws) {
        try {
          await reparse_match(prisma, raw.matchId);
          reparsed += 1;
          if (reparsed % 100 === 0) console.info(`[ingestion:cli] Reparsed ${reparsed}/${raws.length} raw payloads.`);
        } catch (error) {
          failed += 1;
          console.warn(`[ingestion:cli] Failed to reparse match ${String(raw.matchId)}: ${error instanceof Error ? error.message : "unknown error"}`);
        }
      }
      console.info(`[ingestion:cli] Raw reparse complete. Reparsed=${reparsed}; failed=${failed}.`);
    } else if (command === "import-payloads") {
      const importPath = process.argv[3];
      if (!importPath) throw new Error("Usage: npm run ingestion:import-payloads -- /path/to/payloads");

      const files = collectPayloadFiles(resolve(process.cwd(), importPath));
      let imported = 0;
      let skipped = 0;
      let failed = 0;

      for (const file of files) {
        const candidates = payloadCandidatesFromFile(file);
        if (candidates.length === 0) {
          skipped += 1;
          continue;
        }

        for (const candidate of candidates) {
          const matchId = matchIdFromPayload(candidate);
          if (!matchId || !hasDetailedPayloadContent(candidate)) {
            skipped += 1;
            continue;
          }

          try {
            const result = await persist_match_payload(prisma, candidate, { fetched: false });
            imported += 1;
            console.info(
              `[ingestion:cli] Imported match ${String(result.matchId)} from ${file} (${result.playerStatsParsed} player stats, ${result.shotsParsed} shots).`
            );
          } catch (error) {
            failed += 1;
            console.warn(`[ingestion:cli] Failed to import ${matchId} from ${file}: ${error instanceof Error ? error.message : "unknown error"}`);
          }
        }
      }

      console.info(`[ingestion:cli] Payload import complete. Files=${files.length}; imported=${imported}; skipped=${skipped}; failed=${failed}.`);
    } else {
      throw new Error(
        `Unknown ingestion command "${command}". Use status, queue-initial-backfill, initial-backfill, queue-incremental-update, incremental-update, run-next, worker, reparse-raw, or import-payloads.`
      );
    }
  } catch (error) {
    console.error("[ingestion:cli] Failed.", error);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

function parsePositiveInt(value: string | null | undefined) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function parseInitialBackfillMode(value: string | null | undefined): InitialBackfillMode {
  const normalized = value?.trim().toLowerCase();
  if (!normalized || normalized === "full") return "full";
  if (["current_league_47", "quick", "epl", "league47", "league_47"].includes(normalized)) return "current_league_47";
  throw new Error(`Unknown initial backfill mode "${value}". Use full or current_league_47.`);
}

function collectPayloadFiles(path: string): string[] {
  if (!existsSync(path)) throw new Error(`Payload path does not exist: ${path}`);
  const stat = statSync(path);
  if (stat.isFile()) return isPayloadFile(path) ? [path] : [];
  if (!stat.isDirectory()) return [];

  return readdirSync(path)
    .flatMap((entry) => collectPayloadFiles(resolve(path, entry)))
    .sort();
}

function isPayloadFile(path: string) {
  return /\.(json|har|html?)$/i.test(path);
}

function payloadCandidatesFromFile(path: string): unknown[] {
  const text = readFileSync(path, "utf8");
  if (/\.html?$/i.test(path)) return payloadCandidatesFromHtml(text);

  try {
    return payloadCandidatesFromJson(JSON.parse(text));
  } catch {
    return [];
  }
}

function payloadCandidatesFromHtml(html: string): unknown[] {
  const match = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
  if (!match) return [];
  try {
    return payloadCandidatesFromJson(JSON.parse(match[1]));
  } catch {
    return [];
  }
}

function payloadCandidatesFromJson(value: unknown): unknown[] {
  if (Array.isArray(value)) return value.flatMap(payloadCandidatesFromJson);

  const record = jsonRecord(value);
  if (Object.keys(record).length === 0) return [];

  const rawHarEntries = jsonRecord(record.log).entries;
  const harEntries = Array.isArray(rawHarEntries) ? rawHarEntries : null;
  if (harEntries) return harEntries.flatMap(payloadCandidatesFromHarEntry);

  const pageProps = jsonRecord(jsonRecord(record.props).pageProps);
  if (Object.keys(pageProps).length > 0) {
    const { translations: _translations, ...payload } = pageProps;
    return payloadCandidatesFromJson(payload);
  }

  if (matchIdFromPayload(record) && hasDetailedPayloadContent(record)) return [record];

  return Object.values(record).flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    return payloadCandidatesFromJson(item);
  });
}

function payloadCandidatesFromHarEntry(entry: unknown): unknown[] {
  const record = jsonRecord(entry);
  const requestUrl = stringValue(jsonRecord(record.request).url);
  const response = jsonRecord(record.response);
  const content = jsonRecord(response.content);
  const mimeType = stringValue(content.mimeType) ?? "";
  const rawText = stringValue(content.text);
  if (!rawText || (!requestUrl?.includes("/api/data/matchDetails") && !mimeType.includes("json"))) return [];

  const text = content.encoding === "base64" ? Buffer.from(rawText, "base64").toString("utf8") : rawText;
  try {
    return payloadCandidatesFromJson(JSON.parse(text));
  } catch {
    return [];
  }
}

function matchIdFromPayload(payload: unknown) {
  const record = jsonRecord(payload);
  const general = jsonRecord(record.general);
  const header = jsonRecord(record.header);
  return stringValue(general.matchId) ?? stringValue(header.matchId) ?? stringValue(record.matchId) ?? stringValue(record.id);
}

function hasDetailedPayloadContent(payload: unknown) {
  const content = jsonRecord(jsonRecord(payload).content);
  return ["playerStats", "shotmap", "lineup", "stats", "matchFacts"].some((key) => content[key] !== undefined);
}

function jsonRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function stringValue(value: unknown) {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value === "bigint") return String(value);
  return null;
}

function loadDotEnv() {
  const envPath = resolve(process.cwd(), ".env");
  if (!existsSync(envPath)) return;

  const lines = readFileSync(envPath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const equalsIndex = trimmed.indexOf("=");
    if (equalsIndex <= 0) continue;

    const key = trimmed.slice(0, equalsIndex).trim();
    const value = trimmed
      .slice(equalsIndex + 1)
      .trim()
      .replace(/^['"]|['"]$/g, "");

    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}
