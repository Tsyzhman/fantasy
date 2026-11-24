import { macheteCatalogByFotMobId } from "@/lib/leagues/machete-catalog";

/**
 * @spec spec://modules/telegram/FEAT-007-deadline-assistant#message
 */
const CHAMPIONS_LEAGUE_TAG = "ЛигаЧемпионов";
const CONTEST_TAG_ALIASES: Array<[RegExp, string]> = [
  [/лига чемпионов|лч(?![а-яё])|champions league/i, CHAMPIONS_LEAGUE_TAG],
  [/лига европы|л[её](?![а-яё])|europa league/i, "ЛигаЕвропы"],
  [/чемпионшип|championship/i, "Чемпиошип"],
  [/росси|russian premier|rpl/i, "Россия"],
  [/англи|english premier|premier league/i, "Англия"],
  [/испани|la ?liga/i, "Испания"],
  [/нидерланд|eredivisie/i, "Нидерланды"],
  [/португал|liga portugal/i, "Португалия"],
  [/германи|bundesliga/i, "Германия"],
  [/итали|serie a/i, "Италия"],
  [/франци|ligue 1/i, "Франция"],
  [/турец|турци|super lig/i, "Турция"]
];

export function contestTagAlias(contestName: string, leagueId?: bigint): string | null {
  if (macheteCatalogByFotMobId(leagueId?.toString())?.id === "champions-league") return CHAMPIONS_LEAGUE_TAG;
  for (const [pattern, alias] of CONTEST_TAG_ALIASES) {
    if (pattern.test(contestName)) return alias;
  }
  return null;
}

export function deadlineTag(contestName: string, roundOrdinal: number | null, leagueId?: bigint): string | null {
  const alias = contestTagAlias(contestName, leagueId);
  if (!alias) return null;
  return `#${alias}${roundOrdinal ?? ""}`;
}
