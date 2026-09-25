import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { prisma } from "@/lib/db";
import { collectSportsTrends } from "@/server/sports-trends/collector";
import { captureSportsOwnershipSnapshots, pruneSportsOwnershipHistory } from "@/server/sports-trends/ownership";

/**
 * @spec spec://modules/machete/FEAT-006-sports-popularity#contracts
 */
function loadDotEnv() {
  const envPath = resolve(process.cwd(), ".env");
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const equalsIndex = trimmed.indexOf("=");
    if (equalsIndex <= 0) continue;
    const key = trimmed.slice(0, equalsIndex).trim();
    const value = trimmed.slice(equalsIndex + 1).trim().replace(/^['"]|['"]$/g, "");
    if (!(key in process.env)) process.env[key] = value;
  }
}

function stringArgs(prefix: string): string[] {
  const values: string[] = [];
  for (let index = 0; index < process.argv.length; index += 1) {
    const value = process.argv[index];
    if (value === prefix && process.argv[index + 1]) values.push(process.argv[index + 1]!);
  }
  return values;
}

async function main() {
  loadDotEnv();
  const command = process.argv[2] ?? "status";

  if (command === "collect") {
    const result = await collectSportsTrends(prisma, { articleUrls: stringArgs("--url").length > 0 ? stringArgs("--url") : undefined });
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (command === "ownership") {
    const contestIds = stringArgs("--contest");
    const result = await captureSportsOwnershipSnapshots(prisma, { contestIds: contestIds.length > 0 ? contestIds : undefined });
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (command === "prune") {
    const pruned = await pruneSportsOwnershipHistory(prisma);
    console.log(JSON.stringify({ pruned }, null, 2));
    return;
  }

  if (command === "status") {
    const [sources, snapshots] = await Promise.all([
      prisma.sportsTrendSource.groupBy({ by: ["parseStatus"], _count: { _all: true } }),
      prisma.sportsTrendSnapshot.groupBy({ by: ["category", "status"], _count: { _all: true } })
    ]);
    const latest = await prisma.sportsTrendSnapshot.findFirst({ orderBy: { observedAt: "desc" }, select: { observedAt: true, category: true, status: true } });
    console.log(JSON.stringify({ sources, snapshots, latest }, null, 2));
    return;
  }

  throw new Error(`Unknown command ${command}. Use collect | ownership | prune | status.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
