import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const args = new Set(process.argv.slice(2));
const olderThanDays = positiveIntegerArg("--older-than-days");

void main()
  .catch((error) => {
    console.error("[payloads:prune-finalized] Failed.", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

async function main() {
  const cutoff = olderThanDays ? new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000) : null;
  const rows = await prisma.$queryRaw<Array<{ count: bigint }>>`
    SELECT COUNT(*)::bigint AS count
    FROM raw_match_payloads raw
    INNER JOIN matches m ON m.id = raw.match_id
    WHERE m.finished = true
      AND (${cutoff}::timestamp IS NULL OR raw.created_at < ${cutoff})
  `;
  const count = Number(rows[0]?.count ?? 0n);

  if (!args.has("--yes")) {
    const ageScope = cutoff ? ` older than ${olderThanDays} day(s)` : "";
    console.log(`[payloads:prune-finalized] Dry run: ${count} finalized raw match payload(s)${ageScope} would be deleted. Pass --yes to delete.`);
    return;
  }

  const deleted = await prisma.$executeRaw`
    DELETE FROM raw_match_payloads raw
    USING matches m
    WHERE m.id = raw.match_id
      AND m.finished = true
      AND (${cutoff}::timestamp IS NULL OR raw.created_at < ${cutoff})
  `;

  console.log(`[payloads:prune-finalized] Deleted ${deleted} finalized raw match payload(s).`);
}

function positiveIntegerArg(name: string) {
  const prefix = `${name}=`;
  const raw = process.argv.slice(2).find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
  const value = Number(raw);
  return Number.isInteger(value) && value > 0 ? value : null;
}
