import { normalizeName } from "@/lib/text";

export type SportsRuCalendarFixture = {
  roundNumber: number;
  kickoffAt: Date | null;
  homeTeamName: string;
  awayTeamName: string;
  homeScore: number | null;
  awayScore: number | null;
  sourceUrl: string;
};

export type SportsRuCalendarSource = {
  fantasyUrl: string;
  calendarUrl: string;
  teamAliases: Record<string, string>;
};

const sourceByLeagueId: Record<string, SportsRuCalendarSource> = {
  "premier-league": {
    fantasyUrl: "https://www.sports.ru/fantasy/football/england/",
    calendarUrl: "https://www.sports.ru/football/tournament/premier-league/calendar/",
    teamAliases: {
      "Арсенал": "Arsenal",
      "Астон Вилла": "Aston Villa",
      "Борнмут": "Bournemouth",
      "Брентфорд": "Brentford",
      "Брайтон": "Brighton & Hove Albion",
      "Бернли": "Burnley",
      "Челси": "Chelsea",
      "Кристал Пэлас": "Crystal Palace",
      "Эвертон": "Everton",
      "Фулхэм": "Fulham",
      "Лидс": "Leeds United",
      "Ливерпуль": "Liverpool",
      "Манчестер Сити": "Manchester City",
      "Манчестер Юнайтед": "Manchester United",
      "Ньюкасл": "Newcastle United",
      "Ноттингем Форест": "Nottingham Forest",
      "Сандерленд": "Sunderland",
      "Тоттенхэм": "Tottenham Hotspur",
      "Вест Хэм": "West Ham United",
      "Вулверхэмптон": "Wolverhampton Wanderers"
    }
  },
  championship: {
    fantasyUrl: "https://www.sports.ru/fantasy/football/england-championship/",
    calendarUrl: "https://www.sports.ru/football/tournament/efl-championship/calendar/",
    teamAliases: {}
  },
  bundesliga: {
    fantasyUrl: "https://www.sports.ru/fantasy/football/germany/",
    calendarUrl: "https://www.sports.ru/football/tournament/bundesliga/calendar/",
    teamAliases: {
      "Бавария": "Bayern Munich",
      "Байер": "Bayer Leverkusen",
      "Боруссия Д": "Borussia Dortmund",
      "Боруссия М": "Borussia Monchengladbach",
      "РБ Лейпциг": "RB Leipzig",
      "Айнтрахт Ф": "Eintracht Frankfurt",
      "Фрайбург": "Freiburg",
      "Вердер": "Werder Bremen",
      "Вольфсбург": "Wolfsburg",
      "Майнц": "Mainz 05",
      "Хоффенхайм": "Hoffenheim",
      "Аугсбург": "Augsburg",
      "Штутгарт": "Stuttgart",
      "Унион Берлин": "Union Berlin",
      "Санкт-Паули": "St. Pauli",
      "Гамбург": "Hamburger SV",
      "Хайденхайм": "Heidenheim",
      "Кельн": "Koln"
    }
  },
  "ligue-1": {
    fantasyUrl: "https://www.sports.ru/fantasy/football/france/",
    calendarUrl: "https://www.sports.ru/football/tournament/ligue-1/calendar/",
    teamAliases: {
      "ПСЖ": "Paris Saint-Germain",
      "Марсель": "Marseille",
      "Лион": "Lyon",
      "Монако": "Monaco",
      "Лилль": "Lille",
      "Ницца": "Nice",
      "Ренн": "Rennes",
      "Ланс": "Lens",
      "Страсбур": "Strasbourg",
      "Тулуза": "Toulouse",
      "Нант": "Nantes",
      "Брест": "Brest",
      "Мец": "Metz",
      "Лорьян": "Lorient",
      "Осер": "Auxerre",
      "Анже": "Angers",
      "Гавр": "Le Havre",
      "Париж": "Paris FC"
    }
  },
  "serie-a": {
    fantasyUrl: "https://www.sports.ru/fantasy/football/italy/",
    calendarUrl: "https://www.sports.ru/football/tournament/seria-a/calendar/",
    teamAliases: {
      "Милан": "AC Milan",
      "Интер": "Inter Milan",
      "Ювентус": "Juventus",
      "Наполи": "Napoli",
      "Рома": "Roma",
      "Лацио": "Lazio",
      "Аталанта": "Atalanta",
      "Болонья": "Bologna",
      "Фиорентина": "Fiorentina",
      "Торино": "Torino",
      "Удинезе": "Udinese",
      "Дженоа": "Genoa",
      "Лечче": "Lecce",
      "Парма": "Parma",
      "Кальяри": "Cagliari",
      "Сассуоло": "Sassuolo",
      "Верона": "Hellas Verona",
      "Пиза": "Pisa",
      "Комо": "Como",
      "Кремонезе": "Cremonese"
    }
  },
  "la-liga": {
    fantasyUrl: "https://www.sports.ru/fantasy/football/spain/",
    calendarUrl: "https://www.sports.ru/football/tournament/la-liga/calendar/",
    teamAliases: {
      "Реал Мадрид": "Real Madrid",
      "Барселона": "Barcelona",
      "Атлетико": "Atletico Madrid",
      "Атлетик": "Athletic Bilbao",
      "Вильярреал": "Villarreal",
      "Реал Сосьедад": "Real Sociedad",
      "Бетис": "Real Betis",
      "Севилья": "Sevilla",
      "Валенсия": "Valencia",
      "Жирона": "Girona",
      "Сельта": "Celta Vigo",
      "Осасуна": "Osasuna",
      "Райо Вальекано": "Rayo Vallecano",
      "Мальорка": "Mallorca",
      "Хетафе": "Getafe",
      "Эспаньол": "Espanyol",
      "Леванте": "Levante",
      "Эльче": "Elche",
      "Алавес": "Alaves",
      "Овьедо": "Real Oviedo"
    }
  },
  "russian-premier-league": {
    fantasyUrl: "https://www.sports.ru/fantasy/football/russia/",
    calendarUrl: "https://www.sports.ru/football/tournament/rfpl/calendar/",
    teamAliases: {
      "Ахмат": "Akhmat Grozny",
      "Акрон": "Akron Tolyatti",
      "Балтика": "Baltika Kaliningrad",
      "ЦСКА": "CSKA Moscow",
      "Динамо Махачкала": "Dynamo Makhachkala",
      "Динамо Москва": "Dynamo Moscow",
      "Краснодар": "Krasnodar",
      "Крылья Советов": "Krylia Sovetov Samara",
      "Локомотив": "Lokomotiv Moscow",
      "Оренбург": "Orenburg",
      "Пари НН": "Pari Nizhny Novgorod",
      "Ростов": "Rostov",
      "Рубин": "Rubin Kazan",
      "Сочи": "Sochi",
      "Спартак": "Spartak Moscow",
      "Зенит": "Zenit Saint Petersburg"
    }
  }
};

