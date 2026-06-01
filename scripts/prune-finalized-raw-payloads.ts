import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const args = new Set(process.argv.slice(2));

void main()
  .catch((error) => {
    console.error("[payloads:prune-finalized] Failed.", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

async function main() {
  const rows = await prisma.$queryRaw<Array<{ count: bigint }>>`
    SELECT COUNT(*)::bigint AS count
    FROM raw_match_payloads raw
    INNER JOIN matches m ON m.id = raw.match_id
    WHERE m.finished = true
  `;
  const count = Number(rows[0]?.count ?? 0n);

  if (!args.has("--yes")) {
    console.log(`[payloads:prune-finalized] Dry run: ${count} finalized raw match payload(s) would be deleted. Pass --yes to delete.`);
    return;
  }

  const deleted = await prisma.$executeRaw`
    DELETE FROM raw_match_payloads raw
    USING matches m
    WHERE m.id = raw.match_id
      AND m.finished = true
  `;

  console.log(`[payloads:prune-finalized] Deleted ${deleted} finalized raw match payload(s).`);
}
