/** @spec spec://modules/khl/INFRA-001-khl-data-ingestion#operations */
import { Prisma, PrismaClient } from "@prisma/client";
import { refreshHistoricalSeason } from "@/server/khl/historical-season";

// Exact public provider identities revalidated in WI-071; no fuzzy name matching.
const providerPlayerIds = ["2152421", "2191679", "2193482", "2086189", "2172944", "2130947", "2193479", "2190685", "2147765", "2014941", "2032332", "2193096", "2086201", "2134486", "2190682", "2157266"];
const url = new URL(process.env.DATABASE_URL!); url.searchParams.set("connection_limit", "1");
const prisma = new PrismaClient({ datasources: { db: { url: url.toString() } } });
async function main() {
  const contest = await prisma.khlContest.findFirstOrThrow({ where: { provider: "SPORTS_RU", providerContestId: "107", season: { seasonKey: "2026/2027" } }, select: { id: true } });
  const [lock] = await prisma.$queryRaw<Array<{ acquired: boolean }>>`SELECT pg_try_advisory_lock(78102191) AS acquired`;
  if (!lock?.acquired) throw new Error("ARCHIVE_REPAIR_BUSY");
  try {
    const result = await refreshHistoricalSeason(prisma, contest.id, undefined, { providerPlayerIds, retrySelected: true });
    console.info(JSON.stringify({ ...result, providerPlayerIds }));
    if (result.errors.length || result.imported + result.absent !== providerPlayerIds.length) throw new Error("ARCHIVE_REPAIR_INCOMPLETE");
  } finally { await prisma.$executeRaw(Prisma.sql`SELECT pg_advisory_unlock(78102191)`); }
}
main().finally(() => prisma.$disconnect());
