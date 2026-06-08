import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const args = new Set(process.argv.slice(2));

void main()
  .catch((error) => {
    console.error("[payloads:audit] Failed.", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

async function main() {
  if (!process.env.DATABASE_URL?.trim()) {
    const report = {
      generatedAt: new Date().toISOString(),
      databaseConfigured: false,
      rawMatchPayloads: emptyStats("raw_match_payloads"),
      macheteRawPayloads: emptyStats('"MacheteRawPayload"')
    };
    if (args.has("--json")) {
      console.log(JSON.stringify(report, null, 2));
    } else {
      console.log("[payloads:audit] DATABASE_URL is not configured; no database audit was run.");
    }
    return;
  }

  const [rawMatchPayloads, macheteRawPayloads] = await Promise.all([auditRawMatchPayloads(), auditMacheteRawPayloads()]);
  const report = {
    generatedAt: new Date().toISOString(),
    databaseConfigured: true,
    rawMatchPayloads,
    macheteRawPayloads
  };

  if (args.has("--json")) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  console.log("[payloads:audit] Raw match payloads:");
  printPayloadStats(rawMatchPayloads);
  console.log("[payloads:audit] Legacy Machete raw payloads:");
  printPayloadStats(macheteRawPayloads);
}

async function auditRawMatchPayloads(): Promise<PayloadStats> {
  const table = "raw_match_payloads";
  if (!(await tableExists(table))) return emptyStats(table);

  const [counts] = await prisma.$queryRaw<
    Array<{
      total: bigint;
      finalized_matches: bigint;
      non_final_matches: bigint;
      oldest_created_at: Date | null;
      newest_created_at: Date | null;
    }>
  >`
    SELECT
      COUNT(*)::bigint AS total,
      COUNT(*) FILTER (WHERE m.finished = true)::bigint AS finalized_matches,
      COUNT(*) FILTER (WHERE m.finished = false OR m.finished IS NULL)::bigint AS non_final_matches,
      MIN(raw.created_at) AS oldest_created_at,
      MAX(raw.created_at) AS newest_created_at
    FROM raw_match_payloads raw
    LEFT JOIN matches m ON m.id = raw.match_id
  `;

  return {
    table,
    exists: true,
    total: Number(counts?.total ?? 0n),
    finalized: Number(counts?.finalized_matches ?? 0n),
    nonFinal: Number(counts?.non_final_matches ?? 0n),
    sizeBytes: await relationSizeBytes(table),
    oldestCreatedAt: counts?.oldest_created_at?.toISOString() ?? null,
    newestCreatedAt: counts?.newest_created_at?.toISOString() ?? null
  };
}

async function auditMacheteRawPayloads(): Promise<PayloadStats> {
  const table = '"MacheteRawPayload"';
  if (!(await tableExists(table))) return emptyStats(table);

  const [counts] = await prisma.$queryRaw<
    Array<{
      total: bigint;
      oldest_created_at: Date | null;
      newest_created_at: Date | null;
    }>
  >`
    SELECT
      COUNT(*)::bigint AS total,
      MIN("createdAt") AS oldest_created_at,
      MAX("createdAt") AS newest_created_at
    FROM "MacheteRawPayload"
  `;

  return {
    table,
    exists: true,
    total: Number(counts?.total ?? 0n),
    finalized: null,
    nonFinal: null,
    sizeBytes: await relationSizeBytes(table),
    oldestCreatedAt: counts?.oldest_created_at?.toISOString() ?? null,
    newestCreatedAt: counts?.newest_created_at?.toISOString() ?? null
  };
}

type PayloadStats = {
  table: string;
  exists: boolean;
  total: number;
  finalized: number | null;
  nonFinal: number | null;
  sizeBytes: number;
  oldestCreatedAt: string | null;
  newestCreatedAt: string | null;
};

async function tableExists(table: string) {
  const rows = await prisma.$queryRaw<Array<{ exists: boolean }>>`SELECT to_regclass(${table}) IS NOT NULL AS exists`;
  return rows[0]?.exists === true;
}

async function relationSizeBytes(table: string) {
  const rows = await prisma.$queryRaw<Array<{ size_bytes: bigint }>>`SELECT pg_total_relation_size(to_regclass(${table}))::bigint AS size_bytes`;
  return Number(rows[0]?.size_bytes ?? 0n);
}

function emptyStats(table: string): PayloadStats {
  return {
    table,
    exists: false,
    total: 0,
    finalized: null,
    nonFinal: null,
    sizeBytes: 0,
    oldestCreatedAt: null,
    newestCreatedAt: null
  };
}

function printPayloadStats(stats: PayloadStats) {
  if (!stats.exists) {
    console.log(`  ${stats.table}: table not found`);
    return;
  }

  console.log(`  ${stats.table}: ${stats.total} row(s), ${formatBytes(stats.sizeBytes)}`);
  if (stats.finalized !== null) console.log(`  finalized match payloads: ${stats.finalized}`);
  if (stats.nonFinal !== null) console.log(`  non-final match payloads: ${stats.nonFinal}`);
  console.log(`  oldest: ${stats.oldestCreatedAt ?? "n/a"}`);
  console.log(`  newest: ${stats.newestCreatedAt ?? "n/a"}`);
}

function formatBytes(value: number) {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  if (value < 1024 * 1024 * 1024) return `${(value / 1024 / 1024).toFixed(1)} MB`;
  return `${(value / 1024 / 1024 / 1024).toFixed(1)} GB`;
}
