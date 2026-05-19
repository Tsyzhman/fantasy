import { PrismaClient } from "@prisma/client";

import { macheteLeagueCatalog } from "../src/lib/leagues/machete-catalog";
import { leagueSeeds, seasonName } from "../src/lib/leagues/seed-data";
import { seedRules } from "../src/lib/scoring/rules";
import { teamLogoUrlForSlug } from "../src/lib/teams/logo-assets";
import { slugify } from "../src/lib/text";

const prisma = new PrismaClient();

async function main() {
  for (const leagueSeed of leagueSeeds) {
    const league = await prisma.league.upsert({
      where: { id: leagueSeed.id },
      update: {
        name: leagueSeed.name,
        country: leagueSeed.country,
        code: leagueSeed.code
      },
      create: {
        id: leagueSeed.id,
        name: leagueSeed.name,
        country: leagueSeed.country,
        code: leagueSeed.code
      }
    });

    await prisma.season.upsert({
      where: {
        leagueId_name: {
          leagueId: league.id,
          name: seasonName
        }
      },
      update: {},
      create: {
        leagueId: league.id,
        name: seasonName
      }
    });

    const currentSlugs = leagueSeed.teams.map((team) => slugify(team.name));
    const staleTeams = await prisma.team.findMany({
      where: {
        leagueId: league.id,
        slug: { notIn: currentSlugs },
        imports: { none: {} },
        snapshots: { none: {} }
      },
      select: { id: true }
    });

    if (staleTeams.length > 0) {
      await prisma.team.deleteMany({
        where: {
          id: { in: staleTeams.map((team) => team.id) }
        }
      });
    }

    for (const team of leagueSeed.teams) {
      const slug = slugify(team.name);
      const logoUrl = teamLogoUrlForSlug(league.id, slug);
      await prisma.team.upsert({
        where: {
          leagueId_slug: {
            leagueId: league.id,
            slug
          }
        },
        update: {
          name: team.name,
          aliases: team.aliases ?? [],
          logoUrl
        },
        create: {
          leagueId: league.id,
          name: team.name,
          slug,
          aliases: team.aliases ?? [],
          logoUrl
        }
      });
    }
  }

  await prisma.fantasyModel.deleteMany({ where: { name: { in: ["MVP Seed Model", "Fantasy 2025/26", "Baltika Fantasy 2025/26", "Machete Fantasy 2025/26"] } } });
  await prisma.fantasyModel.updateMany({
    where: { isDefault: true },
    data: { isDefault: false }
  });

  await prisma.fantasyModel.create({
    data: {
      modelSource: "WYSCOUT",
      name: "Baltika Fantasy 2025/26",
      description: "Position-aware fantasy scoring for Baltika/Wyscout Excel imports.",
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
