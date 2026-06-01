import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const args = new Set(process.argv.slice(2));

void main()
  .catch((error) => {
    console.error("[payloads:prune-machete] Failed.", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

async function main() {
  const count = await prisma.macheteRawPayload.count();

  if (!args.has("--yes")) {
    console.log(`[payloads:prune-machete] Dry run: ${count} legacy Machete raw payload(s) would be deleted. Pass --yes to delete.`);
    return;
  }

  const deleted = await prisma.macheteRawPayload.deleteMany({});
  console.log(`[payloads:prune-machete] Deleted ${deleted.count} legacy Machete raw payload(s).`);
}
