import { parse, type HTMLElement } from "node-html-parser";

export const FANTASY_FOOTBALL_SCOUT_LINEUPS_URL = "https://www.fantasyfootballscout.co.uk/team-news/";
export const GAZZETTA_PROBABLE_LINEUPS_URL = "https://www.gazzetta.it/Calcio/prob_form/";
export const LIGAINSIDER_BUNDESLIGA_URL = "https://www.ligainsider.de/";
export const FANTASY_COACH_LIGUE_1_URL = "https://l1.compos.fantasy-coach.fr/";
export const FANTASY_COACH_LIGUE_1_API_URL = "https://script.google.com/macros/s/AKfycby7k1DeAKMJFeSLMCHtQntyU0hGseKmN4ZMxuMMDjugFTh-H4wTNvk5TA32CM5By7aMng/exec";

const FANTASY_COACH_LIGUE_1_PLAYER_ALIASES = new Map<string, string>([
  ["auxerre|labeau lascary", "Rémy Lascary"],
  ["le havre|mpasi", "Lionel Mpasi-Nzau"],
  // The provider's current J2 payload says "Valette" in the left-back slot,
  // but no such player exists in the active HAC roster. Zouaoui is injured and
  // current match sheets identify Enzo Koffi as his replacement.
  ["le havre|valette", "Enzo Koffi"],
  ["lille|alexsandro", "Alexsandro Ribeiro"],
  ["nice|youssouf", "Youssouf Ndayishimiye"],
  ["paris sg|kvaratskehlia", "Khvicha Kvaratskhelia"],
  ["rennes|al tamari", "Mousa Tamari"],
  ["strasbourg|omomabidele", "Andrew Omobamidele"],
  ["strasbourg|demba", "Pape Demba Diop"],
  ["troyes|ifnaoui", "Merwan Ifnaou"]
]);

export type ProbableLineupSource = "FANTASY_FOOTBALL_SCOUT" | "GAZZETTA" | "LIGAINSIDER" | "FANTASY_COACH_LIGUE_1" | "UEFA";
export type ProbableLineupVenue = "HOME" | "AWAY";

export type LigaInsiderTeamPage = {
  teamName: string;
  sourceTeamCode: string;
  sourceUrl: string;
};

export type ProbableLineupPlayer = {
  name: string;
  fullName: string | null;
  providerCode: string | null;
  shirtNumber: number | null;
};

export type ProbableTeamLineup = {
  source: ProbableLineupSource;
  sourceUrl: string;
  sourceTeamCode: string | null;
  sourceFixtureId: string | null;
  teamName: string;
  opponentName: string | null;
  venue: ProbableLineupVenue | null;
  formation: string | null;
  sourceUpdatedText: string | null;
  players: ProbableLineupPlayer[];
};

export type ParsedProbableLineupPage = {
  source: ProbableLineupSource;
  sourceUrl: string;
  lineups: ProbableTeamLineup[];
};

export class ProbableLineupParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProbableLineupParseError";
  }
}

export function parseFantasyCoachAvailableGameweeks(payload: string) {
  const parsed = parseJsonPayload(payload, "Fantasy Coach gameweek metadata");
  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new ProbableLineupParseError("Fantasy Coach gameweek metadata must be a non-empty array.");
  }
  const gameweeks = parsed.map((value) => {
    const normalized = typeof value === "number" ? value : typeof value === "string" ? Number(value.trim()) : Number.NaN;
    if (!Number.isSafeInteger(normalized) || normalized <= 0 || normalized > 100) {
      throw new ProbableLineupParseError(`Fantasy Coach returned an invalid gameweek '${String(value)}'.`);
    }
    return normalized;
  });
  if (new Set(gameweeks).size !== gameweeks.length) {
    throw new ProbableLineupParseError("Fantasy Coach returned duplicate gameweeks.");
  }
  return gameweeks.sort((left, right) => left - right);
}

