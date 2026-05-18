import { PrismaClient } from "@prisma/client";

import { seedRules } from "../src/lib/scoring/rules";
import { slugify } from "../src/lib/text";

const prisma = new PrismaClient();

const teams = [
  { name: "Wrexham", aliases: ["Wrexham AFC", "Wrexham"] },
  { name: "Birmingham City", aliases: ["Birmingham"] },
  { name: "Derby County", aliases: ["Derby"] },
  { name: "Ipswich Town", aliases: ["Ipswich"] },
  { name: "Leicester City", aliases: ["Leicester"] },
  { name: "Norwich City", aliases: ["Norwich"] },
  { name: "Southampton", aliases: ["Southampton FC"] },
  { name: "West Bromwich Albion", aliases: ["West Brom", "WBA"] }
];

async function main() {
  const league = await prisma.league.upsert({
    where: { id: "championship" },
    update: {
      name: "Championship",
      country: "England",
      code: "CHA"
    },
    create: {
      id: "championship",
      name: "Championship",
      country: "England",
      code: "CHA"
    }
  });

  await prisma.season.upsert({
    where: {
      leagueId_name: {
        leagueId: league.id,
        name: "2025/26"
      }
    },
    update: {},
    create: {
      leagueId: league.id,
      name: "2025/26"
    }
  });

  for (const team of teams) {
    await prisma.team.upsert({
      where: {
        leagueId_slug: {
          leagueId: league.id,
          slug: slugify(team.name)
        }
      },
      update: {
        name: team.name,
        aliases: team.aliases
      },
      create: {
        leagueId: league.id,
        name: team.name,
        slug: slugify(team.name),
        aliases: team.aliases
      }
    });
  }

  await prisma.fantasyModel.deleteMany({ where: { name: "MVP Seed Model" } });
  await prisma.fantasyModel.updateMany({
    where: { isDefault: true },
    data: { isDefault: false }
  });

  await prisma.fantasyModel.create({
    data: {
      name: "MVP Seed Model",
      description: "Transparent rule-based starter model for Wyscout imports.",
      isDefault: true,
      isActive: true,
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
