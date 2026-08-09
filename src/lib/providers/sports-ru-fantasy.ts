import { normalizeName } from "@/lib/text";

export type SportsRuFantasyTournamentLink = {
  name: string;
  href: string;
  deadline: string | null;
  members: number | null;
};

export type SportsRuFantasyContestRules = {
  name: string;
  budgetLimit: number;
  squadSize: number;
  maxPlayersPerTeam: number | null;
};

export type SportsRuFantasyPriceRow = {
  providerPlayerId?: string | null;
  providerStatPlayerId?: string | null;
  providerBirthDate?: string | null;
  playerName: string;
  providerCanonicalName?: string | null;
  normalizedName: string;
  teamName?: string | null;
  position: string | null;
  price: number;
  sourceKind: string;
  sourceRowIndex: number;
};

export type SportsRuFantasyGraphqlSnapshot = {
  tournamentHru: string;
  seasonId: string | null;
  tours: SportsRuFantasyTour[];
  prices: SportsRuFantasyPriceRow[];
  fetchedAt: string;
};

export type SportsRuFantasyTour = {
  id: string;
  name: string;
  status: string | null;
  startedAt: string | null;
  finishedAt: string | null;
};

export type SportsRuPublishedSquadPlayer = {
  providerPlayerId: string;
  name: string;
  teamName: string | null;
  role: string | null;
  price: number | null;
  isStarter: boolean;
  isCaptain: boolean;
  isViceCaptain: boolean;
  substitutePriority: number | null;
};

export type SportsRuPublishedSquad = {
  providerSquadId: string;
  squadName: string;
  seasonId: string;
  tournamentHru: string;
  tournamentName: string;
  tourId: string;
  tourName: string;
  tourFinishedAt: string | null;
  totalPrice: number;
  currentBalance: number;
  players: SportsRuPublishedSquadPlayer[];
};

const defaultBudget = 100;
const defaultSquadSize = 15;
const sportsRuFantasyGraphqlEndpoint = "https://www.sports.ru/gql/graphql/";
const sportsRuFantasyRequestTimeoutMs = 15_000;
const sportsRuFantasyRoles = [
  ["GOALKEEPER", "GK"],
  ["DEFENDER", "DEF"],
  ["MIDFIELDER", "MID"],
  ["FORWARD", "FWD"]
] as const;

// Sports.ru currently publishes Eredivisie season-player 68274 with Hakeem
// Agboluaje's display name. It is a separate Feyenoord midfielder: Arman
// Nahany. Correct the provider typo before the normalized-name uniqueness key
// is applied, otherwise his row overwrites Hakeem's defender price.
const sportsRuFantasyPlayerNameCorrections: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  netherlands: {
    "68274": "Арман Нахани"
  }
};

