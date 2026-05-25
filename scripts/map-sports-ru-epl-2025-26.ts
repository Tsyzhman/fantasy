import fs from "node:fs/promises";
import path from "node:path";

import { PrismaClient } from "@prisma/client";

import { normalizeName } from "@/lib/text";
import { setSportsRuPlayerMapping } from "@/machete/sports_ru_player_mapping";

const prisma = new PrismaClient();
const leagueId = 47n;
const season = "2025/2026";
const provider = "SPORTS_RU";

const apply = process.argv.includes("--apply");

type MapItem = {
  sports: string;
  team: string;
  target: string;
  targetTeam?: string;
};

type ClearItem = {
  sports: string;
  team: string;
  reason: string;
};

const teamNameById = new Map<string, string>([
  ["9825", "Arsenal"],
  ["8456", "Manchester City"],
  ["10260", "Manchester United"],
  ["10252", "Aston Villa"],
  ["8650", "Liverpool"],
  ["8678", "AFC Bournemouth"],
  ["8472", "Sunderland"],
  ["10204", "Brighton & Hove Albion"],
  ["9937", "Brentford"],
  ["8455", "Chelsea"],
  ["9879", "Fulham"],
  ["10261", "Newcastle United"],
  ["8668", "Everton"],
  ["8463", "Leeds United"],
  ["9826", "Crystal Palace"],
  ["10203", "Nottingham Forest"],
  ["8586", "Tottenham Hotspur"],
  ["8654", "West Ham United"],
  ["8191", "Burnley"],
  ["8602", "Wolverhampton Wanderers"]
]);

const teamIdBySportsTeam = new Map<string, string>([
  ["Arsenal", "9825"],
  ["Aston Villa", "10252"],
  ["Bournemouth", "8678"],
  ["AFC Bournemouth", "8678"],
  ["Brentford", "9937"],
  ["Brighton and Hove Albion", "10204"],
  ["Brighton & Hove Albion", "10204"],
  ["Burnley", "8191"],
  ["Chelsea", "8455"],
  ["Crystal Palace", "9826"],
  ["Everton", "8668"],
  ["Fulham", "9879"],
  ["Leeds United", "8463"],
  ["Liverpool", "8650"],
  ["Manchester City", "8456"],
  ["Manchester United", "10260"],
  ["Newcastle United", "10261"],
  ["Nottingham Forest", "10203"],
  ["Sunderland", "8472"],
  ["Tottenham Hotspur", "8586"],
  ["West Ham United", "8654"],
  ["Wolverhampton Wanderers", "8602"]
]);

