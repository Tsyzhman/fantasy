import { PrismaClient } from "@prisma/client";

import { macheteLeagueCatalog } from "../src/lib/leagues/machete-catalog";
import { seasonName } from "../src/lib/leagues/seed-data";
import { seedRules } from "../src/lib/scoring/rules";

const prisma = new PrismaClient();

async function main() {
  await prisma.fantasyModel.deleteMany({ where: { modelSource: "MACHETE", name: "Machete Fantasy 2025/26" } });
  await prisma.fantasyModel.updateMany({
    where: { modelSource: "MACHETE", isDefault: true },
    data: { isDefault: false }
  });

  await prisma.fantasyModel.create({
    data: {
      modelSource: "MACHETE",
      name: "Machete Fantasy 2025/26",
      description: "Position-aware fantasy scoring for Machete/FotMob snapshots.",
      isDefault: true,
      isActive: true,
      customFormula: null,
      customFormulaGk: null,
      customFormulaDef: null,
      customFormulaMid: null,
      customFormulaFwd: null,
      customFormulaEnabled: false,
      scoringFormulaGk: null,
      scoringFormulaDef: null,
      scoringFormulaMid: null,
      scoringFormulaFwd: null,
      scoringFormulaEnabled: false,
      rules: {
        create: seedRules
      }
    }
  });

  await seedMacheteLeagues();
}

async function seedMacheteLeagues() {
  const legacyChampionship = await prisma.macheteLeague.findUnique({
    where: { providerLeagueId: "championship-2025" }
  });
  const numericChampionship = await prisma.macheteLeague.findUnique({
    where: { providerLeagueId: "48" }
  });

  if (legacyChampionship && !numericChampionship) {
    await prisma.macheteLeague.update({
      where: { id: legacyChampionship.id },
      data: {
        providerLeagueId: "48",
        name: "Championship",
        country: "England",
        season: seasonName,
        status: "READY"
      }
    });
  }

  for (const leagueSeed of macheteLeagueCatalog) {
    await prisma.macheteLeague.upsert({
      where: { providerLeagueId: leagueSeed.fotMobLeagueId },
      update: {
        provider: "FOTMOB",
        name: leagueSeed.name,
        country: leagueSeed.country,
        season: seasonName,
        status: "READY"
      },
      create: {
        provider: "FOTMOB",
        providerLeagueId: leagueSeed.fotMobLeagueId,
        name: leagueSeed.name,
        country: leagueSeed.country,
        season: seasonName,
        status: "READY"
      }
    });
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