export async function fetchSportsRuFantasyGraphqlSnapshot(
  tournamentHru: string,
  options: {
    endpoint?: string;
    fetchImpl?: typeof fetch;
    pageSize?: number;
  } = {}
): Promise<SportsRuFantasyGraphqlSnapshot> {
  const hru = tournamentHru.trim();
  if (!hru || !/^[a-z0-9-]+$/i.test(hru)) throw new Error(`Invalid Sports.ru tournament HRU: ${tournamentHru}.`);
  const fetchImpl = options.fetchImpl ?? fetch;
  const endpoint = options.endpoint ?? sportsRuFantasyGraphqlEndpoint;
  const pageSize = Number.isInteger(options.pageSize) && (options.pageSize ?? 0) > 0 ? options.pageSize! : 100;
  const seasonResponse = await sportsRuGraphqlRequest<{
    fantasyQueries?: {
      tournament?: {
        currentSeason?: {
          id?: string | null;
          tours?: Array<{
            id?: string | null;
            name?: string | null;
            status?: string | null;
            startedAt?: string | null;
            finishedAt?: string | null;
          }> | null;
        } | null;
      } | null;
    };
  }>(
    endpoint,
    `{
      fantasyQueries {
        tournament(id: ${JSON.stringify(hru)}, source: HRU) {
          currentSeason {
            id
            tours { id name status startedAt finishedAt }
          }
        }
      }
    }`,
    fetchImpl
  );
  const currentSeason = seasonResponse.fantasyQueries?.tournament?.currentSeason;
  const seasonId = currentSeason?.id?.trim() || null;
  const tours = (currentSeason?.tours ?? []).flatMap((tour): SportsRuFantasyTour[] => {
    const id = tour.id?.trim();
    const name = cleanText(tour.name ?? "");
    return id && name ? [{
      id,
      name,
      status: cleanText(tour.status ?? "") || null,
      startedAt: tour.startedAt ?? null,
      finishedAt: tour.finishedAt ?? null
    }] : [];
  });
  if (!seasonId) return { tournamentHru: hru, seasonId: null, tours: [], prices: [], fetchedAt: new Date().toISOString() };

  const prices: SportsRuFantasyPriceRow[] = [];
  const seenPlayerIds = new Set<string>();
  for (const [role, position] of sportsRuFantasyRoles) {
    for (let pageNum = 1; pageNum <= 100; pageNum += 1) {
      const response = await sportsRuGraphqlRequest<{
        fantasyQueries?: {
          players?: {
            list?: Array<{
              id?: string | null;
              name?: string | null;
              price?: number | null;
              team?: { id?: string | null; name?: string | null } | null;
              statObject?: {
                id?: string | null;
                name?: string | null;
                firstName?: string | null;
                lastName?: string | null;
                coalesceName?: string | null;
                dateOfBirth?: string | null;
              } | null;
            }> | null;
          } | null;
        };
      }>(
        endpoint,
        `{
          fantasyQueries {
            players(input: {
              seasonID: ${JSON.stringify(seasonId)},
              pageSize: ${pageSize},
              pageNum: ${pageNum},
              sortOrder: DESC,
              sortType: BY_PRICE,
              role: ${role}
            }) {
              list { id name price team { id name } statObject { id name firstName lastName coalesceName dateOfBirth } }
            }
          }
        }`,
        fetchImpl
      );
      const players = response.fantasyQueries?.players?.list ?? [];
      for (const player of players) {
        const providerPlayerId = player.id?.trim();
        const correctedPlayerName = providerPlayerId
          ? sportsRuFantasyPlayerNameCorrections[hru]?.[providerPlayerId]
          : null;
        const playerName = correctedPlayerName ?? sportsRuFantasyDisplayName(player);
        const price = Number(player.price);
        if (!providerPlayerId || seenPlayerIds.has(providerPlayerId) || !playerName || !Number.isFinite(price)) continue;
        seenPlayerIds.add(providerPlayerId);
        prices.push({
          providerPlayerId,
          providerStatPlayerId: cleanText(player.statObject?.id ?? "") || null,
          providerBirthDate: sportsRuDateOnly(player.statObject?.dateOfBirth),
          playerName,
          providerCanonicalName:
            cleanText(player.statObject?.coalesceName ?? "")
            || sportsRuStatPlayerName(player.statObject?.id)
            || null,
          normalizedName: normalizeSportsRuPlayerName(playerName),
          teamName: cleanText(player.team?.name ?? "") || null,
          position,
          price,
          sourceKind: correctedPlayerName ? "graphql-current-season-corrected" : "graphql-current-season",
          sourceRowIndex: prices.length
        });
      }
      if (players.length < pageSize) break;
    }
  }

  return {
    tournamentHru: hru,
    seasonId,
    tours,
    prices,
    fetchedAt: new Date().toISOString()
  };
}

function sportsRuDateOnly(value: string | null | undefined) {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value?.trim() ?? "");
  if (!match || Number(match[1]) < 1900) return null;
  return `${match[1]}-${match[2]}-${match[3]}`;
}

function sportsRuStatPlayerName(value: string | null | undefined) {
  const normalized = value?.trim().replace(/[_-]+/g, " ").replace(/\s+/g, " ") ?? "";
  return /[a-z]/i.test(normalized) ? normalized : "";
}

function sportsRuFantasyDisplayName(player: {
  name?: string | null;
  statObject?: { name?: string | null; firstName?: string | null; lastName?: string | null } | null;
}) {
  const firstName = cleanText(player.statObject?.firstName ?? "");
  const lastName = cleanText(player.statObject?.lastName ?? "");
  // Sports.ru uses an empty firstName plus the public mononym in lastName for
  // players such as Wendel. Its season-player name may contain an unwanted
  // legal surname ("Вендел Вале"), while the fantasy UI shows "Вендел".
  if (!firstName && lastName) return lastName;
  return cleanText(player.name || player.statObject?.name || [firstName, lastName].filter(Boolean).join(" "));
}