export function parseFantasyCoachLigue1Lineups(
  payload: string,
  gameweek: number,
  sourceUrl: string
): ParsedProbableLineupPage {
  if (!Number.isSafeInteger(gameweek) || gameweek <= 0) {
    throw new ProbableLineupParseError(`Fantasy Coach gameweek '${gameweek}' is invalid.`);
  }
  const parsed = parseJsonPayload(payload, `Fantasy Coach Ligue 1 gameweek ${gameweek}`);
  if (!isJsonObject(parsed) || !Array.isArray(parsed.equipes)) {
    throw new ProbableLineupParseError(`Fantasy Coach Ligue 1 gameweek ${gameweek} does not contain an equipes array.`);
  }

  const lineups = parsed.equipes.map((entry, teamIndex) => {
    if (!isJsonObject(entry)) {
      throw new ProbableLineupParseError(`Fantasy Coach team ${teamIndex + 1} is not an object.`);
    }
    const teamName = requiredFantasyCoachText(entry.equipe, `team ${teamIndex + 1} name`);
    if (!Array.isArray(entry.joueurs)) {
      throw new ProbableLineupParseError(`Fantasy Coach ${teamName} does not contain a joueurs array.`);
    }
    const players = entry.joueurs.map((value, playerIndex) => {
      const name = fantasyCoachPrimaryPlayerName(value, teamName, playerIndex);
      return {
        name,
        fullName: fantasyCoachPlayerAlias(teamName, name),
        providerCode: null,
        shirtNumber: null
      } satisfies ProbableLineupPlayer;
    });

    return {
      source: "FANTASY_COACH_LIGUE_1",
      sourceUrl,
      sourceTeamCode: null,
      sourceFixtureId: `journee-${gameweek}`,
      teamName,
      opponentName: null,
      venue: null,
      formation: optionalFantasyCoachText(entry.formation),
      sourceUpdatedText: `Journée ${gameweek}`,
      players
    } satisfies ProbableTeamLineup;
  });

  return {
    source: "FANTASY_COACH_LIGUE_1",
    sourceUrl,
    lineups
  };
}

export function parseFantasyFootballScoutLineups(html: string): ParsedProbableLineupPage {
  // The WordPress page contains malformed third-party ad/script markup before the
  // lineup list. Parse each stable team block independently so an unrelated ad
  // cannot swallow the rest of the document in a tolerant HTML parser.
  const lineups = fantasyFootballScoutTeamBlocks(html).flatMap((block) => {
    const item = parse(block).querySelector(".team-news-item");
    if (!item) return [];
    const teamName = elementText(item.querySelector("header h2"));
    const formationNode = item.querySelector(".scout-picks.formation");
    const formation = formationFromClassName(formationNode?.getAttribute("class") ?? null);
    const players = (formationNode?.querySelectorAll("li") ?? []).flatMap((playerNode) => {
      const name = elementText(playerNode.querySelector(".player-name"));
      if (!name) return [];
      const title = cleanText(playerNode.getAttribute("title") ?? "");
      const imageSource = playerNode.querySelector("img")?.getAttribute("src") ?? "";
      return [{
        name,
        fullName: fantasyFootballScoutFullName(title, name),
        providerCode: premierLeaguePlayerCode(imageSource),
        shirtNumber: null
      } satisfies ProbableLineupPlayer];
    });
    const nextMatch = elementText(item.querySelector(".next-match")).replace(/^Next Match:\s*/i, "").trim();

    return [{
      source: "FANTASY_FOOTBALL_SCOUT",
      sourceUrl: FANTASY_FOOTBALL_SCOUT_LINEUPS_URL,
      sourceTeamCode: cleanText(item.getAttribute("data-team-code") ?? "") || null,
      sourceFixtureId: null,
      teamName,
      opponentName: nextMatch ? nextMatch.replace(/\s+\([HA]\)\s*$/i, "").trim() || null : null,
      venue: nextMatchVenue(nextMatch),
      formation,
      sourceUpdatedText: elementText(item.querySelector(".story-parts .grey em")) || null,
      players
    } satisfies ProbableTeamLineup];
  });

  return {
    source: "FANTASY_FOOTBALL_SCOUT",
    sourceUrl: FANTASY_FOOTBALL_SCOUT_LINEUPS_URL,
    lineups
  };
}

