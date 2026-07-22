import { PrismaClient } from "@prisma/client";
import { foontasySyncConfigFromEnv, syncFoontasyForecasts } from "@/machete/foontasy_forecasts";

const prisma = new PrismaClient();

async function main() {
  const result = await syncFoontasyForecasts(prisma, foontasySyncConfigFromEnv());
  console.log(JSON.stringify(result));
}

main().finally(() => prisma.$disconnect());