const mapItems: MapItem[] = [
  { sports: "Эзе", team: "Arsenal", target: "Eberechi Eze" },

  { sports: "Эллиот", team: "Aston Villa", target: "Harvey Elliott" },
  { sports: "Дуглас Луис", team: "Aston Villa", target: "Douglas Luiz" },
  { sports: "Берроуз", team: "Aston Villa", target: "Bradley Burrowes" },
  { sports: "Райт", team: "Aston Villa", target: "James Wright" },

  { sports: "Кристи", team: "Bournemouth", target: "Ryan Christie" },
  { sports: "Кук", team: "Bournemouth", target: "Lewis Cook" },
  { sports: "Брукс", team: "Bournemouth", target: "David Brooks" },
  { sports: "Доук", team: "Bournemouth", target: "Ben Gannon-Doak" },

  { sports: "Гросс", team: "Brighton and Hove Albion", target: "Pascal Groß" },
  { sports: "Мэттью О`Райли", team: "Brighton and Hove Albion", target: "Matthew O'Riley" },
  { sports: "Хауэлл", team: "Brighton and Hove Albion", target: "Harry Howell" },
  { sports: "Стил", team: "Brighton and Hove Albion", target: "Jason Steele" },

  { sports: "Уорд-Проуз", team: "Burnley", target: "James Ward-Prowse" },
  { sports: "Энтони", team: "Burnley", target: "Jaidon Anthony" },
  { sports: "Каллен", team: "Burnley", target: "Josh Cullen" },
  { sports: "Лоран", team: "Burnley", target: "Josh Laurent" },
  { sports: "Межбри", team: "Burnley", target: "Hannibal Mejbri" },
  { sports: "Аджей", team: "Burnley", target: "Enock Agyei" },
  { sports: "Вайсс", team: "Burnley", target: "Max Weiss" },
  { sports: "Уокер", team: "Burnley", target: "Kyle Walker" },
  { sports: "Гладки", team: "Burnley", target: "Vaclav Hladky" },
  { sports: "Уоррелл", team: "Burnley", target: "Joe Worrall" },
  { sports: "Хамфрис", team: "Burnley", target: "Bashir Humphreys" },

  { sports: "Жоао Педро", team: "Chelsea", target: "Joao Pedro" },
  { sports: "Энцо Фернандес", team: "Chelsea", target: "Enzo Fernandez" },
  { sports: "Кайседо", team: "Chelsea", target: "Moises Caicedo" },
  { sports: "Кукурелья", team: "Chelsea", target: "Marc Cucurella" },
  { sports: "Колуилл", team: "Chelsea", target: "Levi Colwill" },
  { sports: "Рис Джеймс", team: "Chelsea", target: "Reece James" },
  { sports: "Гиу", team: "Chelsea", target: "Marc Guiu" },

  { sports: "Ларсен", team: "Crystal Palace", target: "Jørgen Strand Larsen" },
  { sports: "Гессан", team: "Crystal Palace", target: "Evann Guessand" },
  { sports: "Лакруа", team: "Crystal Palace", target: "Maxence Lacroix" },
  { sports: "Дукуре", team: "Crystal Palace", target: "Cheick Oumar Doucoure" },
  { sports: "Уортон", team: "Crystal Palace", target: "Adam Wharton" },
  { sports: "Хьюз", team: "Crystal Palace", target: "Will Hughes" },
  { sports: "Родни", team: "Crystal Palace", target: "Kaden Rodney" },
  { sports: "Клайн", team: "Crystal Palace", target: "Nathaniel Clyne" },
  { sports: "Мэттьюз", team: "Crystal Palace", target: "Remi Matthews" },
  { sports: "Канво", team: "Crystal Palace", target: "Jaydee Canvot" },

  { sports: "Макнил", team: "Everton", target: "Dwight McNeil" },
  { sports: "Дьюзбери-Холл", team: "Everton", target: "Kiernan Dewsbury-Hall" },
  { sports: "Алькарас", team: "Everton", target: "Charly Alcaraz" },
  { sports: "Брэнтуэйт", team: "Everton", target: "Jarrad Branthwaite" },
  { sports: "Рель", team: "Everton", target: "Merlin Rohl" },
  { sports: "Кин", team: "Everton", target: "Michael Keane" },
  { sports: "Коулмэн", team: "Everton", target: "Seamus Coleman" },
  { sports: "Джордж", team: "Everton", target: "Tyrique George" },

  { sports: "Бобб", team: "Fulham", target: "Oscar Bobb" },
  { sports: "Смит-Роу", team: "Fulham", target: "Emile Smith Rowe" },
  { sports: "Хименес", team: "Fulham", target: "Raul Jimenez" },
  { sports: "Басси", team: "Fulham", target: "Calvin Bassey" },
  { sports: "Кастань", team: "Fulham", target: "Timothy Castagne" },
  { sports: "Кэрни", team: "Fulham", target: "Tom Cairney" },
  { sports: "Рид", team: "Fulham", target: "Harrison Reed" },
  { sports: "Куэнка", team: "Fulham", target: "Jorge Cuenca" },
  { sports: "де Маседо", team: "Fulham", target: "Kevin" },

  { sports: "Дэниэл Джеймс", team: "Leeds United", target: "Daniel James" },
  { sports: "Пиру", team: "Leeds United", target: "Joel Piroe" },
  { sports: "Штах", team: "Leeds United", target: "Anton Stach" },
  { sports: "Джастин", team: "Leeds United", target: "James Justin" },
  { sports: "Крю", team: "Leeds United", target: "Charlie Crew" },
  { sports: "Стрейк", team: "Leeds United", target: "Pascal Struijk" },
  { sports: "Байрэм", team: "Leeds United", target: "Sam Byram" },
  { sports: "Кэрнс", team: "Leeds United", target: "Alex Cairns" },
  { sports: "Мелье", team: "Leeds United", target: "Illan Meslier" },

  { sports: "Байчетич", team: "Liverpool", target: "Stefan Bajcetic" },
  { sports: "Рис Уильямс", team: "Liverpool", target: "Rhys Williams" },
  { sports: "Ньони", team: "Liverpool", target: "Trey Nyoni" },

  { sports: "Холанд", team: "Manchester City", target: "Erling Haaland" },
  { sports: "Родри Эрнандес", team: "Manchester City", target: "Rodri" },
  { sports: "Савио", team: "Manchester City", target: "Savinho" },
  { sports: "Льюис", team: "Manchester City", target: "Rico Lewis" },
  { sports: "Нико О`Райли", team: "Manchester City", target: "Nico O'Reilly" },
  { sports: "Стоунз", team: "Manchester City", target: "John Stones" },
  { sports: "Семеньо", team: "Manchester City", target: "Antoine Semenyo" },
  { sports: "Гехи", team: "Manchester City", target: "Marc Guehi" },

  { sports: "Шешко", team: "Manchester United", target: "Benjamin Sesko" },
  { sports: "Майну", team: "Manchester United", target: "Kobbie Mainoo" },
  { sports: "Магуайр", team: "Manchester United", target: "Harry Maguire" },
  { sports: "Шоу", team: "Manchester United", target: "Luke Shaw" },
  { sports: "Оби-Мартин", team: "Manchester United", target: "Chido Obi" },
  { sports: "Флетчер", team: "Manchester United", target: "Tyler Fletcher" },
  { sports: "Хитон", team: "Manchester United", target: "Tom Heaton" },

  { sports: "Джейкоб Мерфи", team: "Newcastle United", target: "Jacob Murphy" },
  { sports: "Джейкоб Рэмзи", team: "Newcastle United", target: "Jacob Ramsey" },
  { sports: "Уиллок", team: "Newcastle United", target: "Joseph Willock" },
  { sports: "Льюис Холл", team: "Newcastle United", target: "Lewis Hall" },
  { sports: "Поуп", team: "Newcastle United", target: "Nick Pope" },
  { sports: "Шер", team: "Newcastle United", target: "Fabian Schar" },
  { sports: "Майли", team: "Newcastle United", target: "Lewis Miley" },
  { sports: "Рэмсдейл", team: "Newcastle United", target: "Aaron Ramsdale" },
  { sports: "Тиав", team: "Newcastle United", target: "Malick Thiaw" },
  { sports: "Нив", team: "Newcastle United", target: "Sean Neave" },
  { sports: "Алекс Мерфи", team: "Newcastle United", target: "Alex Murphy" },
  { sports: "Радди", team: "Newcastle United", target: "John Ruddy" },

  { sports: "Ортега", team: "Nottingham Forest", target: "Stefan Ortega" },
  { sports: "Вуд", team: "Nottingham Forest", target: "Chris Wood" },
  { sports: "Гиббс-Уайт", team: "Nottingham Forest", target: "Morgan Gibbs-White" },
  { sports: "Лукка", team: "Nottingham Forest", target: "Lorenzo Lucca" },
  { sports: "Игор Жезус", team: "Nottingham Forest", target: "Igor Jesus" },
  { sports: "Макати", team: "Nottingham Forest", target: "James McAtee" },
  { sports: "Неко Уильямс", team: "Nottingham Forest", target: "Neco Williams" },
  { sports: "Йейтс", team: "Nottingham Forest", target: "Ryan Yates" },
  { sports: "Савона Николо", team: "Nottingham Forest", target: "Nicolo Savona" },
  { sports: "Жаир Кунья", team: "Nottingham Forest", target: "Jair Cunha" },
  { sports: "Нетц", team: "Nottingham Forest", target: "Luca Netz" },
  { sports: "Джон", team: "Nottingham Forest", target: "John Victor" },

  { sports: "Бробби", team: "Sunderland", target: "Brian Brobbey" },
  { sports: "Джака", team: "Sunderland", target: "Granit Xhaka" },
  { sports: "Мандл", team: "Sunderland", target: "Romaine Mundle" },
  { sports: "Гертрюйда", team: "Sunderland", target: "Lutsharel Geertruida" },
  { sports: "Руфс", team: "Sunderland", target: "Robin Roefs" },
  { sports: "Саймон Мур", team: "Sunderland", target: "Simon Moore" },
  { sports: "Серкин", team: "Sunderland", target: "Dennis Cirkin" },
  { sports: "Хьюм", team: "Sunderland", target: "Trai Hume" },

  { sports: "Симонс Хави", team: "Tottenham Hotspur", target: "Xavi Simons" },
  { sports: "Удоджи", team: "Tottenham Hotspur", target: "Destiny Udogie" },
  { sports: "Спенс", team: "Tottenham Hotspur", target: "Djed Spence" },
  { sports: "Дэвис", team: "Tottenham Hotspur", target: "Ben Davies" },
  { sports: "Остин", team: "Tottenham Hotspur", target: "Brandon Austin" },

  { sports: "Адама Траоре", team: "West Ham United", target: "Adama Traore" },
  { sports: "Скарлз", team: "West Ham United", target: "Oliver Scarles" },

  { sports: "Жоао Гомес", team: "Wolverhampton Wanderers", target: "Joao Gomes" },
  { sports: "Гомес", team: "Wolverhampton Wanderers", target: "Angel Gomes" },
  { sports: "Джонстон", team: "Wolverhampton Wanderers", target: "Sam Johnstone" },
  { sports: "Доэрти", team: "Wolverhampton Wanderers", target: "Matt Doherty" },
  { sports: "Крейчи", team: "Wolverhampton Wanderers", target: "Ladislav Krejci" },
  { sports: "Сантьяго Буэно", team: "Wolverhampton Wanderers", target: "Santiago Bueno" },
  { sports: "Тоте Гомеш", team: "Wolverhampton Wanderers", target: "Toti Gomes" },
  { sports: "Тшатшуа", team: "Wolverhampton Wanderers", target: "Jackson Tchatchoua" },
  { sports: "Уго Буэно", team: "Wolverhampton Wanderers", target: "Hugo Bueno" }
];