export function normalizeSportsRuProfileId(value: string) {
  const normalized = value.trim();
  if (/^\d{1,20}$/.test(normalized)) return normalized;
  try {
    const url = new URL(normalized);
    if (url.hostname !== "sports.ru" && url.hostname !== "www.sports.ru") return null;
    const match = url.pathname.match(/^\/profile\/(\d{1,20})(?:\/|$)/);
    return match?.[1] ?? null;
  } catch {
    return null;
  }
}

export async function fetchSportsRuLatestPublishedSquad(
  profileId: string,
  sportsRuSeasonId: string,
  options: { endpoint?: string; fetchImpl?: typeof fetch; expectedTourNumber?: number } = {}
): Promise<SportsRuPublishedSquad | null> {
  const safeProfileId = normalizeSportsRuProfileId(profileId);
  if (!safeProfileId) throw new Error("Invalid Sports.ru profile ID.");
  const seasonId = sportsRuSeasonId.trim();
  if (!seasonId || !/^\d{1,20}$/.test(seasonId)) throw new Error("Invalid Sports.ru fantasy season ID.");
  const expectedTourNumber = options.expectedTourNumber;
  if (
    expectedTourNumber !== undefined
    && (!Number.isSafeInteger(expectedTourNumber) || expectedTourNumber <= 0)
  ) throw new Error("Invalid expected Sports.ru tour number.");
  const endpoint = options.endpoint ?? sportsRuFantasyGraphqlEndpoint;
  const fetchImpl = options.fetchImpl ?? fetch;
  const response = await sportsRuGraphqlRequest<{ fantasyQueries?: { squads?: SportsRuSquadNode[] | null } }>(
    endpoint,
    `{
      fantasyQueries {
        squads(input: { userID: ${JSON.stringify(safeProfileId)}, isActiveTournament: true }) {
          id name createdAt
          season {
            id
            tournament { id name webName }
            currentTour { id name status startedAt finishedAt }
            tours { id name status startedAt finishedAt }
          }
          currentTourInfo { ${sportsRuSquadTourInfoFields} }
        }
      }
    }`,
    fetchImpl
  );
  const candidates = (response.fantasyQueries?.squads ?? [])
    .filter((squad) => squad.season?.id === seasonId)
    .sort((left, right) => Date.parse(right.createdAt ?? "") - Date.parse(left.createdAt ?? ""));

  for (const squad of candidates) {
    const current = normalizeSportsRuSquadTourInfo(squad, squad.currentTourInfo);
    if (current && sportsRuSquadMatchesExpectedTour(current, expectedTourNumber)) return current;
    const tours = [...(squad.season?.tours ?? [])]
      .filter((tour) => tour.id)
      .filter((tour) => sportsRuTourNameMatchesExpectedTour(tour.name, expectedTourNumber))
      // currentTourInfo is already empty above. Prefer completed tours, whose
      // lineups are public, before asking Sports.ru for an open-tour payload
      // that it will withhold until the deadline.
      .sort((left, right) =>
        sportsRuTourPublicationPriority(right) - sportsRuTourPublicationPriority(left)
        || sportsRuTourTimestamp(right) - sportsRuTourTimestamp(left)
      );
    for (const tour of tours) {
      const historic = await sportsRuGraphqlRequest<{ fantasyQueries?: { squadTourInfo?: SportsRuSquadTourInfoNode | null } }>(
        endpoint,
        `{
          fantasyQueries {
            squadTourInfo(input: { squadID: ${JSON.stringify(squad.id)}, tourID: ${JSON.stringify(tour.id)} }) {
              ${sportsRuSquadTourInfoFields}
            }
          }
        }`,
        fetchImpl
      );
      const normalized = normalizeSportsRuSquadTourInfo(squad, historic.fantasyQueries?.squadTourInfo ?? null);
      if (normalized && sportsRuSquadMatchesExpectedTour(normalized, expectedTourNumber)) return normalized;
    }
  }
  return null;
}

