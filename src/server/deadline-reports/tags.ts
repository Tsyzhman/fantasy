/**
 * @spec spec://modules/telegram/FEAT-007-deadline-assistant#message
 */
const CONTEST_TAG_ALIASES: Array<[RegExp, string]> = [
  [/чемпионшип/i, "Чемпиошип"],
  [/лига чемпионов|лч(?![а-яё])/i, "ЛигаЧемпионов"],
  [/лига европы|л[её](?![а-яё])/i, "ЛигаЕвропы"],
  [/англи/i, "Англия"],
  [/испани/i, "Испания"],
  [/нидерланд/i, "Нидерланды"],
  [/португал/i, "Португалия"],
  [/росси/i, "Россия"],
  [/германи/i, "Германия"],
  [/итали/i, "Италия"],
  [/франци/i, "Франция"]
];

export function contestTagAlias(contestName: string): string | null {
  for (const [pattern, alias] of CONTEST_TAG_ALIASES) {
    if (pattern.test(contestName)) return alias;
  }
  return null;
}

export function deadlineTag(contestName: string, roundOrdinal: number | null): string | null {
  const alias = contestTagAlias(contestName);
  if (!alias) return null;
  return `#${alias}${roundOrdinal ?? ""}`;
}
