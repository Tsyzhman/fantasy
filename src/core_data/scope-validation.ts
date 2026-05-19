import type { FotMobFixture } from "@/providers/fotmob/types";

import type { IngestionScope } from "./ingestion-scope";
import { configForLeague } from "./league-season-policy";

export class ScopeTooBroadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ScopeTooBroadError";
  }
}

export function validate_ingestion_scope(scope: IngestionScope, discovered_matches: FotMobFixture[]) {
  const config = configForLeague(scope.league_id);
  const maxMatches = scope.max_matches ?? config?.max_matches ?? 700;
  if (discovered_matches.length > maxMatches) {
    throw new ScopeTooBroadError(
      `Scope ${scope.league_id} ${scope.season} discovered ${discovered_matches.length} matches; safety limit is ${maxMatches}.`
    );
  }

  const wrongLeague = discovered_matches.find((match) => match.leagueId && String(match.leagueId) !== String(scope.league_id));
  if (wrongLeague) {
    throw new ScopeTooBroadError(
      `Discovered match ${wrongLeague.id} belongs to league ${wrongLeague.leagueId}, not requested league ${scope.league_id}.`
    );
  }

  const wrongSeason = discovered_matches.find((match) => "season" in match && typeof match.season === "string" && match.season !== scope.season);
  if (wrongSeason) {
    throw new ScopeTooBroadError(`Discovered match ${wrongSeason.id} belongs to a different season than ${scope.season}.`);
  }

  const dates = discovered_matches
    .map((match) => parseDate(match.kickoffAt))
    .filter((date): date is Date => date !== null)
    .sort((left, right) => left.getTime() - right.getTime());
  if (dates.length >= 2) {
    const spanDays = Math.ceil((dates[dates.length - 1].getTime() - dates[0].getTime()) / (24 * 60 * 60 * 1000));
    const maxDateSpanDays = config?.max_date_span_days ?? (config?.calendar_type === "spring_autumn" ? 400 : 450);
    if (spanDays > maxDateSpanDays) {
      throw new ScopeTooBroadError(
        `Scope ${scope.league_id} ${scope.season} spans ${spanDays} days; safety limit is ${maxDateSpanDays}.`
      );
    }
  }

  if (scope.date_from || scope.date_to) {
    const outOfRange = discovered_matches.find((match) => {
      const date = parseDate(match.kickoffAt);
      if (!date) return false;
      if (scope.date_from && date < scope.date_from) return true;
      if (scope.date_to && date > scope.date_to) return true;
      return false;
    });
    if (outOfRange) {
      throw new ScopeTooBroadError(`Discovered match ${outOfRange.id} falls outside the requested date range.`);
    }
  }
}

function parseDate(value: string | Date | null | undefined) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

