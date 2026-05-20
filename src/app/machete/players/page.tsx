import Link from "next/link";

import { I18nText } from "@/components/i18n-text";
import { MachetePlayerTable } from "@/components/machete/MachetePlayerTable";
import { PageBreadcrumbs } from "@/components/page-breadcrumbs";
import { AutoSubmitForm } from "@/components/players/auto-submit-form";
import { prisma } from "@/lib/db";
import { matchWindowLabel, matchWindowModeValue, parseMacheteMatchWindow, type MacheteMatchWindow } from "@/scoring/machete/match-window";
import {
  loadSharedLeagueOptions,
  loadSharedLeagueTeams,
  loadSharedMachetePlayerRows,
  loadSharedTeamCompetitionOptions,
  parseSharedCompetitionKey,
  parseSharedBigInt,
  sharedCompetitionKey,
  sortSharedMacheteRows,
  type SharedLeagueSeasonOption,
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
  const matchWindow = parseMacheteMatchWindow({
    mode: resolvedSearchParams.matchWindow,
    customMatches: resolvedSearchParams.customMatches,
    legacyRecentMatches: resolvedSearchParams.recentMatches
  });
  const selectedTeamBigInt = parseSharedBigInt(selectedTeamId);
  const teamCompetitionOptions = selectedTeamBigInt ? await loadSharedTeamCompetitionOptions(prisma, selectedTeamBigInt) : [];
  const selectedCompetitions = selectedTeamCompetitionOptions(resolvedSearchParams.competitionKey, teamCompetitionOptions);
  const selectedCompetitionKeys = selectedCompetitions.map((competition) => competition.key);
  const checkedCompetitionKeys =
    selectedCompetitionKeys.length > 0 ? selectedCompetitionKeys : defaultCompetitionKeysForSelectedLeague(selectedLeagueId, sortedLeagues, teamCompetitionOptions);

  const playersResult = await buildMatchWindowRows({
    selectedLeagueId,
    selectedTeamId,
    competitionKeys: selectedCompetitionKeys,
    position: resolvedSearchParams.position,
    minMinutes: resolvedSearchParams.minMinutes,
    matchWindow,
    sort,
    page: requestedPage,
    pageSize
  });
  const players = playersResult.players;
  const paginationParams = {
    ...resolvedSearchParams,
    leagueId: selectedLeagueId,
    teamId: selectedTeamId,
    competitionKey: selectedCompetitionKeys,
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
            <I18nText en="FotMob players" ru="Игроки FotMob" />
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-600">
            <I18nText
              en="Shared FotMob rosters with Expected FP, Actual FP and Alt FP recalculated from normalized match stats."
              ru="Общие составы FotMob с Expected FP, Реальными FP и Alt FP, пересчитанными из нормализованной статистики матчей."
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
            <option value="">Choose league / Выберите лигу</option>
            <option value={ALL_LEAGUES_VALUE}>All loaded leagues / Все загруженные лиги</option>
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
            <option value="">All teams / Все команды</option>
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
            defaultValue={checkedCompetitionKeys}
            disabled={!selectedTeamId || teamCompetitionOptions.length === 0}
            className="w-full rounded border border-slate-200 px-3 py-2 disabled:bg-slate-100"
          >
            <option value="" disabled>Selected league / Текущая лига</option>
            {teamCompetitionOptions.map((competition) => (
              <option key={competition.key} value={competition.key}>
                {competition.displayName} - {competition.season} ({competition.matchesCount})
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <span className="mb-1 block font-medium text-slate-600"><I18nText en="Position" ru="Позиция" /></span>
          <input
            name="position"
            defaultValue={resolvedSearchParams.position ?? ""}
            className="w-full rounded border border-slate-200 px-3 py-2"
            placeholder="Defender"
          />
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
            <option value="fantasyScore">Expected FP / Прогноз FP</option>
            <option value="scoringScore">Actual FP / Реальные FP</option>
            <option value="alternativeScore">Alt FP / Альт. FP</option>
            <option value="minutesPlayed">Minutes / Минуты</option>
            <option value="playerName">Player name / Имя игрока</option>
          </select>
        </label>
        <label className="text-sm">
          <span className="mb-1 block font-medium text-slate-600"><I18nText en="Stats window" ru="Окно статистики" /></span>
          <select name="matchWindow" defaultValue={matchWindowModeValue(matchWindow)} className="w-full rounded border border-slate-200 px-3 py-2">
            <option value="last5">Last 5 team matches</option>
            <option value="last10">Last 10 team matches</option>
            <option value="last15">Last 15 team matches</option>
            <option value="current">Current season</option>
            <option value="previous">Previous season</option>
            <option value="all">All loaded matches</option>
            <option value="custom">Custom team matches</option>
          </select>
          <input
            name="customMatches"
            type="number"
            min="1"
            max="50"
            defaultValue={resolvedSearchParams.customMatches ?? ""}
            className="mt-2 w-full rounded border border-slate-200 px-3 py-2"
            placeholder="Custom N"
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
        Stats and FP are recalculated from {matchWindowLabel(matchWindow)}
        {selectedCompetitions.length > 0 ? ` in ${competitionSummary(selectedCompetitions)}` : ""}.
      </p>

      <section className="mt-6">
        {selectedLeagueId ? (
          <>
            <div className="mb-3 flex flex-col gap-2 text-sm text-slate-500 sm:flex-row sm:items-center sm:justify-between">
              <span>
                Showing {playersResult.from}-{playersResult.to} of {playersResult.total} players.
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
              en="Choose a league above to load players. The page no longer loads every FotMob player on first open."
              ru="Выберите лигу выше, чтобы загрузить игроков. Страница больше не грузит всех игроков FotMob при открытии."
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
  position?: string;
  minMinutes?: string;
  matchWindow: MacheteMatchWindow;
  sort: string;
  page: number;
  pageSize: number;
}) {
  if (!selectedLeagueId) {
    return emptyPagedPlayers(page, pageSize);
  }

  const scopes = await buildPlayerScopes(selectedLeagueId, selectedTeamId, competitionKeys);
  const rows = sortSharedMacheteRows(
    await loadSharedMachetePlayerRows(prisma, {
      scopes,
      position,
      minMinutes,
      matchWindow,
      combineTeamCompetitions: competitionKeys.length > 1
    }),
    sort
  );

  return paginateRows(rows, page, pageSize);
}

async function buildPlayerScopes(selectedLeagueId: string, selectedTeamId: string, competitionKeys: string[]): Promise<SharedPlayerRowsScope[]> {
  const teamId = parseSharedBigInt(selectedTeamId);
  const competitions = competitionKeys.map(parseSharedCompetitionKey).filter((competition): competition is { leagueId: bigint; season: string } => Boolean(competition));
  if (teamId && competitions.length > 0) {
    return competitions.map((competition) => ({ leagueId: competition.leagueId, season: competition.season, teamId }));
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

function defaultCompetitionKeysForSelectedLeague(
  selectedLeagueId: string,
  leagues: SharedLeagueSeasonOption[],
  options: SharedTeamCompetitionOption[]
) {
  if (!selectedLeagueId || selectedLeagueId === ALL_LEAGUES_VALUE) return [];
  const selectedLeague = leagues.find((league) => String(league.leagueId) === selectedLeagueId);
  if (!selectedLeague) return [];
  const key = sharedCompetitionKey(selectedLeague.leagueId, selectedLeague.season);
  return options.some((option) => option.key === key) ? [key] : [];
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
