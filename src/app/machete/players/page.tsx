import Link from "next/link";

import { I18nText } from "@/components/i18n-text";
import { LocalizedOption } from "@/components/localized-option";
import { MachetePlayerTable } from "@/components/machete/MachetePlayerTable";
import { PageBreadcrumbs } from "@/components/page-breadcrumbs";
import { AutoSubmitForm } from "@/components/players/auto-submit-form";
import { prisma } from "@/lib/db";
import { matchWindowLabel, matchWindowLabelRu, matchWindowModeValue, parseMacheteMatchWindow, type MacheteMatchWindow } from "@/scoring/machete/match-window";
import { normalizeFantasyPosition, type FantasyPositionGroup } from "@/machete/squad_logic";
import { loadSportsRuFantasyPriceRefsByScopedPlayer, sportsRuFantasyPriceScopeKey, type SportsRuFantasyPriceRef } from "@/machete/squad_planner";
import {
  loadSharedLeagueOptions,
  loadSharedLeagueTeams,
  loadSharedMachetePlayerRows,
  loadSharedMatchWindowSummary,
  loadSharedTeamCompetitionOptions,
  parseSharedCompetitionKey,
  parseSharedBigInt,
  sortSharedMacheteRows,
  type SharedLeagueSeasonOption,
  type SharedMachetePlayerRow,
  type SharedPlayerRowsScope,
  type SharedTeamCompetitionOption,
  type SharedTeamOption
} from "@/machete/shared_read_model";

export const dynamic = "force-dynamic";

type SearchParams = {
  leagueId?: string;
  teamId?: string;
  competitionKey?: SearchParamValue;
  position?: string;
  minMinutes?: string;
  recentMatches?: string;
  matchWindow?: string;
  customMatches?: string;
  sort?: string;
  page?: string;
  pageSize?: string;
};

type SearchParamValue = string | string[] | undefined;

type PageProps = {
  searchParams: Promise<SearchParams>;
};

const ALL_LEAGUES_VALUE = "all";
const DEFAULT_PAGE_SIZE = 50;
const PAGE_SIZE_OPTIONS = [25, 50, 100] as const;
const POSITION_FILTERS = ["GK", "DEF", "MID", "FWD"] as const;

type PositionFilter = Exclude<FantasyPositionGroup, "UNK">;

