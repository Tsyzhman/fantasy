import { PrismaClient } from "@prisma/client";

import { leagueSeeds, seasonName } from "../src/lib/leagues/seed-data";
import { seedRules } from "../src/lib/scoring/rules";
import { teamLogoUrlForSlug } from "../src/lib/teams/logo-assets";
import { slugify } from "../src/lib/text";
import { runMacheteEntityMatching } from "../src/providers/fotmob/entity-matcher";
import { syncMacheteFixtures } from "../src/providers/fotmob/sync-fixtures";
import { syncMacheteLeaguePlayerStats } from "../src/providers/fotmob/sync-player-stats";
import { syncMacheteTeams } from "../src/providers/fotmob/sync-teams";

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

  const macheteLeague = await prisma.macheteLeague.upsert({
    where: { providerLeagueId: "championship-2025" },
    update: {
      provider: "FOTMOB",
      name: "Championship",
      country: "England",
      season: "2025/26",
      status: "READY"
    },
    create: {
      provider: "FOTMOB",
      providerLeagueId: "championship-2025",
      name: "Championship",
      country: "England",
      season: "2025/26",
      status: "READY"
    }
  });

  await syncMacheteTeams(prisma, macheteLeague.id);
  await syncMacheteFixtures(prisma, macheteLeague.id);
  await syncMacheteLeaguePlayerStats(prisma, macheteLeague.id);
  await runMacheteEntityMatching(prisma, macheteLeague.id);
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
