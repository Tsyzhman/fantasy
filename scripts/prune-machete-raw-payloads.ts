import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const args = new Set(process.argv.slice(2));
const olderThanDays = positiveIntegerArg("--older-than-days");

void main()
  .catch((error) => {
    console.error("[payloads:prune-machete] Failed.", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

async function main() {
  const cutoff = olderThanDays ? new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000) : null;
  const where = cutoff ? { createdAt: { lt: cutoff } } : {};
  const count = await prisma.macheteRawPayload.count({ where });

  if (!args.has("--yes")) {
    const ageScope = cutoff ? ` older than ${olderThanDays} day(s)` : "";
    console.log(`[payloads:prune-machete] Dry run: ${count} legacy Machete raw payload(s)${ageScope} would be deleted. Pass --yes to delete.`);
    return;
  }

  const deleted = await prisma.macheteRawPayload.deleteMany({ where });
  console.log(`[payloads:prune-machete] Deleted ${deleted.count} legacy Machete raw payload(s).`);
}

function positiveIntegerArg(name: string) {
  const prefix = `${name}=`;
  const raw = process.argv.slice(2).find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
  const value = Number(raw);
  return Number.isInteger(value) && value > 0 ? value : null;
}