export default async function MachetePlayersPage({ searchParams }: PageProps) {
  const resolvedSearchParams = await searchParams;
  const sortedLeagues = await loadSharedLeagueOptions(prisma);
  const requestedLeagueId = resolvedSearchParams.leagueId ?? "";
  const selectedLeagueId =
    requestedLeagueId === ALL_LEAGUES_VALUE || sortedLeagues.some((league) => String(league.leagueId) === requestedLeagueId) ? requestedLeagueId : "";
  const teamLeagues = await loadTeamLeagueOptions(sortedLeagues, selectedLeagueId);
  const selectedTeamId =
    resolvedSearchParams.teamId &&
    selectedLeagueId &&
    teamLeagues.some((league) => league.teams.some((team) => String(team.id) === resolvedSearchParams.teamId))
      ? resolvedSearchParams.teamId
      : "";
  const sort = resolvedSearchParams.sort ?? "fantasyScore";
  const pageSize = parsePageSize(resolvedSearchParams.pageSize);
  const requestedPage = parsePositiveInt(resolvedSearchParams.page, 1);
  const selectedPosition = parsePositionFilter(resolvedSearchParams.position);
  const matchWindow = parseMacheteMatchWindow({
    mode: resolvedSearchParams.matchWindow ?? (selectedTeamId ? "all" : undefined),
    customMatches: resolvedSearchParams.customMatches,
    legacyRecentMatches: resolvedSearchParams.recentMatches
  });
  const selectedTeamBigInt = parseSharedBigInt(selectedTeamId);
  const teamCompetitionOptions = selectedTeamBigInt ? await loadSharedTeamCompetitionOptions(prisma, selectedTeamBigInt) : [];
  const explicitlySelectedCompetitions = selectedTeamCompetitionOptions(resolvedSearchParams.competitionKey, teamCompetitionOptions);
  const activeCompetitions = explicitlySelectedCompetitions.length > 0 ? explicitlySelectedCompetitions : selectedTeamId ? teamCompetitionOptions : [];
  const activeCompetitionKeys = activeCompetitions.map((competition) => competition.key);

  const playersResult = await buildMatchWindowRows({
    selectedLeagueId,
    selectedTeamId,
    competitionKeys: activeCompetitionKeys,
    position: selectedPosition,
    minMinutes: resolvedSearchParams.minMinutes,
    matchWindow,
    sort,
    page: requestedPage,
    pageSize
  });
  const players = playersResult.players;
  const windowSummary = playersResult.windowSummary;
  const paginationParams = {
    ...resolvedSearchParams,
    leagueId: selectedLeagueId,
    teamId: selectedTeamId,
    competitionKey: activeCompetitionKeys,
    position: selectedPosition ?? undefined,
    pageSize: String(pageSize)
  };

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <PageBreadcrumbs
        backHref="/machete/leagues"
        backLabel={<I18nText en="Back to Machete leagues" ru="Назад к лигам Machete" />}
        items={[
          { label: "Machete", href: "/machete/leagues" },
          { label: <I18nText en="Players" ru="Игроки" />, href: "/machete/players" }
        ]}
      />
      <div className="mt-5 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            <I18nText en="Machete player explorer" ru="Таблица игроков Machete" />
          </p>
          <h1 className="mt-2 text-3xl font-bold text-ink">
            <I18nText en="Sports.ru mapped players" ru="Игроки Sports.ru с маппингом" />
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-600">
            <I18nText
              en="Machete stats for players mapped to Sports.ru fantasy prices. Names and positions come from Sports.ru."
              ru="Machete-статы только для игроков, замапленных на цены Sports.ru. Имена и позиции берутся из Sports.ru."
            />
          </p>
        </div>
        <Link href="/machete/leagues" className="rounded bg-ink px-3 py-2 text-sm font-semibold text-white hover:bg-slate-700">
          <I18nText en="Back to Machete leagues" ru="Назад к лигам Machete" />
        </Link>
      </div>

      <AutoSubmitForm className="mt-8 grid grid-cols-1 gap-3 rounded border border-slate-200 bg-white p-4 shadow-soft md:grid-cols-2 xl:grid-cols-8">
        <label className="text-sm">
          <span className="mb-1 block font-medium text-slate-600"><I18nText en="League" ru="Лига" /></span>
          <select name="leagueId" defaultValue={selectedLeagueId} className="w-full rounded border border-slate-200 px-3 py-2">
            <LocalizedOption value="" en="Choose league" ru="Выберите лигу" />
            <LocalizedOption value={ALL_LEAGUES_VALUE} en="All loaded leagues" ru="Все загруженные лиги" />
            {sortedLeagues.map((league) => (
              <option key={`${league.leagueId}:${league.season}`} value={String(league.leagueId)}>
                {league.displayName} - {league.season}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <span className="mb-1 block font-medium text-slate-600"><I18nText en="Team" ru="Команда" /></span>
          <select name="teamId" defaultValue={selectedTeamId} disabled={!selectedLeagueId} className="w-full rounded border border-slate-200 px-3 py-2 disabled:bg-slate-100">
            <LocalizedOption value="" en="All teams" ru="Все команды" />
            {teamLeagues.flatMap((league) =>
              league.teams.map((team) => (
                <option key={`${league.leagueId}:${league.season}:${team.id}`} value={String(team.id)}>
                  {selectedLeagueId && selectedLeagueId !== ALL_LEAGUES_VALUE ? team.name : `${team.name} - ${league.displayName}`}
                </option>
              ))
            )}
          </select>
        </label>
        <label className="text-sm">
          <span className="mb-1 block font-medium text-slate-600"><I18nText en="Competition" ru="Турнир" /></span>
          <select
            name="competitionKey"
            multiple
            size={Math.min(4, Math.max(2, teamCompetitionOptions.length || 2))}
            defaultValue={activeCompetitionKeys}
            disabled={!selectedTeamId || teamCompetitionOptions.length === 0}
            className="w-full rounded border border-slate-200 px-3 py-2 disabled:bg-slate-100"
          >
            <LocalizedOption value="" disabled en="All loaded competitions by default" ru="По умолчанию все загруженные турниры" />
            {teamCompetitionOptions.map((competition) => (
              <option key={competition.key} value={competition.key}>
                {competition.displayName} - {competition.season} ({competition.matchesCount})
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <span className="mb-1 block font-medium text-slate-600"><I18nText en="Position" ru="Позиция" /></span>
          <select
            name="position"
            defaultValue={selectedPosition ?? ""}
            className="w-full rounded border border-slate-200 px-3 py-2"
          >
            <LocalizedOption value="" en="All Sports.ru positions" ru="Все позиции Sports.ru" />
            {POSITION_FILTERS.map((position) => (
              <option key={position} value={position}>
                {position}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <span className="mb-1 block font-medium text-slate-600"><I18nText en="Min minutes" ru="Мин. минуты" /></span>
          <input
            name="minMinutes"
            type="number"
            min="0"
            defaultValue={resolvedSearchParams.minMinutes ?? ""}
            className="w-full rounded border border-slate-200 px-3 py-2"
            placeholder="0"
          />
        </label>
        <label className="text-sm">
          <span className="mb-1 block font-medium text-slate-600"><I18nText en="Sort" ru="Сортировка" /></span>
          <select name="sort" defaultValue={sort} className="w-full rounded border border-slate-200 px-3 py-2">
            <LocalizedOption value="fantasyScore" en="Expected FP" ru="Прогноз FP" />
            <LocalizedOption value="scoringScore" en="Actual FP" ru="Реальные FP" />
            <LocalizedOption value="alternativeScore" en="Alt FP" ru="Альт. FP" />
            <LocalizedOption value="minutesPlayed" en="Minutes" ru="Минуты" />
            <LocalizedOption value="playerName" en="Player name" ru="Имя игрока" />
          </select>
        </label>
        <label className="text-sm">
          <span className="mb-1 block font-medium text-slate-600"><I18nText en="Stats window" ru="Окно статистики" /></span>
          <select name="matchWindow" defaultValue={matchWindowModeValue(matchWindow)} className="w-full rounded border border-slate-200 px-3 py-2">
            <LocalizedOption value="last5" en="Last 5 team matches" ru="Последние 5 матчей команды" />
            <LocalizedOption value="last10" en="Last 10 team matches" ru="Последние 10 матчей команды" />
            <LocalizedOption value="last15" en="Last 15 team matches" ru="Последние 15 матчей команды" />
            <LocalizedOption value="current" en="Current season" ru="Текущий сезон" />
            <LocalizedOption value="previous" en="Previous season" ru="Предыдущий сезон" />
            <LocalizedOption value="all" en="All loaded matches" ru="Все загруженные матчи" />
            <LocalizedOption value="custom" en="Custom team matches" ru="Свое число матчей команды" />
          </select>
          <input
            name="customMatches"
            type="number"
            min="1"
            max="50"
            defaultValue={resolvedSearchParams.customMatches ?? ""}
            className="mt-2 w-full rounded border border-slate-200 px-3 py-2"
            placeholder="Кол-во матчей"
          />
        </label>
        <label className="text-sm">
          <span className="mb-1 block font-medium text-slate-600"><I18nText en="Rows" ru="Строк" /></span>
          <select name="pageSize" defaultValue={String(pageSize)} className="w-full rounded border border-slate-200 px-3 py-2">
            {PAGE_SIZE_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>
      </AutoSubmitForm>

      <p className="mt-3 text-sm text-slate-500">
        <I18nText
          en={
            <>
              Stats and FP are recalculated from {matchWindowLabel(matchWindow)}
              {activeCompetitions.length > 0 ? ` in ${competitionSummary(activeCompetitions)}` : ""}.
              {windowSummary ? ` Official matches in window: ${windowSummary.officialMatches}; with parsed player stats: ${windowSummary.matchesWithPlayerStats}.` : ""}
            </>
          }
          ru={
            <>
              Статистика и FP пересчитаны по окну «{matchWindowLabelRu(matchWindow)}»
              {activeCompetitions.length > 0 ? ` в турнирах: ${competitionSummary(activeCompetitions)}` : ""}.
              {windowSummary ? ` Официальных матчей в окне: ${windowSummary.officialMatches}; с распарсенной статистикой игроков: ${windowSummary.matchesWithPlayerStats}.` : ""}
            </>
          }
        />
      </p>

      <section className="mt-6">
        {selectedLeagueId ? (
          <>
            <div className="mb-3 flex flex-col gap-2 text-sm text-slate-500 sm:flex-row sm:items-center sm:justify-between">
              <span>
                <I18nText
                  en={`Showing ${playersResult.from}-${playersResult.to} of ${playersResult.total} players.`}
                  ru={`Показаны ${playersResult.from}-${playersResult.to} из ${playersResult.total} игроков.`}
                />
              </span>
              <PaginationLinks page={playersResult.page} pageCount={playersResult.pageCount} params={paginationParams} />
            </div>
            <MachetePlayerTable players={players} showContext />
            <div className="mt-4 flex justify-end">
              <PaginationLinks page={playersResult.page} pageCount={playersResult.pageCount} params={paginationParams} />
            </div>
          </>
        ) : (
          <div className="rounded border border-dashed border-slate-300 bg-white p-10 text-center text-slate-500">
            <I18nText
              en="Choose a league above to load Sports.ru mapped players."
              ru="Выберите лигу выше, чтобы загрузить замапленных игроков Sports.ru."
            />
          </div>
        )}
      </section>
    </main>
  );
}

async function buildMatchWindowRows({
  selectedLeagueId,
  selectedTeamId,
  competitionKeys,
  position,
  minMinutes,
  matchWindow,
  sort,
  page,
  pageSize
}: {
  selectedLeagueId: string;
  selectedTeamId: string;
  competitionKeys: string[];
  position: PositionFilter | null;
  minMinutes?: string;
  matchWindow: MacheteMatchWindow;
  sort: string;
  page: number;
  pageSize: number;
}) {
  if (!selectedLeagueId) {
    return {
      ...emptyPagedPlayers(page, pageSize),
      windowSummary: null
    };
  }

  const scopes = await buildPlayerScopes(selectedLeagueId, selectedTeamId, competitionKeys);
  const combineTeamCompetitions = competitionKeys.length > 1;
  const [rawRows, windowSummary, sportsPriceRefs] = await Promise.all([
    loadSharedMachetePlayerRows(prisma, {
      scopes,
      minMinutes,
      matchWindow,
      combineTeamCompetitions
    }),
    loadSharedMatchWindowSummary(prisma, scopes, matchWindow, combineTeamCompetitions),
    loadSportsRuFantasyPriceRefsByScopedPlayer(prisma, { scopes })
  ]);
  const rows = sortSharedMacheteRows(applySportsRuMappedPlayerRows(rawRows, sportsPriceRefs, position), sort);

  return {
    ...paginateRows(rows, page, pageSize),
    windowSummary
  };
}

async function buildPlayerScopes(selectedLeagueId: string, selectedTeamId: string, competitionKeys: string[]): Promise<SharedPlayerRowsScope[]> {
  const teamId = parseSharedBigInt(selectedTeamId);
  const competitions = competitionKeys.map(parseSharedCompetitionKey).filter((competition): competition is { leagueId: bigint; season: string } => Boolean(competition));
  if (teamId && competitions.length > 0) {
    return competitions.map((competition) => ({ leagueId: competition.leagueId, season: competition.season, teamId }));
  }

  if (teamId) {
    const competitionsForTeam = await loadSharedTeamCompetitionOptions(prisma, teamId);
    if (competitionsForTeam.length > 0) {
      return competitionsForTeam.map((competition) => ({ leagueId: competition.leagueId, season: competition.season, teamId }));
    }
  }

  const leagues = await loadSharedLeagueOptions(prisma);
  const selectedLeagues =
    selectedLeagueId === ALL_LEAGUES_VALUE ? leagues : leagues.filter((league) => String(league.leagueId) === selectedLeagueId);

  return selectedLeagues.map((league) => ({
    leagueId: league.leagueId,
    season: league.season,
    teamId
  }));
}

async function loadTeamLeagueOptions(leagues: SharedLeagueSeasonOption[], selectedLeagueId: string) {
  const selectedLeagues =
    selectedLeagueId === ALL_LEAGUES_VALUE ? leagues : selectedLeagueId ? leagues.filter((league) => String(league.leagueId) === selectedLeagueId) : [];

  return Promise.all(
    selectedLeagues.map(async (league) => ({
      ...league,
      teams: await loadSharedLeagueTeams(prisma, league.leagueId, league.season)
    }))
  ) as Promise<Array<SharedLeagueSeasonOption & { teams: SharedTeamOption[] }>>;
}

function selectedTeamCompetitionOptions(value: SearchParamValue, options: SharedTeamCompetitionOption[]) {
  const requestedKeys = new Set(searchParamValues(value));
  if (requestedKeys.size === 0) return [];
  return options.filter((option) => requestedKeys.has(option.key));
}

function searchParamValues(value: SearchParamValue) {
  return (Array.isArray(value) ? value : [value]).filter((item): item is string => Boolean(item));
}

function competitionSummary(competitions: SharedTeamCompetitionOption[]) {
  if (competitions.length <= 2) return competitions.map(competitionLabel).join(" + ");
  return `${competitions.slice(0, 2).map(competitionLabel).join(" + ")} +${competitions.length - 2}`;
}

function competitionLabel(competition: SharedTeamCompetitionOption) {
  return `${competition.displayName} ${competition.season}`;
}

function applySportsRuMappedPlayerRows(
  rows: SharedMachetePlayerRow[],
  sportsPriceRefs: Map<string, SportsRuFantasyPriceRef>,
  position: PositionFilter | null
) {
  return rows.flatMap((row) => {
    const sportsRef = sportsRuPriceRefForMacheteRow(row.id, sportsPriceRefs);
    if (!sportsRef) return [];

    const sportsPositionGroup = normalizeFantasyPosition(sportsRef.position);
    const rowPositionGroup = normalizeFantasyPosition(row.position);
    const positionGroup = sportsPositionGroup !== "UNK" ? sportsPositionGroup : rowPositionGroup;
    if (position && positionGroup !== position) return [];

    return [
      {
        ...row,
        name: sportsRef.playerName,
        position: sportsRef.position ?? (positionGroup === "UNK" ? row.position : positionGroup)
      }
    ];
  });
}

function sportsRuPriceRefForMacheteRow(rowId: string, sportsPriceRefs: Map<string, SportsRuFantasyPriceRef>) {
  for (const key of sportsRuScopeKeysForMacheteRowId(rowId)) {
    const ref = sportsPriceRefs.get(key);
    if (ref) return ref;
  }
  return null;
}

function sportsRuScopeKeysForMacheteRowId(rowId: string) {
  if (rowId.startsWith("combined:")) return combinedSportsRuScopeKeysForMacheteRowId(rowId);

  const [leagueId, season, , playerId] = rowId.split(":");
  if (!leagueId || !season || !playerId) return [];
  return [sportsRuFantasyPriceScopeKey(leagueId, season, playerId)];
}

function combinedSportsRuScopeKeysForMacheteRowId(rowId: string) {
  const value = rowId.slice("combined:".length);
  const teamSeparatorIndex = value.indexOf(":");
  if (teamSeparatorIndex < 0) return [];

  const afterTeam = value.slice(teamSeparatorIndex + 1);
  const playerSeparatorIndex = afterTeam.indexOf(":");
  if (playerSeparatorIndex < 0) return [];

  const playerId = afterTeam.slice(0, playerSeparatorIndex);
  const competitions = afterTeam.slice(playerSeparatorIndex + 1).split("|");
  return competitions.flatMap((competition) => {
    const parsed = parseSharedCompetitionKey(competition);
    return parsed ? [sportsRuFantasyPriceScopeKey(parsed.leagueId, parsed.season, playerId)] : [];
  });
}

function parsePositionFilter(value: string | undefined): PositionFilter | null {
  const position = normalizeFantasyPosition(value);
  return position === "UNK" ? null : position;
}

function parsePositiveInt(value: string | undefined, fallback: number) {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parsePageSize(value: string | undefined) {
  const parsed = parsePositiveInt(value, DEFAULT_PAGE_SIZE);
  return PAGE_SIZE_OPTIONS.includes(parsed as (typeof PAGE_SIZE_OPTIONS)[number]) ? parsed : DEFAULT_PAGE_SIZE;
}

function paginateRows<T>(rows: T[], requestedPage: number, pageSize: number) {
  const total = rows.length;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(Math.max(1, requestedPage), pageCount);
  const offset = (page - 1) * pageSize;
  const players = rows.slice(offset, offset + pageSize);

  return {
    players,
    total,
    page,
    pageSize,
    pageCount,
    from: total === 0 ? 0 : offset + 1,
    to: Math.min(offset + players.length, total)
  };
}

function emptyPagedPlayers(page: number, pageSize: number) {
  return paginateRows([], page, pageSize);
}

function PaginationLinks({
  page,
  pageCount,
  params
}: {
  page: number;
  pageCount: number;
  params: SearchParams;
}) {
  if (pageCount <= 1) return null;

  return (
    <div className="flex items-center gap-2">
      <Link
        href={machetePlayersHref(params, page - 1)}
        aria-disabled={page <= 1}
        className={`rounded border px-3 py-1.5 font-medium ${
          page <= 1 ? "pointer-events-none border-slate-200 text-slate-300" : "border-slate-200 text-slate-700 hover:bg-slate-50"
        }`}
      >
        Prev
      </Link>
      <span className="text-slate-500">
        {page} / {pageCount}
      </span>
      <Link
        href={machetePlayersHref(params, page + 1)}
        aria-disabled={page >= pageCount}
        className={`rounded border px-3 py-1.5 font-medium ${
          page >= pageCount ? "pointer-events-none border-slate-200 text-slate-300" : "border-slate-200 text-slate-700 hover:bg-slate-50"
        }`}
      >
        Next
      </Link>
    </div>
  );
}

function machetePlayersHref(params: SearchParams, page: number) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (key === "page") continue;
    for (const item of searchParamValues(value)) {
      query.append(key, item);
    }
  }
  query.set("page", String(page));
  return `/machete/players?${query.toString()}`;
}
