import { PrismaClient } from "@prisma/client";

import { refreshFantasyPlayerPoolSnapshots } from "../src/machete/fantasy-player-pool-snapshots";

async function main() {
  const args = process.argv.slice(2);
  for (let index = 0; index < args.length; index += 2) {
    if (!["--league-id", "--season"].includes(args[index])) throw new Error(`Unknown argument: ${args[index]}`);
    if (args.indexOf(args[index]) !== index) throw new Error(`Duplicate argument: ${args[index]}`);
  }
  const value = (flag: string) => {
    const index = args.indexOf(flag);
    if (index < 0) return undefined;
    const result = args[index + 1];
    if (!result || result.startsWith("--")) throw new Error(`${flag} requires a value`);
    return result;
  };
  const leagueId = value("--league-id");
  const season = value("--season");
  if (season && !leagueId) throw new Error("--season requires --league-id");
  const prisma = new PrismaClient();
  const startedAt = performance.now();
  try {
    const result = await refreshFantasyPlayerPoolSnapshots(prisma, {
      ...(leagueId ? { leagueId: BigInt(leagueId) } : {}),
      ...(season ? { season } : {})
    });
    console.log(JSON.stringify({ ...result, elapsedMs: Math.round(performance.now() - startedAt), memory: process.memoryUsage() }, null, 2));
    if (result.failed.length > 0 || result.scopes === 0) process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
