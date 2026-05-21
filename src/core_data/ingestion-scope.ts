export type CalendarType = "autumn_spring" | "spring_autumn" | "tournament";

export type IngestionScope = Readonly<{
  source: "fotmob";
  league_id: number;
  season: string;
  date_from?: Date | null;
  date_to?: Date | null;
  include_finished: boolean;
  include_live: boolean;
  include_upcoming: boolean;
  max_matches?: number | null;
  force_refresh: boolean;
  force_reparse: boolean;
  require_detailed_payloads: boolean;
}>;

export function createIngestionScope(input: {
  league_id: number;
  season: string;
  date_from?: Date | null;
  date_to?: Date | null;
  include_finished?: boolean;
  include_live?: boolean;
  include_upcoming?: boolean;
  max_matches?: number | null;
  force_refresh?: boolean;
  force_reparse?: boolean;
  require_detailed_payloads?: boolean;
}): IngestionScope {
  return Object.freeze({
    source: "fotmob" as const,
    league_id: input.league_id,
    season: input.season,
    date_from: input.date_from ?? null,
    date_to: input.date_to ?? null,
    include_finished: input.include_finished ?? true,
    include_live: input.include_live ?? false,
    include_upcoming: input.include_upcoming ?? false,
    max_matches: input.max_matches ?? null,
    force_refresh: input.force_refresh ?? false,
    force_reparse: input.force_reparse ?? false,
    require_detailed_payloads: input.require_detailed_payloads ?? false
  });
}