const clearItems: ClearItem[] = [
  { sports: "Нето", team: "Bournemouth", reason: "Bournemouth GK row was mapped to Chelsea winger Pedro Neto" },
  { sports: "Дисаси", team: "Chelsea", reason: "duplicate stale Chelsea row; active/current price row exists at West Ham" },
  { sports: "Харрисон", team: "Leeds United", reason: "mapped to Sunderland Harrison Jones" },
  { sports: "Нуньес", team: "Liverpool", reason: "mapped to Brentford Gustavo Nunes" },
  { sports: "Пиллинг", team: "Liverpool", reason: "duplicate/inactive Philip Billing row under Liverpool" },
  { sports: "Ортега", team: "Manchester City", reason: "duplicate stale Manchester City row; active/current row exists at Nottingham Forest" },
  { sports: "Антони", team: "Manchester United", reason: "mapped to Brentford Antoni Milambo" },
  { sports: "Эммануэль Деннис", team: "Nottingham Forest", reason: "mapped to Sunderland Dennis Cirkin" },
  { sports: "Омар Ричардс", team: "Nottingham Forest", reason: "mapped to Crystal Palace Chris Richards" },
  { sports: "Силва", team: "Nottingham Forest", reason: "duplicate loose Silva row mapped to da Silva Moreira; full-name row exists" },
  { sports: "Джозеф Андерсон", team: "Sunderland", reason: "mapped to Nottingham Forest Elliot Anderson" },
  { sports: "Нуке", team: "Sunderland", reason: "Sunderland GK row mapped to defender Luke O'Nien" },
  { sports: "Фабиу Силва", team: "Wolverhampton Wanderers", reason: "mapped to Nottingham Forest Jota Silva" },
  { sports: "Бубакар Траоре", team: "Wolverhampton Wanderers", reason: "mapped to Bournemouth Hamed Traore" }
];

