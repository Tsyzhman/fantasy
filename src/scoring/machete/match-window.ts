export type MacheteMatchWindow =
  | { kind: "last"; matches: number }
  | { kind: "days"; days: number }
  | { kind: "season"; offset: 0 | -1 }
  | { kind: "all" };

type ParseWindowInput = {
  mode?: string | null;
  customMatches?: string | null;
  legacyRecentMatches?: string | null;
};

export function parseMacheteMatchWindow({ mode, customMatches, legacyRecentMatches }: ParseWindowInput): MacheteMatchWindow {
  if (legacyRecentMatches) {
    return { kind: "last", matches: parsePositiveInt(legacyRecentMatches) ?? 5 };
  }

  if (mode === "last3") return { kind: "last", matches: 3 };
  if (mode === "last10") return { kind: "last", matches: 10 };
  if (mode === "last15") return { kind: "last", matches: 15 };
  if (mode === "current") return { kind: "season", offset: 0 };
  if (mode === "previous") return { kind: "season", offset: -1 };
  if (mode === "all") return { kind: "all" };
  if (mode === "custom") return { kind: "last", matches: parsePositiveInt(customMatches) ?? 5 };

  return { kind: "last", matches: 5 };
}

export function matchWindowModeValue(window: MacheteMatchWindow) {
  if (window.kind === "all") return "all";
  if (window.kind === "season") return window.offset === 0 ? "current" : "previous";
  if (window.kind === "days") return `days${window.days}`;
  if (window.matches === 3) return "last3";
  if (window.matches === 10) return "last10";
  if (window.matches === 15) return "last15";
  if (window.matches === 5) return "last5";
  return "custom";
}

export function matchWindowLabel(window: MacheteMatchWindow) {
  if (window.kind === "all") return "all loaded matches";
  if (window.kind === "season") return window.offset === 0 ? "current season" : "previous season";
  if (window.kind === "days") return `last ${window.days} days`;
  return `last ${window.matches} played team matches`;
}

export function matchWindowLabelRu(window: MacheteMatchWindow) {
  if (window.kind === "all") return "все загруженные матчи";
  if (window.kind === "season") return window.offset === 0 ? "текущий сезон" : "предыдущий сезон";
  if (window.kind === "days") return `последние ${window.days} дней`;
  return `последние ${window.matches} матчей команды`;
}

export function matchWindowSeasonLabel(currentSeason: string | null | undefined, offset: 0 | -1, providerLeagueId?: string | null) {
  return offset === 0 ? currentSeason ?? null : previousSeasonLabel(currentSeason, providerLeagueId);
}

export function previousSeasonLabel(season: string | null | undefined, providerLeagueId?: string | null) {
  if (!season) return null;

  const normalized = season.trim();
  if (providerLeagueId === "77") {
    const splitSeason = normalized.match(/^(\d{4})\/(\d{2}|\d{4})$/);
    if (splitSeason) {
      const tournamentYear = splitSeason[2].length === 2 ? Number(`20${splitSeason[2]}`) : Number(splitSeason[2]);
      return String(tournamentYear - 4);
    }

    const years = normalized.match(/\d{4}/g);
    const currentTournamentYear = years?.length ? Number(years[years.length - 1]) : 2026;
    return String(currentTournamentYear - 4);
  }

  const splitSeason = normalized.match(/^(\d{4})\/(\d{2}|\d{4})$/);
  if (splitSeason) {
    const startYear = Number(splitSeason[1]);
    return `${startYear - 1}/${splitSeason[2].length === 4 ? String(startYear) : String(startYear).slice(-2)}`;
  }

  const yearSeason = normalized.match(/^(\d{4})$/);
  if (yearSeason) {
    const year = Number(yearSeason[1]);
    return String(year - (providerLeagueId === "77" ? 4 : 1));
  }

  return null;
}

export function fixtureInSeason(fixture: { kickoffAt: Date | null }, season: string | null | undefined) {
  const bounds = seasonBounds(season);
  if (!bounds) return true;
  if (!fixture.kickoffAt) return false;

  return fixture.kickoffAt >= bounds.from && fixture.kickoffAt < bounds.to;
}

export function fixtureInMatchWindow(
  fixture: { kickoffAt: Date | null },
  window: MacheteMatchWindow,
  currentSeason: string | null | undefined,
  providerLeagueId?: string | null,
  referenceDate = new Date()
) {
  if (window.kind === "all" || window.kind === "last") return true;
  if (window.kind === "days") {
    if (!fixture.kickoffAt) return false;
    return fixture.kickoffAt >= daysAgo(window.days, referenceDate) && fixture.kickoffAt <= referenceDate;
  }

  return fixtureInSeason(fixture, matchWindowSeasonLabel(currentSeason, window.offset, providerLeagueId));
}

export function daysAgo(days: number, referenceDate = new Date()) {
  return new Date(referenceDate.getTime() - Math.max(0, days) * 24 * 60 * 60 * 1000);
}

export function fixtureSyncSeasons(currentSeason: string | null | undefined, providerLeagueId?: string | null) {
  return [currentSeason ?? null, previousSeasonLabel(currentSeason, providerLeagueId)].filter(
    (season, index, seasons): season is string | null => index === seasons.findIndex((candidate) => candidate === season)
  );
}

function seasonBounds(season: string | null | undefined) {
  if (!season) return null;

  const normalized = season.trim();
  const splitSeason = normalized.match(/^(\d{4})\/(\d{2}|\d{4})$/);
  if (splitSeason) {
    const startYear = Number(splitSeason[1]);
    const endYear = splitSeason[2].length === 2 ? Number(`20${splitSeason[2]}`) : Number(splitSeason[2]);
    return {
      from: new Date(Date.UTC(startYear, 6, 1)),
      to: new Date(Date.UTC(endYear, 6, 1))
    };
  }

  const yearSeason = normalized.match(/^(\d{4})$/);
  if (yearSeason) {
    const year = Number(yearSeason[1]);
    return {
      from: new Date(Date.UTC(year, 0, 1)),
      to: new Date(Date.UTC(year + 1, 0, 1))
    };
  }

  return null;
}

function parsePositiveInt(value: string | null | undefined) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) return null;
  return Math.min(parsed, 50);
}
