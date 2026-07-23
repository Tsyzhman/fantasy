import { prisma } from "@/lib/db";
import { syncMissingFotMobPlayerSeasonArchives } from "@/providers/fotmob/sync-player-season-archives";

async function main() {
  const args = new Map(
    process.argv.slice(2).flatMap((value, index, values) =>
      value.startsWith("--") ? [[value.slice(2), values[index + 1]?.startsWith("--") ? "true" : values[index + 1] ?? "true"]] : []
    )
  );
  const result = await syncMissingFotMobPlayerSeasonArchives(prisma, {
    leagueId: numericBigInt(args.get("league")),
    season: args.get("season"),
    teamId: numericBigInt(args.get("team")),
    force: args.get("force") === "true",
    batchSize: numericInteger(args.get("batch"))
  });
  console.info(JSON.stringify(result));
}

function numericBigInt(value: string | undefined) {
  return value && /^\d+$/.test(value) ? BigInt(value) : undefined;
}

function numericInteger(value: string | undefined) {
  if (!value) return undefined;
  const number = Number(value);
  return Number.isInteger(number) && number >= 0 ? number : undefined;
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