export function getSportsRuCalendarSource(leagueId: string) {
  return sourceByLeagueId[leagueId] ?? null;
}

export async function fetchSportsRuCalendarFixtures(source: SportsRuCalendarSource) {
  const firstPage = await fetchText(source.calendarUrl);
  const monthUrls = findSeasonMonthUrls(source.calendarUrl, firstPage);
  const pages = await Promise.all(monthUrls.map((url) => fetchText(url).then((html) => ({ url, html }))));
  const fixtures = pages.flatMap(({ url, html }) => parseSportsRuCalendarPage(html, url, source.teamAliases));

  return dedupeFixtures(fixtures).sort((left, right) => {
    const leftDate = left.kickoffAt?.getTime() ?? 0;
    const rightDate = right.kickoffAt?.getTime() ?? 0;
    return left.roundNumber - right.roundNumber || leftDate - rightDate || left.homeTeamName.localeCompare(right.homeTeamName);
  });
}

async function fetchText(url: string) {
  const response = await fetch(url, {
    headers: {
      "user-agent": "fantasy-export/1.0 (+sports.ru fantasy schedule sync)"
    }
  });

  if (!response.ok) {
    throw new Error(`Sports.ru calendar request failed: ${response.status} ${response.statusText}`);
  }

  return response.text();
}