type SportsRuTourNode = {
  id: string;
  name?: string | null;
  status?: string | null;
  startedAt?: string | null;
  finishedAt?: string | null;
};

type SportsRuSquadTourInfoNode = {
  tour?: SportsRuTourNode | null;
  totalPrice?: number | null;
  currentBalance?: number | null;
  players?: Array<{
    seasonPlayer?: {
      id?: string | null;
      name?: string | null;
      price?: number | null;
      role?: string | null;
      team?: { name?: string | null } | null;
      statObject?: { name?: string | null; firstName?: string | null; lastName?: string | null } | null;
    } | null;
    isCaptain?: boolean | null;
    isViceCaptain?: boolean | null;
    isStarting?: boolean | null;
    substitutePriority?: number | null;
  }> | null;
};

type SportsRuSquadNode = {
  id: string;
  name?: string | null;
  createdAt?: string | null;
  season?: {
    id?: string | null;
    tournament?: { name?: string | null; webName?: string | null } | null;
    currentTour?: SportsRuTourNode | null;
    tours?: SportsRuTourNode[] | null;
  } | null;
  currentTourInfo?: SportsRuSquadTourInfoNode | null;
};

const sportsRuSquadTourInfoFields = `
  tour { id name status startedAt finishedAt }
  totalPrice
  currentBalance
  players {
    seasonPlayer { id name price role team { name } statObject { name firstName lastName } }
    isCaptain
    isViceCaptain
    isStarting
    substitutePriority
  }
`;

function normalizeSportsRuSquadTourInfo(squad: SportsRuSquadNode, info: SportsRuSquadTourInfoNode | null | undefined) {
  const tour = info?.tour;
  const rawPlayers = info?.players ?? [];
  if (!tour?.id || rawPlayers.length === 0 || !squad.season?.id) return null;
  const players = rawPlayers.flatMap((row): SportsRuPublishedSquadPlayer[] => {
    const player = row.seasonPlayer;
    const providerPlayerId = player?.id?.trim();
    if (!providerPlayerId) return [];
    const statName = [player?.statObject?.firstName, player?.statObject?.lastName].filter(Boolean).join(" ");
    return [{
      providerPlayerId,
      name: cleanText(player?.name || player?.statObject?.name || statName || providerPlayerId),
      teamName: cleanText(player?.team?.name ?? "") || null,
      role: player?.role ?? null,
      price: Number.isFinite(Number(player?.price)) ? Number(player?.price) : null,
      isStarter: row.isStarting === true,
      isCaptain: row.isCaptain === true,
      isViceCaptain: row.isViceCaptain === true,
      substitutePriority: Number.isInteger(row.substitutePriority) ? row.substitutePriority! : null
    }];
  });
  if (players.length === 0) return null;
  return {
    providerSquadId: squad.id,
    squadName: cleanText(squad.name ?? "") || "Sports.ru squad",
    seasonId: squad.season.id,
    tournamentHru: squad.season.tournament?.webName?.trim() ?? "",
    tournamentName: cleanText(squad.season.tournament?.name ?? "") || "Sports.ru fantasy",
    tourId: tour.id,
    tourName: cleanText(tour.name ?? "") || tour.id,
    tourFinishedAt: tour.finishedAt ?? null,
    totalPrice: Number(info?.totalPrice) || 0,
    currentBalance: Number(info?.currentBalance) || 0,
    players
  } satisfies SportsRuPublishedSquad;
}

function sportsRuTourTimestamp(tour: SportsRuTourNode) {
  return Date.parse(tour.finishedAt || tour.startedAt || "") || 0;
}

function sportsRuTourPublicationPriority(tour: SportsRuTourNode) {
  if (tour.finishedAt) return 1;
  return ["FINISHED", "COMPLETED", "CLOSED"].includes(tour.status?.toUpperCase() ?? "") ? 1 : 0;
}

function sportsRuSquadMatchesExpectedTour(squad: SportsRuPublishedSquad, expectedTourNumber: number | undefined) {
  return sportsRuTourNameMatchesExpectedTour(squad.tourName, expectedTourNumber);
}

function sportsRuTourNameMatchesExpectedTour(tourName: string | null | undefined, expectedTourNumber: number | undefined) {
  if (expectedTourNumber === undefined) return true;
  const match = tourName?.match(/\d+/);
  return match ? Number(match[0]) === expectedTourNumber : false;
}

