import { prisma } from "@/lib/db";
import { syncFonbetFixtureOdds } from "@/machete/fixture-odds-sync";

async function main() {
  const result = await syncFonbetFixtureOdds(prisma);
  console.info(JSON.stringify(result));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