function findSeasonMonthUrls(baseUrl: string, html: string) {
  const urls = new Set<string>([baseUrl]);
  for (const match of html.matchAll(/href="([^"]*\/calendar\/\?s=\d+&m=\d+)"/g)) {
    urls.add(new URL(match[1].replace(/&amp;/g, "&"), baseUrl).toString());
  }
  return Array.from(urls);
}

function parseSportsRuCalendarPage(html: string, sourceUrl: string, teamAliases: Record<string, string>) {
  const fixtures: SportsRuCalendarFixture[] = [];
  const roundRegex = /<h3[^>]*>\s*(\d+)\s*тур\s*<\/h3>\s*<div class="stat mB15">\s*<table[\s\S]*?<tbody>([\s\S]*?)<\/tbody>/gi;
  let roundMatch: RegExpExecArray | null;

  while ((roundMatch = roundRegex.exec(html))) {
    const roundNumber = Number(roundMatch[1]);
    const tbody = roundMatch[2];

    for (const rowMatch of tbody.matchAll(/<tr>([\s\S]*?)<\/tr>/gi)) {
      const row = rowMatch[1];
      const cells = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((cell) => cell[1]);
      if (cells.length < 4) continue;

      const dateText = stripHtml(cells[0]).replace(/\s+/g, " ").trim();
      const homeTeamName = canonicalTeamName(firstTeamTitle(cells[1]), teamAliases);
      const awayTeamName = canonicalTeamName(firstTeamTitle(cells[3]), teamAliases);
      if (!homeTeamName || !awayTeamName) continue;

      const score = parseScore(stripHtml(cells[2]));
      fixtures.push({
        roundNumber,
        kickoffAt: parseSportsRuDate(dateText),
        homeTeamName,
        awayTeamName,
        homeScore: score?.home ?? null,
        awayScore: score?.away ?? null,
        sourceUrl
      });
    }
  }

  return fixtures;
}

function firstTeamTitle(cellHtml: string) {
  const title = cellHtml.match(/<a[^>]*class="player"[^>]*title="([^"]+)"/i)?.[1];
  return decodeHtml(title ?? stripHtml(cellHtml)).trim();
}

function canonicalTeamName(value: string, teamAliases: Record<string, string>) {
  return teamAliases[value] ?? value;
}

function parseScore(value: string) {
  const match = value.match(/(\d+)\s*:\s*(\d+)/);
  if (!match) return null;
  return {
    home: Number(match[1]),
    away: Number(match[2])
  };
}

function parseSportsRuDate(value: string) {
  const match = value.match(/(\d{2})\.(\d{2})\.(\d{4})(?:\s*\|\s*(\d{2}):(\d{2}))?/);
  if (!match) return null;
  const day = Number(match[1]);
  const month = Number(match[2]) - 1;
  const year = Number(match[3]);
  const hour = Number(match[4] ?? "0");
  const minute = Number(match[5] ?? "0");
  return new Date(Date.UTC(year, month, day, hour, minute));
}

function stripHtml(value: string) {
  return decodeHtml(value.replace(/<[^>]+>/g, " "));
}

function decodeHtml(value: string) {
  return value
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&laquo;|&raquo;/g, "\"")
    .replace(/\s+/g, " ")
    .trim();
}

function dedupeFixtures(fixtures: SportsRuCalendarFixture[]) {
  const seen = new Set<string>();
  return fixtures.filter((fixture) => {
    const key = [
      fixture.roundNumber,
      fixture.kickoffAt?.toISOString().slice(0, 10) ?? "",
      normalizeName(fixture.homeTeamName),
      normalizeName(fixture.awayTeamName)
    ].join("|");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
