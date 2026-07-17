import { normalizeFantasyPosition, type FantasyPositionGroup } from "./squad_logic";

type PlayerIdentityRow = {
  id: string;
  name: string;
  teamName?: string | null;
  teamShortName?: string | null;
  position: string | null;
};

export type FantasyPlayerIdentityRef = {
  playerName: string;
  position: string | null;
};

export type FantasyPlayerIdentitySource = "sports-ru" | "fotmob";

export type FantasyPlayerIdentityRow<T extends PlayerIdentityRow> = T & {
  fantasyIdentitySource: FantasyPlayerIdentitySource;
};

type PositionFilter = Exclude<FantasyPositionGroup, "UNK">;

export function applyFantasyPlayerIdentityRows<T extends PlayerIdentityRow>(
  rows: T[],
  resolveSportsRuRef: (rowId: string) => FantasyPlayerIdentityRef | null,
  position: PositionFilter | null
): Array<FantasyPlayerIdentityRow<T>> {
  const resolvedRows: Array<FantasyPlayerIdentityRow<T>> = [];

  for (const row of rows) {
    const sportsRef = resolveSportsRuRef(row.id);
    const sportsPositionGroup = normalizeFantasyPosition(sportsRef?.position);
    const rowPositionGroup = normalizeFantasyPosition(row.position);
    const positionGroup = sportsPositionGroup !== "UNK" ? sportsPositionGroup : rowPositionGroup;
    if (position && positionGroup !== position) continue;

    if (!sportsRef) {
      resolvedRows.push({ ...row, fantasyIdentitySource: "fotmob" });
      continue;
    }

    resolvedRows.push({
      ...row,
      name: sportsRef.playerName,
      position: sportsRef.position ?? (positionGroup === "UNK" ? row.position : positionGroup),
      fantasyIdentitySource: "sports-ru"
    });
  }

  return resolvedRows;
}

export function filterFantasyPlayerIdentityRows<T extends PlayerIdentityRow>(rows: T[], rawQuery: string | null | undefined): T[] {
  const query = normalizePlayerSearchValue(rawQuery ?? "");
  if (!query) return rows;

  const terms = query.split(" ").filter(Boolean);
  return rows.filter((row) => {
    const haystack = normalizePlayerSearchValue(`${row.name} ${row.teamName ?? ""} ${row.teamShortName ?? ""}`);
    return terms.every((term) => haystack.includes(term));
  });
}

function normalizePlayerSearchValue(value: string) {
  return value
    .trim()
    .toLocaleLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}
