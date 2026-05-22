import ExcelJS from "exceljs";

import { ensureDatabaseSchema, prisma } from "@/lib/db";
import { importFantasyPriceWorkbook, parseFantasyPriceWorkbook } from "@/machete/fantasy_price_sheet_import";

type Args = Record<string, string | boolean>;

async function main() {
  await ensureDatabaseSchema();
  const args = parseArgs(process.argv.slice(2));
  const file = stringArg(args.file) ?? stringArg(args.path);
  const leagueIdArg = stringArg(args["league-id"]);
  const requestedSeason = stringArg(args.season);
  const provider = stringArg(args.provider) ?? "SPORTS_RU";

  if (!file || !leagueIdArg || !requestedSeason) {
    console.log("Usage:");
    console.log("  npm exec tsx scripts/import-fantasy-price-sheet.ts -- --file ./prices.xlsx --league-id 47 --season 2025/2026 [--sheet sheetName] [--replace]");
    return;
  }

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(file);

  if (Boolean(args["dry-run"])) {
    const parsed = parseFantasyPriceWorkbook(workbook, {
      sheetName: stringArg(args.sheet)
    });
    console.log(`Parsed ${parsed.rows.length} price rows from "${parsed.sheetName}".`);
    console.table(parsed.rows.slice(0, 12).map((row) => ({
      row: row.rowNumber,
      name: row.playerName,
      team: row.teamName,
      sportsTeam: row.sportsTeamName,
      position: row.position,
      price: row.price
    })));
    return;
  }

  const result = await importFantasyPriceWorkbook(prisma, workbook, {
    leagueId: BigInt(leagueIdArg),
    requestedSeason,
    provider,
    sheetName: stringArg(args.sheet),
    budgetLimit: numberArg(args.budget),
    squadSize: numberArg(args["squad-size"]),
    maxPlayersPerTeam: numberArg(args["max-per-team"]),
    replace: Boolean(args.replace),
    sourceLabel: file
  });

  console.log(`Imported ${result.imported} fantasy prices from "${result.sheetName}" for ${result.leagueName} ${result.season}.`);
  if (result.deleted > 0) console.log(`Deleted ${result.deleted} stale price rows for ${provider} ${result.season}.`);
  console.log(`Mapped ${result.mapped} automatically, reused ${result.manual} manual links, left ${result.unmatched} unmatched.`);
}

function parseArgs(argv: string[]): Args {
  const result: Args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith("--")) continue;
    const key = arg.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      result[key] = true;
      continue;
    }
    result[key] = next;
    index += 1;
  }
  return result;
}

function stringArg(value: string | boolean | undefined) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function numberArg(value: string | boolean | undefined) {
  if (typeof value !== "string") return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