function rowKey(sports: string, team: string) {
  return `${sports}@@${team}`;
}

function bigintJson(_: string, value: unknown) {
  return typeof value === "bigint" ? value.toString() : value;
}

async function main() {
  const plan = await buildPlan();
  printPlan(plan);
  if (plan.errors.length > 0) {
    process.exitCode = 1;
    return;
  }

  if (!apply) return;

  const backupPath = await writeBackup(plan);
  console.log(`Backup written: ${backupPath}`);

  for (const update of plan.teamUpdates) {
    await prisma.coreTeam.update({
      where: { id: BigInt(update.id) },
      data: { name: update.to }
    });
  }

  for (const clear of plan.resolvedClears) {
    await setSportsRuPlayerMapping(prisma, { priceId: clear.priceId, playerId: null });
  }

  for (const mapping of plan.resolvedMaps) {
    await setSportsRuPlayerMapping(prisma, { priceId: mapping.priceId, playerId: BigInt(mapping.targetPlayerId) });
  }

  console.log("Applied mapping updates.");
}

async function buildPlan() {
  assertUnique("map", mapItems.map((item) => rowKey(item.sports, item.team)));
  assertUnique("clear", clearItems.map((item) => rowKey(item.sports, item.team)));

  const activeRoster = await prisma.teamPlayerSeason.findMany({
    where: { leagueId, season, active: true },
    include: { player: true, team: true }
  });
  const rosterByTeam = new Map<string, typeof activeRoster>();
  for (const entry of activeRoster) {
    const key = String(entry.teamId);
    rosterByTeam.set(key, [...(rosterByTeam.get(key) ?? []), entry]);
  }

  const priceRows = await prisma.fantasyPlayerPrice.findMany({
    where: { provider, leagueId, season },
    include: { player: true, team: true }
  });
  const priceByKey = new Map(priceRows.map((price) => [rowKey(price.playerName, price.teamName), price]));

  const errors: string[] = [];
  const resolvedMaps = [];
  for (const item of mapItems) {
    const price = priceByKey.get(rowKey(item.sports, item.team));
    if (!price) {
      errors.push(`price not found: ${item.sports} / ${item.team}`);
      continue;
    }

    const targetTeam = item.targetTeam ?? item.team;
    const teamId = teamIdBySportsTeam.get(targetTeam);
    if (!teamId) {
      errors.push(`team not found for target: ${targetTeam}`);
      continue;
    }

    const candidates = (rosterByTeam.get(teamId) ?? []).filter((entry) => normalizeName(entry.player.name) === normalizeName(item.target));
    if (candidates.length !== 1) {
      errors.push(`target ${item.target} / ${targetTeam} resolved ${candidates.length}: ${candidates.map((entry) => entry.player.name).join(", ")}`);
      continue;
    }

    const target = candidates[0];
    resolvedMaps.push({
      sports: item.sports,
      team: item.team,
      priceId: price.id,
      oldPlayer: price.player?.name ?? null,
      oldPlayerId: price.playerId ? String(price.playerId) : null,
      oldTeamId: price.teamId ? String(price.teamId) : null,
      target: target.player.name,
      targetPlayerId: String(target.playerId),
      targetTeamId: String(target.teamId),
      already: price.playerId === target.playerId && price.teamId === target.teamId
    });
  }

  const resolvedClears = [];
  for (const item of clearItems) {
    const price = priceByKey.get(rowKey(item.sports, item.team));
    if (!price) {
      errors.push(`clear price not found: ${item.sports} / ${item.team}`);
      continue;
    }
    resolvedClears.push({
      sports: item.sports,
      team: item.team,
      priceId: price.id,
      oldPlayer: price.player?.name ?? null,
      oldPlayerId: price.playerId ? String(price.playerId) : null,
      oldTeamId: price.teamId ? String(price.teamId) : null,
      reason: item.reason
    });
  }

  const teamRows = await prisma.coreTeam.findMany({
    where: { id: { in: [...teamNameById.keys()].map((id) => BigInt(id)) } }
  });
  const teamUpdates = teamRows
    .map((team) => {
      const to = teamNameById.get(String(team.id));
      return to && team.name !== to ? { id: String(team.id), from: team.name, to } : null;
    })
    .filter((row): row is { id: string; from: string; to: string } => Boolean(row));

  const affectedPriceIds = [...new Set([...resolvedMaps.map((row) => row.priceId), ...resolvedClears.map((row) => row.priceId)])];
  const affectedMaps = await prisma.providerEntityMap.findMany({
    where: {
      provider,
      providerEntityType: "FANTASY_PLAYER_PRICE",
      providerEntityId: { in: affectedPriceIds },
      internalEntityType: "PLAYER"
    }
  });

  return {
    errors,
    teamUpdates,
    resolvedMaps,
    resolvedClears,
    affectedPriceIds,
    backup: {
      prices: priceRows.filter((row) => affectedPriceIds.includes(row.id)),
      providerMaps: affectedMaps,
      teams: teamRows
    }
  };
}

