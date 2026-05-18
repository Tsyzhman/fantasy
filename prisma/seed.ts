import { PrismaClient } from "@prisma/client";

import { leagueSeeds, seasonName } from "../src/lib/leagues/seed-data";
import { seedRules } from "../src/lib/scoring/rules";
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
      await prisma.team.upsert({
        where: {
          leagueId_slug: {
            leagueId: league.id,
            slug: slugify(team.name)
          }
        },
        update: {
          name: team.name,
          aliases: team.aliases ?? []
        },
        create: {
          leagueId: league.id,
          name: team.name,
          slug: slugify(team.name),
          aliases: team.aliases ?? []
        }
      });
    }
  }

  await prisma.fantasyModel.deleteMany({ where: { name: { in: ["MVP Seed Model", "Fantasy 2025/26"] } } });
  await prisma.fantasyModel.updateMany({
    where: { isDefault: true },
    data: { isDefault: false }
  });

  await prisma.fantasyModel.create({
    data: {
      name: "Fantasy 2025/26",
      description: "Position-aware fantasy scoring based on the 2025/26 rules table.",
      isDefault: true,
      isActive: true,
      customFormula: null,
      customFormulaGk: null,
      customFormulaDef: null,
      customFormulaMid: null,
      customFormulaFwd: null,
      customFormulaEnabled: false,
      rules: {
        create: seedRules
      }
    }
  });
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
