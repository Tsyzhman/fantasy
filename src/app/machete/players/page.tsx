import type { ReactNode } from "react";
import Link from "next/link";

import { BetaJourneyMarker } from "@/components/beta/BetaJourneyMarker";
import { PlayerCompareDock, PlayerCompareProvider, PlayerCompareToggle } from "@/components/compare/player-compare";
import { I18nText } from "@/components/i18n-text";
import { LocalizedOption } from "@/components/localized-option";
import { LocalizedNumberInput } from "@/components/ui/localized-number-input";
import { MachetePlayerTable } from "@/components/machete/MachetePlayerTable";
import { PageBreadcrumbs } from "@/components/page-breadcrumbs";
import { AutoSubmitForm } from "@/components/players/auto-submit-form";
import { PlayerSavedViews } from "@/components/players/player-saved-views";
import { PlayerWatchlistPanel } from "@/components/players/player-watchlist";
import { ActiveFilterChips, type ActiveFilterChip } from "@/components/ui/active-filter-chips";
import { CompetitionCheckboxList } from "@/components/ui/competition-checkbox-list";
import { EmptyState } from "@/components/ui/empty-state";
import { FilterShell } from "@/components/ui/filter-shell";
import { ResultsToolbar } from "@/components/ui/results-toolbar";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { NULL_GLYPH, formatNumber } from "@/lib/format";
import { matchWindowLabel, matchWindowLabelRu, matchWindowModeValue, parseMacheteMatchWindow, type MacheteMatchWindow } from "@/scoring/machete/match-window";
import { normalizeFantasyPosition, type FantasyPositionGroup } from "@/machete/squad_logic";
import { loadSportsRuFantasyPriceRefsByScopedPlayer, sportsRuFantasyPriceScopeKey, type SportsRuFantasyPriceRef } from "@/machete/squad_planner";
import { applyFantasyPlayerIdentityRows, filterFantasyPlayerIdentityRows } from "@/machete/player_identity";
import { playerLeagueScopes } from "@/machete/player_scopes";
import { loadPlannerReadinessByScope, selectPlannerSeason } from "@/machete/planner_readiness";
import {
  loadSharedLeagueOptions,
  loadSharedLeagueSeasonOptions,
  loadSharedLeagueTeams,
  loadSharedMachetePlayerRows,
  loadSharedMatchWindowSummary,
  loadSharedTeamCompetitionOptions,
  parseSharedCompetitionKey,
  parseSharedBigInt,
  sortSharedMacheteRows,
  type SharedLeagueSeasonOption,
  type SharedPlayerRowsScope,
  type SharedTeamCompetitionOption,
  type SharedTeamOption
} from "@/machete/shared_read_model";

export const dynamic = "force-dynamic";