function printPlan(plan: Awaited<ReturnType<typeof buildPlan>>) {
  console.log(JSON.stringify({
    apply,
    errors: plan.errors,
    teamUpdates: plan.teamUpdates.length,
    mapItems: mapItems.length,
    resolvedMaps: plan.resolvedMaps.length,
    mapsAlreadyCurrent: plan.resolvedMaps.filter((row) => row.already).length,
    mapsToChange: plan.resolvedMaps.filter((row) => !row.already).length,
    clearItems: clearItems.length,
    resolvedClears: plan.resolvedClears.length,
    clearsAlreadyEmpty: plan.resolvedClears.filter((row) => !row.oldPlayerId).length
  }, null, 2));

  if (plan.errors.length > 0) {
    console.log(plan.errors.join("\n"));
    return;
  }

  console.log("MAP_CHANGES");
  for (const row of plan.resolvedMaps.filter((item) => !item.already)) console.log(JSON.stringify(row, bigintJson));

  console.log("CLEARS");
  for (const row of plan.resolvedClears) console.log(JSON.stringify(row, bigintJson));
}

async function writeBackup(plan: Awaited<ReturnType<typeof buildPlan>>) {
  const filename = `sports_ru_epl_mapping_backup_${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
  const backupPath = path.join(process.cwd(), filename);
  await fs.writeFile(backupPath, JSON.stringify(plan.backup, bigintJson, 2), "utf8");
  return backupPath;
}

function assertUnique(label: string, keys: string[]) {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const key of keys) {
    if (seen.has(key)) duplicates.add(key);
    seen.add(key);
  }
  if (duplicates.size > 0) throw new Error(`Duplicate ${label} keys: ${[...duplicates].join(", ")}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