export function sportsRuTournamentHruFromUrl(value: string) {
  try {
    const parts = new URL(value).pathname.split("/").filter(Boolean);
    const footballIndex = parts.findIndex((part) => part === "football");
    return footballIndex >= 0 ? parts[footballIndex + 1] ?? null : null;
  } catch {
    return null;
  }
}

async function sportsRuGraphqlRequest<T>(endpoint: string, query: string, fetchImpl: typeof fetch): Promise<T> {
  const response = await fetchImpl(endpoint, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "user-agent": "MacheteFantasyImporter/2.0",
      "x-appname": "frontend-fantasy-landing",
      "x-appversion": "v1.0.6"
    },
    signal: AbortSignal.timeout(sportsRuFantasyRequestTimeoutMs),
    body: JSON.stringify({ query })
  });
  if (!response.ok) throw new Error(`Sports.ru GraphQL request failed: ${response.status} ${response.statusText}`);
  const payload = (await response.json()) as { data?: T; errors?: Array<{ message?: string }> };
  if (payload.errors?.length) throw new Error(`Sports.ru GraphQL error: ${payload.errors.map((error) => error.message ?? "unknown error").join("; ")}`);
  if (!payload.data) throw new Error("Sports.ru GraphQL response contains no data.");
  return payload.data;
}

export function parseSportsRuFantasyTournamentLinks(html: string, baseUrl = "https://www.sports.ru"): SportsRuFantasyTournamentLink[] {
  const links: SportsRuFantasyTournamentLink[] = [];
  const cardRegex = /<a\b[^>]*class="[^"]*\btournament-card\b[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  let match: RegExpExecArray | null;

  while ((match = cardRegex.exec(html))) {
    const [, rawHref, body] = match;
    const name = textFromFirstClass(body, "tournament-card__name");
    if (!name) continue;
    links.push({
      name,
      href: absoluteUrl(htmlDecode(rawHref), baseUrl),
      deadline: textFromFirstClass(body, "tournament-card__deadline-date"),
      members: parseMembers(textFromFirstClass(body, "tournament-card__members"))
    });
  }

  return uniqueBy(links, (link) => link.href);
}

export function parseSportsRuFantasyTournament(html: string): {
  contest: SportsRuFantasyContestRules;
  prices: SportsRuFantasyPriceRow[];
} {
  const name = cleanText(textBetween(html, /<h1[^>]*>/i, /<\/h1>/i) || textFromTitle(html) || "Sports.ru fantasy");
  const budgetLimit = parseBudget(html) ?? defaultBudget;
  const prices = parseFeaturedPriceRows(html);

  return {
    contest: {
      name,
      budgetLimit,
      squadSize: defaultSquadSize,
      maxPlayersPerTeam: parseMaxPlayersPerTeam(html)
    },
    prices
  };
}

export function normalizeSportsRuPlayerName(value: string) {
  const transliterated = transliterateCyrillic(value);
  return normalizeName(transliterated || value);
}

function parseFeaturedPriceRows(html: string): SportsRuFantasyPriceRow[] {
  const rows: SportsRuFantasyPriceRow[] = [];
  const rowRegex = /<div class="field__row"[\s\S]*?>([\s\S]*?)<\/div><\/div><!--\]-->/gi;
  let rowMatch: RegExpExecArray | null;
  let rowIndex = 0;

  while ((rowMatch = rowRegex.exec(html))) {
    const position = positionForFeaturedRow(rowIndex);
    const playerRegex = /<div class="field-player__surname"[^>]*>([^<]+)<\/div>\s*<div class="field-player__price"[^>]*>([\d.,]+)/gi;
    let playerMatch: RegExpExecArray | null;
    while ((playerMatch = playerRegex.exec(rowMatch[1]))) {
      const playerName = cleanText(playerMatch[1]);
      const price = Number(playerMatch[2].replace(",", "."));
      if (!playerName || !Number.isFinite(price)) continue;
      rows.push({
        playerName,
        normalizedName: normalizeSportsRuPlayerName(playerName),
        position,
        price,
        sourceKind: "featured-field",
        sourceRowIndex: rowIndex
      });
    }
    rowIndex += 1;
  }

  if (rows.length > 0) return rows;

  const fallbackRegex = /field-player__surname"[^>]*>([^<]+)<\/div>\s*<div class="field-player__price"[^>]*>([\d.,]+)/gi;
  let fallbackMatch: RegExpExecArray | null;
  let index = 0;
  while ((fallbackMatch = fallbackRegex.exec(html))) {
    const playerName = cleanText(fallbackMatch[1]);
    const price = Number(fallbackMatch[2].replace(",", "."));
    if (!playerName || !Number.isFinite(price)) continue;
      rows.push({
        playerName,
        normalizedName: normalizeSportsRuPlayerName(playerName),
        position: positionForFeaturedIndex(index),
        price,
        sourceKind: "featured-field-fallback",
        sourceRowIndex: index
      });
    index += 1;
  }

  return rows;
}