type SearchParams = {
  leagueId?: string;
  season?: string;
  teamId?: string;
  competitionKey?: SearchParamValue;
  position?: string;
  query?: string;
  starterFilter?: string;
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
  const [loadedLeagues, leagueSeasonOptions, currentUser] = await Promise.all([
    loadSharedLeagueOptions(prisma),
    loadSharedLeagueSeasonOptions(prisma),
    getCurrentUser()
  ]);
  const readinessByScope = await loadPlannerReadinessByScope(prisma, leagueSeasonOptions);
  const sortedLeagues = loadedLeagues.flatMap((league) => {
    const seasons = leagueSeasonOptions.filter((option) => option.leagueId === league.leagueId);
    const selected = selectPlannerSeason(undefined, seasons, readinessByScope).option;
    return selected ? [selected] : [];
  });
  const requestedLeagueId = resolvedSearchParams.leagueId ?? ALL_LEAGUES_VALUE;
  const selectedLeagueId =
    requestedLeagueId === ALL_LEAGUES_VALUE || sortedLeagues.some((league) => String(league.leagueId) === requestedLeagueId) ? requestedLeagueId : "";
  const seasonsForSelectedLeague =
    selectedLeagueId && selectedLeagueId !== ALL_LEAGUES_VALUE
      ? leagueSeasonOptions.filter((league) => String(league.leagueId) === selectedLeagueId)
      : [];
  const selectedSeason =
    selectedLeagueId && selectedLeagueId !== ALL_LEAGUES_VALUE
      ? selectPlannerSeason(resolvedSearchParams.season, seasonsForSelectedLeague, readinessByScope).option?.season ?? ""
      : "";
  const teamLeagues = await loadTeamLeagueOptions(sortedLeagues, leagueSeasonOptions, selectedLeagueId, selectedSeason);
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
  const starterFilter = parseStarterFilter(resolvedSearchParams.starterFilter);
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
    selectedSeason,
    selectedTeamId,
    competitionKeys: activeCompetitionKeys,
    position: selectedPosition,
    query: resolvedSearchParams.query,
    starterFilter,
    minMinutes: resolvedSearchParams.minMinutes,
    matchWindow,
    sort,
    page: requestedPage,
    pageSize,
    readyLeagueScopes: sortedLeagues,
    leagueSeasonOptions,
    userId: currentUser?.id
  });
  const players = playersResult.players;
  const windowSummary = playersResult.windowSummary;
  const paginationParams = {
    ...resolvedSearchParams,
    leagueId: selectedLeagueId,
    season: selectedSeason || undefined,
    teamId: selectedTeamId,
    competitionKey: activeCompetitionKeys,
    position: selectedPosition ?? undefined,
    starterFilter: starterFilter || undefined,
    pageSize: String(pageSize)
  };
  const scopeTeamCount = teamLeagues.reduce((total, league) => total + league.teams.length, 0);
  const windowMatchesLabel = windowSummary
    ? `${formatNumber(windowSummary.matchesWithPlayerStats)} / ${formatNumber(windowSummary.officialMatches)}`
    : NULL_GLYPH;
  const squadHref =
    selectedLeagueId && selectedLeagueId !== ALL_LEAGUES_VALUE
      ? `/machete/squad?leagueId=${encodeURIComponent(selectedLeagueId)}${selectedSeason ? `&season=${encodeURIComponent(selectedSeason)}` : ""}`
      : "/machete/squad";

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      {resolvedSearchParams.query?.trim() &&
      players.some((player) => player.fantasyScore !== null) ? (
        <BetaJourneyMarker milestone="PLAYER_FORECAST_FOUND" />
      ) : null}
      <PageBreadcrumbs
        backHref="/machete/leagues"
        backLabel={<I18nText en="Back to Machete leagues" ru="Назад к лигам Machete" />}
        items={[
          { label: "Machete", href: "/machete/leagues" },
          { label: <I18nText en="Players" ru="Игроки" />, href: "/machete/players" }
        ]}
      />
      <div className="mt-5">
        <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          <I18nText en="Machete player explorer" ru="Таблица игроков Machete" />
        </p>
        <h1 className="mt-2 text-3xl font-bold text-ink">
          <I18nText en="Player search and forecasts" ru="Поиск игроков и прогнозы" />
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-slate-600">
          <I18nText
            en="Search real FotMob players and compare recalculated Machete forecasts. Sports.ru names and positions are used when a verified mapping exists."
            ru="Ищите реальных игроков FotMob и сравнивайте пересчитанные прогнозы Machete. Имена и позиции Sports.ru используются только при подтверждённом сопоставлении."
          />
        </p>
      </div>

      <FilterShell
        className="mt-8"
        title={<I18nText en="Player filters" ru="Фильтры игроков" />}
        description={<I18nText en="Choose the working scope first; detailed filters refine the table without a separate apply button." ru="Сначала выберите рабочий скоуп; дополнительные фильтры сразу уточняют таблицу." />}
        resetHref="/machete/players"
      >
      <AutoSubmitForm className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-12">
        <label className="text-sm md:col-span-2 xl:col-span-2">
          <span className="mb-1 block font-medium text-slate-600"><I18nText en="Player search" ru="Поиск игрока" /></span>
          <input
            type="search"
            name="query"
            defaultValue={resolvedSearchParams.query ?? ""}
            data-auto-submit-delay="200"
            autoComplete="off"
            className="w-full rounded border border-slate-200 px-3 py-2"
          />
        </label>
        <label className="text-sm">
          <span className="mb-1 block font-medium text-slate-600"><I18nText en="League" ru="Лига" /></span>
          <select name="leagueId" defaultValue={selectedLeagueId} className="w-full rounded border border-slate-200 px-3 py-2">
            <LocalizedOption value="" en="Choose league" ru="Выберите лигу" />
            <LocalizedOption value={ALL_LEAGUES_VALUE} en="All loaded leagues" ru="Все загруженные лиги" />
            {sortedLeagues.map((league) => (
              <option key={String(league.leagueId)} value={String(league.leagueId)}>
                {league.displayName}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <span className="mb-1 block font-medium text-slate-600"><I18nText en="Season" ru="Сезон" /></span>
          <select
            name="season"
            defaultValue={selectedSeason}
            disabled={!selectedLeagueId || selectedLeagueId === ALL_LEAGUES_VALUE}
            className="w-full rounded border border-slate-200 px-3 py-2 disabled:bg-slate-100"
          >
            <LocalizedOption
              value=""
              en={selectedLeagueId === ALL_LEAGUES_VALUE ? "Latest per league" : "Choose league first"}
              ru={selectedLeagueId === ALL_LEAGUES_VALUE ? "Последний по каждой лиге" : "Сначала выберите лигу"}
            />
            {seasonsForSelectedLeague.map((league) => (
              <option key={`${league.leagueId}:${league.season}`} value={league.season}>
                {league.season}{league.isCurrent ? " · current" : ""}
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
        <fieldset className="text-sm md:col-span-2 xl:col-span-2">
          <legend className="mb-1 block font-medium text-slate-600"><I18nText en="Competitions" ru="Турниры" /></legend>
          <CompetitionCheckboxList
            name="competitionKey"
            selectedKeys={activeCompetitionKeys}
            emptyLabel={<I18nText en="Choose a team to filter by competition." ru="Выберите команду, чтобы фильтровать по турнирам." />}
            options={teamCompetitionOptions.map((competition) => ({
              key: competition.key,
              label: `${competition.displayName} - ${competition.season}`,
              description: <I18nText en={`${competition.matchesCount} matches`} ru={`Матчей: ${competition.matchesCount}`} />,
              disabled: !selectedTeamId
            }))}
          />
        </fieldset>
        <label className="text-sm">
          <span className="mb-1 block font-medium text-slate-600"><I18nText en="Position" ru="Позиция" /></span>
          <select
            name="position"
            defaultValue={selectedPosition ?? ""}
            className="w-full rounded border border-slate-200 px-3 py-2"
          >
            <LocalizedOption value="" en="All" ru="Все" />
            {POSITION_FILTERS.map((position) => (
              <option key={position} value={position}>
                {position}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <span className="mb-1 block font-medium text-slate-600"><I18nText en="Starter status" ru="Статус старта" /></span>
          <select name="starterFilter" defaultValue={starterFilter} className="w-full rounded border border-slate-200 px-3 py-2">
            <LocalizedOption value="" en="All players" ru="Все игроки" />
            <LocalizedOption value="starter" en="In starting XI" ru="В старте" />
            <LocalizedOption value="bench" en="Not in starting XI" ru="Не в старте" />
          </select>
        </label>
        <label className="text-sm">
          <span className="mb-1 block font-medium text-slate-600"><I18nText en="Min minutes" ru="Мин. минуты" /></span>
          <LocalizedNumberInput
            name="minMinutes"
            min={0}
            defaultValue={resolvedSearchParams.minMinutes ?? ""}
            placeholderEn="0"
            placeholderRu="0"
          />
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
          {matchWindowModeValue(matchWindow) === "custom" ? (
            <LocalizedNumberInput
              name="customMatches"
              min={1}
              max={50}
              defaultValue={resolvedSearchParams.customMatches ?? ""}
              placeholderEn="Number of matches"
              placeholderRu="Кол-во матчей"
              className="mt-2"
            />
          ) : null}
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
      </FilterShell>

      <ActiveFilterChips
        className="mt-3"
        resetHref="/machete/players"
        chips={buildMacheteActiveChips({
          allLeagues: sortedLeagues,
          seasonsForSelectedLeague,
          teamLeagues,
          activeCompetitions,
          selectedLeagueId,
          selectedSeason,
          selectedTeamId,
          query: resolvedSearchParams.query,
          selectedPosition,
          starterFilter,
          minMinutes: resolvedSearchParams.minMinutes,
          matchWindow,
          searchParams: resolvedSearchParams
        })}
      />

      <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MacheteScopeStat
          label={<I18nText en="Players" ru="Игроки" />}
          value={formatNumber(playersResult.total)}
          detail={
            <I18nText
              en={`${formatNumber(playersResult.sportsRuMappedCount)} Sports.ru · ${formatNumber(playersResult.fotMobFallbackCount)} FotMob`}
              ru={`${formatNumber(playersResult.sportsRuMappedCount)} Sports.ru · ${formatNumber(playersResult.fotMobFallbackCount)} FotMob`}
            />
          }
        />
        <MacheteScopeStat
          label={<I18nText en="Teams" ru="Команды" />}
          value={formatNumber(scopeTeamCount)}
          detail={selectedLeagueId === ALL_LEAGUES_VALUE ? <I18nText en="All loaded leagues" ru="Все загруженные лиги" /> : selectedSeason || NULL_GLYPH}
        />
        <MacheteScopeStat
          label={<I18nText en="Competitions" ru="Турниры" />}
          value={activeCompetitions.length > 0 ? formatNumber(activeCompetitions.length) : <I18nText en="All" ru="Все" />}
          detail={selectedTeamId ? <I18nText en="Team scope" ru="Область команды" /> : <I18nText en="League scope" ru="Область лиги" />}
        />
        <MacheteScopeStat
          label={<I18nText en="Parsed matches" ru="Матчи со статами" />}
          value={windowMatchesLabel}
          detail={matchWindowLabel(matchWindow)}
        />
      </div>

      {playersResult.fotMobFallbackCount > 0 ? (
        <div role="status" className="mt-3 rounded border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          <I18nText
            en={`${formatNumber(playersResult.fotMobFallbackCount)} players are shown with FotMob identities because no verified Sports.ru mapping is available for them. Forecasts use real Machete data; the squad planner marks unavailable official prices as estimates.`}
            ru={`${formatNumber(playersResult.fotMobFallbackCount)} игроков показаны с идентификаторами FotMob, потому что для них нет подтверждённого сопоставления Sports.ru. Прогнозы рассчитаны на реальных данных Machete; в сборщике отсутствующие официальные цены явно отмечены как оценочные.`}
          />
        </div>
      ) : null}

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

      <PlayerCompareProvider source="machete">
        {selectedLeagueId ? (
          <>
            <ResultsToolbar
              className="mt-5"
              title={<I18nText en={`Showing ${playersResult.from}-${playersResult.to} of ${playersResult.total} players`} ru={`Показаны ${playersResult.from}-${playersResult.to} из ${playersResult.total} игроков`} />}
              meta={<I18nText en={`Sorted by ${macheteSortLabel(sort)}; window ${matchWindowLabel(matchWindow)}.`} ru={`Сортировка: ${macheteSortLabel(sort)}; окно ${matchWindowLabelRu(matchWindow)}.`} />}
              resetHref="/machete/players"
            >
              <PlayerSavedViews source="machete" />
              <PlayerWatchlistPanel source="machete" />
              <PlayerCompareToggle />
              <Link href={squadHref} className="rounded bg-emerald-700 px-3 py-1.5 font-semibold text-white hover:bg-emerald-800">
                <I18nText en="Build squad" ru="Собрать состав" />
              </Link>
              <PaginationLinks page={playersResult.page} pageCount={playersResult.pageCount} params={paginationParams} />
            </ResultsToolbar>
            <PlayerCompareDock />
          </>
        ) : null}

        <section className="mt-6">
          {selectedLeagueId ? (
            <>
              <MachetePlayerTable players={players} showContext showStarterStatus serverSortParam="sort" defaultSort={sort} />
              <div className="mt-4 flex justify-end">
                <PaginationLinks page={playersResult.page} pageCount={playersResult.pageCount} params={paginationParams} />
              </div>
            </>
          ) : (
            <EmptyState
              title={<I18nText en="Choose a league" ru="Выберите лигу" />}
              description={<I18nText en="After that the table will load real FotMob players, verified Sports.ru identities where available, and recalculated Machete forecasts." ru="После этого таблица загрузит реальных игроков FotMob, подтверждённые идентификаторы Sports.ru при их наличии и пересчитанные прогнозы Machete." />}
            />
          )}
        </section>
      </PlayerCompareProvider>
    </main>
  );
}

function MacheteScopeStat({
  label,
  value,
  detail
}: {
  label: ReactNode;
  value: ReactNode;
  detail?: ReactNode;
}) {
  return (
    <dl className="rounded border border-slate-200 bg-white px-3 py-2 shadow-soft">
      <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="mt-1 text-xl font-bold text-ink num-tabular">{value}</dd>
      {detail ? <dd className="mt-1 truncate text-xs text-slate-500">{detail}</dd> : null}
    </dl>
  );
}

async function buildMatchWindowRows({
  selectedLeagueId,
  selectedSeason,
  selectedTeamId,
  competitionKeys,
  position,
  query,
  starterFilter,
  minMinutes,
  matchWindow,
  sort,
  page,
  pageSize,
  readyLeagueScopes,
  leagueSeasonOptions,
  userId
}: {
  selectedLeagueId: string;
  selectedSeason: string;
  selectedTeamId: string;
  competitionKeys: string[];
  position: PositionFilter | null;
  query?: string;
  starterFilter: ReturnType<typeof parseStarterFilter>;
  minMinutes?: string;
  matchWindow: MacheteMatchWindow;
  sort: string;
  page: number;
  pageSize: number;
  readyLeagueScopes: SharedLeagueSeasonOption[];
  leagueSeasonOptions: SharedLeagueSeasonOption[];
  userId?: string;
}) {
  if (!selectedLeagueId) {
    return {
      ...emptyPagedPlayers(page, pageSize),
      windowSummary: null,
      sportsRuMappedCount: 0,
      fotMobFallbackCount: 0
    };
  }

  const scopes = await buildPlayerScopes(
    selectedLeagueId,
    selectedSeason,
    selectedTeamId,
    competitionKeys,
    readyLeagueScopes,
    leagueSeasonOptions
  );
  const combineTeamCompetitions = competitionKeys.length > 1;
  const [rawRows, windowSummary, sportsPriceRefs] = await Promise.all([
    loadSharedMachetePlayerRows(prisma, {
      scopes,
      position: position ?? undefined,
      minMinutes,
      matchWindow,
      combineTeamCompetitions,
      userId
    }),
    loadSharedMatchWindowSummary(prisma, scopes, matchWindow, combineTeamCompetitions),
    loadSportsRuFantasyPriceRefsByScopedPlayer(prisma, { scopes })
  ]);
  const identityRows = applyFantasyPlayerIdentityRows(
    rawRows,
    (rowId) => sportsRuPriceRefForMacheteRow(rowId, sportsPriceRefs),
    position
  );
  const rows = sortSharedMacheteRows(filterFantasyPlayerIdentityRows(filterByStarter(identityRows, starterFilter), query), sort);
  const sportsRuMappedCount = rows.filter((row) => row.fantasyIdentitySource === "sports-ru").length;
  const fotMobFallbackCount = rows.length - sportsRuMappedCount;

  return {
    ...paginateRows(rows, page, pageSize),
    windowSummary,
    sportsRuMappedCount,
    fotMobFallbackCount
  };
}

async function buildPlayerScopes(
  selectedLeagueId: string,
  selectedSeason: string,
  selectedTeamId: string,
  competitionKeys: string[],
  readyLeagueScopes: SharedLeagueSeasonOption[],
  leagueSeasonOptions: SharedLeagueSeasonOption[]
): Promise<SharedPlayerRowsScope[]> {
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

  return playerLeagueScopes({ selectedLeagueId, selectedSeason, readyLeagueScopes, leagueSeasonOptions })
    .map((scope) => ({ ...scope, teamId }));
}

async function loadTeamLeagueOptions(
  leagues: SharedLeagueSeasonOption[],
  leagueSeasonOptions: SharedLeagueSeasonOption[],
  selectedLeagueId: string,
  selectedSeason: string
) {
  const selectedLeagues =
    selectedLeagueId === ALL_LEAGUES_VALUE
      ? leagues
      : selectedLeagueId
        ? leagueSeasonOptions.filter((league) => String(league.leagueId) === selectedLeagueId && (!selectedSeason || league.season === selectedSeason))
        : [];

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

function macheteSortLabel(sortValue: string) {
  const [key, direction] = sortValue.split(":");
  const labels: Record<string, string> = {
    playerName: "player",
    name: "player",
    teamName: "team",
    position: "position",
    isStarter: "starter status",
    nationality: "nationality",
    matchesPlayed: "apps",
    minutesPlayed: "minutes",
    goals: "goals",
    assists: "assists",
    shotsOnTarget: "shots on target",
    keyPasses: "key passes",
    tackles: "tackles",
    averageRating: "rating",
    fantasyScore: "expected FP",
    scoringScore: "actual FP",
    alternativeScore: "alternative FP"
  };
  return `${labels[key] ?? labels.fantasyScore}, ${direction === "asc" ? "ascending" : "descending"}`;
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

function parseStarterFilter(value: string | undefined) {
  return value === "starter" || value === "bench" ? value : "";
}

function filterByStarter<T extends { isStarter?: boolean | null }>(rows: T[], starterFilter: ReturnType<typeof parseStarterFilter>) {
  if (starterFilter === "starter") return rows.filter((row) => row.isStarter);
  if (starterFilter === "bench") return rows.filter((row) => !row.isStarter);
  return rows;
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
      {page <= 1 ? (
        <span aria-disabled="true" className="rounded border border-slate-200 px-3 py-1.5 font-medium text-slate-300">
          <I18nText en="Prev" ru="Назад" />
        </span>
      ) : (
        <Link href={machetePlayersHref(params, page - 1)} className="rounded border border-slate-200 px-3 py-1.5 font-medium text-slate-700 hover:bg-slate-50">
          <I18nText en="Prev" ru="Назад" />
        </Link>
      )}
      <span className="text-slate-500">
        {page} / {pageCount}
      </span>
      {page >= pageCount ? (
        <span aria-disabled="true" className="rounded border border-slate-200 px-3 py-1.5 font-medium text-slate-300">
          <I18nText en="Next" ru="Вперед" />
        </span>
      ) : (
        <Link href={machetePlayersHref(params, page + 1)} className="rounded border border-slate-200 px-3 py-1.5 font-medium text-slate-700 hover:bg-slate-50">
          <I18nText en="Next" ru="Вперед" />
        </Link>
      )}
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

function buildMacheteActiveChips({
  allLeagues,
  seasonsForSelectedLeague,
  teamLeagues,
  activeCompetitions,
  selectedLeagueId,
  selectedSeason,
  selectedTeamId,
  query,
  selectedPosition,
  starterFilter,
  minMinutes,
  matchWindow,
  searchParams
}: {
  allLeagues: SharedLeagueSeasonOption[];
  seasonsForSelectedLeague: SharedLeagueSeasonOption[];
  teamLeagues: Array<SharedLeagueSeasonOption & { teams: SharedTeamOption[] }>;
  activeCompetitions: SharedTeamCompetitionOption[];
  selectedLeagueId: string;
  selectedSeason: string;
  selectedTeamId: string;
  query?: string;
  selectedPosition: PositionFilter | null;
  starterFilter: ReturnType<typeof parseStarterFilter>;
  minMinutes?: string;
  matchWindow: MacheteMatchWindow;
  searchParams: SearchParams;
}): ActiveFilterChip[] {
  const chips: ActiveFilterChip[] = [];
  const cleanedParams: SearchParams = { ...searchParams, page: undefined };

  if (query?.trim()) {
    chips.push({
      key: `query:${query.trim()}`,
      label: <><I18nText en="Search" ru="Поиск" />: {query.trim()}</>,
      removeHref: filterHrefWithout(cleanedParams, "query")
    });
  }

  if (selectedLeagueId && selectedLeagueId !== ALL_LEAGUES_VALUE) {
    const league = allLeagues.find((entry) => String(entry.leagueId) === selectedLeagueId);
    chips.push({
      key: `league:${selectedLeagueId}`,
      label: <><I18nText en="League" ru="Лига" />: {league?.displayName ?? selectedLeagueId}</>,
      removeHref: filterHrefWithout(cleanedParams, "leagueId", "season", "teamId", "competitionKey")
    });
  } else if (selectedLeagueId === ALL_LEAGUES_VALUE) {
    chips.push({
      key: "league:all",
      label: <><I18nText en="League" ru="Лига" />: <I18nText en="all" ru="все" /></>,
      removeHref: filterHrefWithout(cleanedParams, "leagueId", "season", "teamId", "competitionKey")
    });
  }

  if (selectedSeason) {
    const seasonOption = seasonsForSelectedLeague.find((league) => league.season === selectedSeason);
    chips.push({
      key: `season:${selectedSeason}`,
      label: <><I18nText en="Season" ru="Сезон" />: {selectedSeason}{seasonOption?.isCurrent ? " · current" : ""}</>,
      removeHref: filterHrefWithout(cleanedParams, "season", "teamId", "competitionKey")
    });
  }

  if (selectedTeamId) {
    const teamName =
      teamLeagues
        .flatMap((league) => league.teams)
        .find((team) => String(team.id) === selectedTeamId)?.name ?? selectedTeamId;
    chips.push({
      key: `team:${selectedTeamId}`,
      label: <><I18nText en="Team" ru="Команда" />: {teamName}</>,
      removeHref: filterHrefWithout(cleanedParams, "teamId", "competitionKey")
    });
  }

  for (const competition of activeCompetitions) {
    chips.push({
      key: `comp:${competition.key}`,
      label: <>{competition.displayName} {competition.season}</>,
      removeHref: filterHrefRemovingArrayValue(cleanedParams, "competitionKey", competition.key)
    });
  }

  if (selectedPosition) {
    chips.push({
      key: `pos:${selectedPosition}`,
      label: <><I18nText en="Pos" ru="Поз." />: {selectedPosition}</>,
      removeHref: filterHrefWithout(cleanedParams, "position")
    });
  }

  if (starterFilter) {
    chips.push({
      key: `starter:${starterFilter}`,
      label: starterFilter === "starter" ? <I18nText en="In starting XI" ru="В старте" /> : <I18nText en="Bench only" ru="Только запас" />,
      removeHref: filterHrefWithout(cleanedParams, "starterFilter")
    });
  }

  if (minMinutes && Number.parseInt(minMinutes, 10) > 0) {
    chips.push({
      key: `min:${minMinutes}`,
      label: <>≥ {minMinutes}&apos;</>,
      removeHref: filterHrefWithout(cleanedParams, "minMinutes")
    });
  }

  const mode = matchWindowModeValue(matchWindow);
  if (mode !== "last5") {
    chips.push({
      key: `win:${mode}`,
      label: <><I18nText en="Window" ru="Окно" />: {matchWindowLabel(matchWindow)}</>,
      removeHref: filterHrefWithout(cleanedParams, "matchWindow", "customMatches", "recentMatches")
    });
  }

  return chips;
}

function filterHrefWithout(params: SearchParams, ...keys: string[]) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (keys.includes(key)) continue;
    for (const item of searchParamValues(value)) query.append(key, item);
  }
  const qs = query.toString();
  return `/machete/players${qs ? `?${qs}` : ""}`;
}

function filterHrefRemovingArrayValue(params: SearchParams, key: string, valueToRemove: string) {
  const query = new URLSearchParams();
  for (const [paramKey, value] of Object.entries(params)) {
    const items = searchParamValues(value);
    for (const item of items) {
      if (paramKey === key && item === valueToRemove) continue;
      query.append(paramKey, item);
    }
  }
  const qs = query.toString();
  return `/machete/players${qs ? `?${qs}` : ""}`;
}