function fantasyFootballScoutTeamBlocks(html: string) {
  const startPattern = /<li\b[^>]*\bclass\s*=\s*["'][^"']*\bteam-news-item\b[^"']*["'][^>]*>/gi;
  const starts = [...html.matchAll(startPattern)].flatMap((match) => match.index === undefined ? [] : [match.index]);
  if (starts.length === 0) return [];
  const listEnd = html.indexOf("</ol>", starts.at(-1));
  return starts.map((start, index) => html.slice(start, starts[index + 1] ?? (listEnd >= 0 ? listEnd : html.length)));
}

export function parseGazzettaProbableLineups(html: string): ParsedProbableLineupPage {
  const root = parse(html);
  const lineups: ProbableTeamLineup[] = [];

  for (const match of root.querySelectorAll(".probabiliFormazioni .bck-box-match-details")) {
    const homeTeamNode = match.querySelector(".details-team.is--home .details-team__name");
    const awayTeamNode = match.querySelector(".details-team.is--away .details-team__name");
    const homeTeamName = elementText(homeTeamNode);
    const awayTeamName = elementText(awayTeamNode);
    const infoNodes = match.querySelectorAll(".match-details__info-match");
    const homeFormation = formationFromText(elementText(infoNodes[0] ?? null));
    const awayFormation = formationFromText(elementText(infoNodes.at(-1) ?? null));
    const homeLineup = match.querySelector(".lineup-team.is--home");
    const awayLineup = match.querySelector(".lineup-team.is--away");
    const sourceFixtureId = match.getAttribute("id")?.replace(/^match-/, "").trim() || null;
    const sourceUpdatedText = elementText(match.querySelector(".lastUpdate")) || null;

    lineups.push(
      {
        source: "GAZZETTA",
        sourceUrl: GAZZETTA_PROBABLE_LINEUPS_URL,
        sourceTeamCode: teamSlug(homeTeamNode),
        sourceFixtureId,
        teamName: homeTeamName,
        opponentName: awayTeamName || null,
        venue: "HOME",
        formation: homeFormation,
        sourceUpdatedText,
        players: gazzettaPlayers(homeLineup)
      },
      {
        source: "GAZZETTA",
        sourceUrl: GAZZETTA_PROBABLE_LINEUPS_URL,
        sourceTeamCode: teamSlug(awayTeamNode),
        sourceFixtureId,
        teamName: awayTeamName,
        opponentName: homeTeamName || null,
        venue: "AWAY",
        formation: awayFormation,
        sourceUpdatedText,
        players: gazzettaPlayers(awayLineup)
      }
    );
  }

  return {
    source: "GAZZETTA",
    sourceUrl: GAZZETTA_PROBABLE_LINEUPS_URL,
    lineups
  };
}

export function parseLigaInsiderTeamDirectory(
  html: string,
  directoryUrl = LIGAINSIDER_BUNDESLIGA_URL
): LigaInsiderTeamPage[] {
  const root = parse(html);
  const teams = new Map<string, LigaInsiderTeamPage>();

  for (const link of root.querySelectorAll(".icon_holder a[href]")) {
    const href = link.getAttribute("href")?.trim() ?? "";
    const pathMatch = href.match(/^\/([a-z0-9-]+)\/(\d+)\/$/i);
    const teamName = cleanText(link.querySelector("img")?.getAttribute("alt") ?? "");
    if (!pathMatch || !teamName) continue;
    const sourceTeamCode = pathMatch[2] ?? "";
    const sourceUrl = safeLigaInsiderUrl(href, directoryUrl);
    if (!sourceTeamCode || !sourceUrl) continue;

    const existing = teams.get(sourceTeamCode);
    if (existing && (existing.teamName !== teamName || existing.sourceUrl !== sourceUrl)) {
      throw new ProbableLineupParseError(`LigaInsider team code ${sourceTeamCode} has conflicting directory entries.`);
    }
    teams.set(sourceTeamCode, { teamName, sourceTeamCode, sourceUrl });
  }

  return [...teams.values()];
}

export function parseLigaInsiderTeamLineup(
  html: string,
  teamPage: LigaInsiderTeamPage
): ProbableTeamLineup {
  const root = parse(html);
  const pitch = root.querySelector(".stadium_container_bg");
  const rows = pitch?.querySelectorAll(".player_position_row") ?? [];
  const rowSizes = rows.map((row) => row.querySelectorAll(".player_position_column").length);
  const columns = rows.flatMap((row) => row.querySelectorAll(".player_position_column"));
  const parsedTeamName = elementText(root.querySelector("h2.text-uppercase"));
  const players = columns.flatMap(ligaInsiderPrimaryPlayer);
  const opponentText = root.querySelectorAll("h3.text-uppercase.text-start")
    .map(elementText)
    .find((text) => /^Gegen\s+.+?\s+fehlen$/i.test(text)) ?? "";

  return {
    source: "LIGAINSIDER",
    sourceUrl: teamPage.sourceUrl,
    sourceTeamCode: teamPage.sourceTeamCode,
    sourceFixtureId: null,
    teamName: parsedTeamName || teamPage.teamName,
    opponentName: opponentText.match(/^Gegen\s+(.+?)\s+fehlen$/i)?.[1]?.trim() || null,
    venue: null,
    formation: ligaInsiderFormation(rowSizes),
    sourceUpdatedText: null,
    players
  };
}

export function assertCompleteProbableLineupPage(
  page: ParsedProbableLineupPage,
  options: { expectedTeams?: number; expectedPlayersPerTeam?: number } = {}
) {
  const expectedTeams = options.expectedTeams ?? 20;
  const expectedPlayersPerTeam = options.expectedPlayersPerTeam ?? 11;
  const issues: string[] = [];

  if (page.lineups.length !== expectedTeams) {
    issues.push(`expected ${expectedTeams} teams, parsed ${page.lineups.length}`);
  }

  const teamKeys = page.lineups.map((lineup) => normalizeLineupIdentity(lineup.teamName));
  if (teamKeys.some((team) => !team)) issues.push("one or more team names are empty");
  if (new Set(teamKeys).size !== teamKeys.length) issues.push("duplicate team names were parsed");

  for (const lineup of page.lineups) {
    if (lineup.players.length !== expectedPlayersPerTeam) {
      issues.push(`${lineup.teamName || "<unknown team>"}: expected ${expectedPlayersPerTeam} players, parsed ${lineup.players.length}`);
      continue;
    }
    const playerKeys = lineup.players.map((player) => player.providerCode
      ? `code:${player.providerCode}`
      : `name:${normalizeLineupIdentity(player.fullName ?? player.name)}:${player.shirtNumber ?? ""}`);
    if (new Set(playerKeys).size !== playerKeys.length) {
      issues.push(`${lineup.teamName || "<unknown team>"}: duplicate players were parsed`);
    }
  }

  if (issues.length > 0) {
    throw new ProbableLineupParseError(`${page.source} page failed completeness checks: ${issues.slice(0, 8).join("; ")}.`);
  }
}

export function normalizeLineupIdentity(value: string) {
  return value
    .trim()
    .toLocaleLowerCase("en")
    .replace(/[øØ]/g, "o")
    .replace(/[łŁ]/g, "l")
    .replace(/[đĐðÐ]/g, "d")
    .replace(/[þÞ]/g, "th")
    .replace(/[æÆ]/g, "ae")
    .replace(/[œŒ]/g, "oe")
    .replace(/[ßẞ]/g, "ss")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[’'`´]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseJsonPayload(payload: string, label: string): unknown {
  try {
    return JSON.parse(payload) as unknown;
  } catch {
    throw new ProbableLineupParseError(`${label} is not valid JSON.`);
  }
}

function isJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requiredFantasyCoachText(value: unknown, label: string) {
  const normalized = optionalFantasyCoachText(value);
  if (!normalized) throw new ProbableLineupParseError(`Fantasy Coach ${label} is empty or invalid.`);
  return normalized;
}

function optionalFantasyCoachText(value: unknown) {
  return typeof value === "string" ? cleanText(value) || null : null;
}

function fantasyCoachPrimaryPlayerName(value: unknown, teamName: string, playerIndex: number) {
  const rawName = requiredFantasyCoachText(value, `${teamName} player ${playerIndex + 1}`);
  const primaryName = cleanText(rawName.replace(/\s*\([^)]*\)\s*$/, ""));
  if (!primaryName) {
    throw new ProbableLineupParseError(`Fantasy Coach ${teamName} player ${playerIndex + 1} has no primary name.`);
  }
  return primaryName;
}

function fantasyCoachPlayerAlias(teamName: string, playerName: string) {
  return FANTASY_COACH_LIGUE_1_PLAYER_ALIASES.get(
    `${normalizeLineupIdentity(teamName)}|${normalizeLineupIdentity(playerName)}`
  ) ?? null;
}

function gazzettaPlayers(lineup: HTMLElement | null): ProbableLineupPlayer[] {
  return (lineup?.querySelectorAll(".lineup-team__player") ?? []).flatMap((playerNode) => {
    const name = elementText(playerNode.querySelector(".lineup-team__name"));
    if (!name) return [];
    const rawNumber = elementText(playerNode.querySelector(".lineup-team__number"));
    return [{
      name,
      fullName: null,
      providerCode: null,
      shirtNumber: /^\d{1,3}$/.test(rawNumber) ? Number(rawNumber) : null
    } satisfies ProbableLineupPlayer];
  });
}

function ligaInsiderPrimaryPlayer(column: HTMLElement): ProbableLineupPlayer[] {
  const alternatives = column.querySelectorAll(".sub_child");
  const primary = alternatives.find((node) => !/display\s*:\s*none/i.test(node.getAttribute("style") ?? ""))
    ?? alternatives[0]
    ?? column;
  const profileLink = primary.querySelector(".player_position_photo a[href]")
    ?? primary.querySelector(".player_name a[href]");
  const href = profileLink?.getAttribute("href")?.trim() ?? "";
  const profile = href.match(/^\/([a-z0-9-]+)_(\d+)\/$/i);
  const name = elementText(primary.querySelector(".player_name a"));
  if (!profile || !name) return [];

  return [{
    name,
    fullName: ligaInsiderNameFromSlug(profile[1] ?? "") || null,
    providerCode: profile[2] ?? null,
    shirtNumber: null
  }];
}

function ligaInsiderFormation(rowSizes: number[]) {
  if (rowSizes.length < 2 || rowSizes[0] !== 1 || rowSizes.reduce((total, size) => total + size, 0) !== 11) return null;
  return rowSizes.slice(1).join("-");
}

function ligaInsiderNameFromSlug(slug: string) {
  return slug
    .split("-")
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toLocaleUpperCase("de")}${part.slice(1)}`)
    .join(" ");
}

function safeLigaInsiderUrl(href: string, directoryUrl: string) {
  try {
    const url = new URL(href, directoryUrl);
    if (url.protocol !== "https:" || !["ligainsider.de", "www.ligainsider.de"].includes(url.hostname.toLocaleLowerCase("en"))) {
      return null;
    }
    url.hash = "";
    url.search = "";
    return url.toString();
  } catch {
    return null;
  }
}

function fantasyFootballScoutFullName(title: string, fallbackName: string) {
  if (!title) return fallbackName || null;
  const reversed = title.match(/^(.+?)\s*\(([^()]+)\)$/);
  return reversed ? cleanText(`${reversed[2]} ${reversed[1]}`) : title;
}

function premierLeaguePlayerCode(source: string) {
  return source.match(/\/players\/[^/]+\/(\d+)\.(?:png|jpe?g|webp)(?:\?|$)/i)?.[1] ?? null;
}

function formationFromClassName(className: string | null) {
  return className?.match(/(?:^|\s)formation-(\d(?:-\d){2,4})(?:\s|$)/)?.[1] ?? null;
}

function formationFromText(value: string) {
  return value.match(/Modulo:\s*(\d(?:-\d){2,4})/i)?.[1] ?? null;
}

function nextMatchVenue(value: string): ProbableLineupVenue | null {
  const match = value.match(/\(([HA])\)\s*$/i);
  return match?.[1]?.toUpperCase() === "H" ? "HOME" : match?.[1]?.toUpperCase() === "A" ? "AWAY" : null;
}

function teamSlug(node: HTMLElement | null) {
  const href = node?.getAttribute("href") ?? "";
  return href.match(/\/calcio\/squadre\/([^/?#]+)\/?/i)?.[1]?.toLocaleLowerCase("en") ?? null;
}

function elementText(node: HTMLElement | null) {
  return cleanText(node?.textContent ?? "");
}

function cleanText(value: string) {
  return value.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
}