function parseBudget(html: string) {
  const match = html.match(/бюджет[\s\S]{0,180}?<strong[^>]*>\s*([\d.,]+)/i);
  if (!match) return null;
  const value = Number(match[1].replace(",", "."));
  return Number.isFinite(value) ? value : null;
}

function parseMaxPlayersPerTeam(html: string) {
  const match = html.match(/(?:не\s+более|максимум)[^<]{0,80}?(\d+)[^<]{0,80}?(?:одн(?:ой|ого)|клуб|команд)/i);
  if (!match) return null;
  const value = Number(match[1]);
  return Number.isInteger(value) && value > 0 ? value : null;
}

function positionForFeaturedRow(rowIndex: number) {
  if (rowIndex === 0) return "GK";
  if (rowIndex === 1) return "DEF";
  if (rowIndex === 2) return "MID";
  return "FWD";
}

function positionForFeaturedIndex(index: number) {
  if (index === 0) return "GK";
  if (index <= 4) return "DEF";
  if (index <= 8) return "MID";
  return "FWD";
}

function textFromFirstClass(html: string, className: string) {
  const pattern = new RegExp(`<[^>]+class="[^"]*\\b${escapeRegex(className)}\\b[^"]*"[^>]*>([\\s\\S]*?)<\\/[^>]+>`, "i");
  const match = html.match(pattern);
  return match ? cleanText(match[1]) : null;
}

function textFromTitle(html: string) {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return match ? cleanText(match[1]) : null;
}

function textBetween(html: string, start: RegExp, end: RegExp) {
  const startMatch = start.exec(html);
  if (!startMatch) return null;
  const rest = html.slice(startMatch.index + startMatch[0].length);
  const endMatch = end.exec(rest);
  return endMatch ? rest.slice(0, endMatch.index) : null;
}

function parseMembers(value: string | null) {
  if (!value) return null;
  const match = value.replace(/\s+/g, "").match(/\d+/);
  return match ? Number(match[0]) : null;
}

function cleanText(value: string) {
  return htmlDecode(value.replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

function htmlDecode(value: string) {
  return value
    .replace(/&nbsp;/g, " ")
    .replace(/&#160;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'");
}

function absoluteUrl(href: string, baseUrl: string) {
  try {
    return new URL(href, baseUrl).toString();
  } catch {
    return href;
  }
}

function uniqueBy<T>(items: T[], keyFor: (item: T) => string) {
  const seen = new Set<string>();
  const result: T[] = [];
  for (const item of items) {
    const key = keyFor(item);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(item);
  }
  return result;
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function transliterateCyrillic(value: string) {
  const map: Record<string, string> = {
    а: "a",
    б: "b",
    в: "v",
    г: "g",
    д: "d",
    е: "e",
    ё: "e",
    ж: "zh",
    з: "z",
    и: "i",
    й: "y",
    к: "k",
    л: "l",
    м: "m",
    н: "n",
    о: "o",
    п: "p",
    р: "r",
    с: "s",
    т: "t",
    у: "u",
    ф: "f",
    х: "h",
    ц: "ts",
    ч: "ch",
    ш: "sh",
    щ: "sch",
    ы: "y",
    э: "e",
    ю: "yu",
    я: "ya",
    ь: "",
    ъ: ""
  };

  return value
    .split("")
    .map((char) => map[char.toLowerCase()] ?? char)
    .join("");
}
