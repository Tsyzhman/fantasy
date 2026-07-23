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
import { loadCachedFantasySquadPlayerPool, loadSportsRuFantasyPriceRefsByScopedPlayer, sportsRuFantasyPriceScopeKey, type SportsRuFantasyPriceRef } from "@/machete/squad_planner";
import { applyFantasyPlayerIdentityRows, filterFantasyPlayerIdentityRows } from "@/machete/player_identity";
import {
  loadSharedLeagueSeasonOptions,
  loadSharedLeagueTeams,
  loadSharedMachetePlayerRows,
  loadSharedMatchWindowSummary,
  loadSharedTeamCompetitionOptions,
  parseSharedCompetitionKey,
  parseSharedBigInt,
  sortSharedMacheteRows,
  selectSharedLeagueOptions,
  type SharedLeagueSeasonOption,
  type SharedPlayerRowsScope,
  type SharedTeamCompetitionOption,
  type SharedTeamOption
} from "@/machete/shared_read_model";

export const dynamic = "force-dynamic";

type SearchParams = {
  leagueId?: SearchParamValue;
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

const POSITION_FILTERS = ["GK", "DEF", "MID", "FWD"] as const;

type PositionFilter = Exclude<FantasyPositionGroup, "UNK">;

export default async function MachetePlayersPage({ searchParams }: PageProps) {
  const resolvedSearchParams = await searchParams;
  const [leagueSeasonOptions, currentUser] = await Promise.all([
    loadSharedLeagueSeasonOptions(prisma),
    getCurrentUser()
  ]);
  const loadedLeagues = selectSharedLeagueOptions(leagueSeasonOptions);
  const requestedLeagueIds = new Set(searchParamValues(resolvedSearchParams.leagueId));
  const sortedLeagues = loadedLeagues;
  const requestedSeasonOptions = leagueSeasonOptions.filter((option) => requestedLeagueIds.has(String(option.leagueId)));
  const selectedLeagueScopes = sortedLeagues.flatMap((league) => {
    if (!requestedLeagueIds.has(String(league.leagueId))) return [];
    const seasons = requestedSeasonOptions.filter((option) => option.leagueId === league.leagueId);
    const selected = requestedLeagueIds.size === 1 && resolvedSearchParams.season
      ? seasons.find((option) => option.season === resolvedSearchParams.season) ?? league
      : league;
    return selected ? [selected] : [];
  });
  const selectedLeagueIds = selectedLeagueScopes.map((league) => String(league.leagueId));
  const selectedLeagueId = selectedLeagueIds.length === 1 ? selectedLeagueIds[0] : "";
  const seasonsForSelectedLeague =
    selectedLeagueId
      ? leagueSeasonOptions.filter((league) => String(league.leagueId) === selectedLeagueId)
      : [];
  const selectedSeason =
    selectedLeagueId
      ? selectedLeagueScopes[0]?.season ?? ""
      : "";
  const effectiveLeagueScopes = selectedLeagueId && selectedSeason
    ? leagueSeasonOptions.filter((league) => String(league.leagueId) === selectedLeagueId && league.season === selectedSeason)
    : selectedLeagueScopes;
  const teamLeagues = await loadTeamLeagueOptions(effectiveLeagueScopes);
  const selectedTeamId =
    resolvedSearchParams.teamId &&
    selectedLeagueIds.length > 0 &&
    teamLeagues.some((league) => league.teams.some((team) => String(team.id) === resolvedSearchParams.teamId))
      ? resolvedSearchParams.teamId
      : "";
  const sort = resolvedSearchParams.sort ?? "fantasyScore";
  const selectedPosition = parsePositionFilter(resolvedSearchParams.position);
  const starterFilter = parseStarterFilter(resolvedSearchParams.starterFilter);
  const matchWindow = parseMacheteMatchWindow({
    mode: resolvedSearchParams.matchWindow ?? (selectedTeamId ? "all" : undefined),
    customMatches: resolvedSearchParams.customMatches,
    legacyRecentMatches: resolvedSearchParams.recentMatches
  });
  const selectedTeamBigInt = parseSharedBigInt(selectedTeamId);
  const selectedScopeKeys = new Set(effectiveLeagueScopes.map((scope) => `${scope.leagueId}:${scope.season}`));
  const teamCompetitionOptions = selectedTeamBigInt
    ? (await loadSharedTeamCompetitionOptions(prisma, selectedTeamBigInt)).filter((competition) => selectedScopeKeys.has(`${competition.leagueId}:${competition.season}`))
    : [];
  const explicitlySelectedCompetitions = selectedTeamCompetitionOptions(resolvedSearchParams.competitionKey, teamCompetitionOptions);
  const activeCompetitions = explicitlySelectedCompetitions.length > 0 ? explicitlySelectedCompetitions : selectedTeamId ? teamCompetitionOptions : [];
  const activeCompetitionKeys = activeCompetitions.map((competition) => competition.key);

  const playersResult = await buildMatchWindowRows({
    selectedLeagueIds,
    selectedSeason,
    selectedTeamId,
    competitionKeys: activeCompetitionKeys,
    position: selectedPosition,
    query: resolvedSearchParams.query,
    starterFilter,
    minMinutes: resolvedSearchParams.minMinutes,
    matchWindow,
    sort,
    selectedLeagueScopes: effectiveLeagueScopes,
    userId: currentUser?.id
  });
  const players = playersResult.allPlayers;
  const windowSummary = playersResult.windowSummary;
  const scopeTeamCount = teamLeagues.reduce((total, league) => total + league.teams.length, 0);
  const windowMatchesLabel = windowSummary
    ? `${formatNumber(windowSummary.matchesWithPlayerStats)} / ${formatNumber(windowSummary.officialMatches)}`
    : NULL_GLYPH;
  const squadHref =
    selectedLeagueId
      ? `/machete/squad?leagueId=${encodeURIComponent(selectedLeagueId)}${selectedSeason ? `&season=${encodeURIComponent(selectedSeason)}` : ""}`
      : "/machete/squad";

  return (
    <main className="mx-auto max-w-[1600px] px-3 py-6 sm:px-5 lg:px-6">
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
      <div className="mt-4 rounded border border-slate-200 bg-white px-4 py-4 sm:px-5">
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
        className="mt-4"
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
        <fieldset className="text-sm md:col-span-2 xl:col-span-4">
          <legend className="mb-1 block font-medium text-slate-600"><I18nText en="Leagues" ru="Лиги" /></legend>
          <CompetitionCheckboxList
            name="leagueId"
            selectedKeys={selectedLeagueIds}
            emptyLabel={<I18nText en="No loaded leagues." ru="Нет загруженных лиг." />}
            className="max-h-52 sm:[&>div]:grid-cols-2 xl:[&>div]:grid-cols-3"
            options={sortedLeagues.map((league) => ({
              key: String(league.leagueId),
              label: league.displayName,
              description: league.season
            }))}
          />
          <p className="mt-1 text-xs text-slate-500"><I18nText en="Nothing is loaded until at least one league is selected." ru="Пока не выбрана хотя бы одна лига, игроки и статистика не загружаются." /></p>
        </fieldset>
        <label className="text-sm">
          <span className="mb-1 block font-medium text-slate-600"><I18nText en="Season" ru="Сезон" /></span>
          <select
            name="season"
            defaultValue={selectedSeason}
            disabled={!selectedLeagueId}
            className="w-full rounded border border-slate-200 px-3 py-2 disabled:bg-slate-100"
          >
            <LocalizedOption
              value=""
              en={selectedLeagueIds.length > 1 ? "Latest season per selected league" : "Choose one league first"}
              ru={selectedLeagueIds.length > 1 ? "Последний сезон каждой выбранной лиги" : "Сначала выберите одну лигу"}
            />
            {seasonsForSelectedLeague.map((league) => (
              <LocalizedOption
                key={`${league.leagueId}:${league.season}`}
                value={league.season}
                en={`${league.season}${league.isCurrent ? " · current" : ""}`}
                ru={`${league.season}${league.isCurrent ? " · текущий" : ""}`}
              />
            ))}
          </select>
        </label>
        <label className="text-sm">
          <span className="mb-1 block font-medium text-slate-600"><I18nText en="Team" ru="Команда" /></span>
          <select name="teamId" defaultValue={selectedTeamId} disabled={selectedLeagueIds.length === 0} className="w-full rounded border border-slate-200 px-3 py-2 disabled:bg-slate-100">
            <LocalizedOption value="" en="All teams" ru="Все команды" />
            {teamLeagues.flatMap((league) =>
              league.teams.map((team) => (
                <option key={`${league.leagueId}:${league.season}:${team.id}`} value={String(team.id)}>
                  {selectedLeagueIds.length === 1 ? team.name : `${team.name} - ${league.displayName}`}
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
          selectedLeagueIds,
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
          detail={selectedLeagueIds.length > 1
            ? <I18nText en={`${selectedLeagueIds.length} selected leagues`} ru={`Выбрано лиг: ${selectedLeagueIds.length}`} />
            : selectedSeason || NULL_GLYPH}
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
        {selectedLeagueIds.length > 0 ? (
          <>
            <ResultsToolbar
              className="mt-5"
              title={<I18nText en={`${playersResult.total} players in the selected leagues`} ru={`${playersResult.total} игроков в выбранных лигах`} />}
              meta={<I18nText en={`Sorted by ${macheteSortLabel(sort, "en")}; window ${matchWindowLabel(matchWindow)}.`} ru={`Сортировка: ${macheteSortLabel(sort, "ru")}; окно ${matchWindowLabelRu(matchWindow)}.`} />}
              resetHref="/machete/players"
            >
              <PlayerSavedViews source="machete" />
              <PlayerWatchlistPanel source="machete" />
              <PlayerCompareToggle />
              <Link href={squadHref} className="rounded bg-emerald-700 px-3 py-1.5 font-semibold text-white hover:bg-emerald-800">
                <I18nText en="Build squad" ru="Собрать состав" />
              </Link>
            </ResultsToolbar>
            <PlayerCompareDock />
          </>
        ) : null}

        <section className="mt-6">
          {selectedLeagueIds.length > 0 ? (
            <>
              <MachetePlayerTable players={players} showContext showStarterStatus serverSortParam="sort" defaultSort={sort} />
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
  selectedLeagueIds,
  selectedSeason,
  selectedTeamId,
  competitionKeys,
  position,
  query,
  starterFilter,
  minMinutes,
  matchWindow,
  sort,
  selectedLeagueScopes,
  userId
}: {
  selectedLeagueIds: string[];
  selectedSeason: string;
  selectedTeamId: string;
  competitionKeys: string[];
  position: PositionFilter | null;
  query?: string;
  starterFilter: ReturnType<typeof parseStarterFilter>;
  minMinutes?: string;
  matchWindow: MacheteMatchWindow;
  sort: string;
  selectedLeagueScopes: SharedLeagueSeasonOption[];
  userId?: string;
}) {
  if (selectedLeagueIds.length === 0) {
    return {
      allPlayers: [],
      total: 0,
      windowSummary: null,
      sportsRuMappedCount: 0,
      fotMobFallbackCount: 0
    };
  }

  const scopes = await buildPlayerScopes(
    selectedTeamId,
    competitionKeys,
    selectedLeagueScopes
  );
  const combineTeamCompetitions = competitionKeys.length > 1;
  const [rawRows, windowSummary, sportsPriceRefs, forecastPools] = await Promise.all([
    loadSharedMachetePlayerRows(prisma, {
      scopes,
      position: position ?? undefined,
      minMinutes,
      matchWindow,
      combineTeamCompetitions,
      userId
    }),
    loadSharedMatchWindowSummary(prisma, scopes, matchWindow, combineTeamCompetitions),
    loadSportsRuFantasyPriceRefsByScopedPlayer(prisma, { scopes }),
    userId
      ? Promise.all(selectedLeagueScopes.map(async (scope) => {
          try {
            return { scope, players: await loadCachedFantasySquadPlayerPool(prisma, userId, scope) };
          } catch (error) {
            console.error("Failed to load player forecast pool", { leagueId: String(scope.leagueId), season: scope.season, error });
            return { scope, players: [] };
          }
        }))
      : Promise.resolve([])
  ]);
  const forecastByScopedPlayer = new Map<string, (typeof forecastPools)[number]["players"][number]>(forecastPools.flatMap(({ scope, players }) =>
    players.map((player) => [`${scope.leagueId}:${scope.season}:${player.teamId}:${player.playerId}`, player] as const)
  ));
  const identityRows = applyFantasyPlayerIdentityRows(
    rawRows,
    (rowId) => sportsRuPriceRefForMacheteRow(rowId, sportsPriceRefs),
    position
  ).map((row) => {
    const forecast = forecastScopeKeysForMacheteRowId(row.id)
      .map((key) => forecastByScopedPlayer.get(key))
      .find(Boolean) ?? null;
    return {
      ...row,
      averageRating: row.averageRating10 ?? row.averageRating,
      price: sportsRuPriceRefForMacheteRow(row.id, sportsPriceRefs)?.price ?? null,
      predictedFp: forecast?.predictedFp ?? null,
      roundPoints: forecast?.roundPoints ?? null,
      foontasyPoints: forecast?.foontasyPoints ?? null,
      alternativePredictedFp: forecast?.alternativePredictedFp ?? null,
      alternativeRoundPoints: forecast?.alternativeRoundPoints ?? null,
      expectedMinutes: forecast?.expectedMinutes ?? row.expectedMinutes ?? null,
      startProbability: forecast?.startProbability ?? null,
      forecastConfidence: forecast?.forecastConfidence ?? row.forecastConfidence ?? null,
      projectedFixtureComponents: forecast?.projectedFixtureComponents ?? null,
      projectionComponents: forecast?.projectionComponents ?? null,
      projectionFormula: forecast?.projectionFormula ?? null,
      alternativeProjectedFixtureComponents: forecast?.alternativeProjectedFixtureComponents ?? null,
      alternativeProjectionComponents: forecast?.alternativeProjectionComponents ?? null,
      alternativeProjectionFormula: forecast?.alternativeProjectionFormula ?? null,
      forecastFactors: forecast?.forecastFactors ?? [],
      forecastRisks: forecast?.forecastRisks ?? [],
      forecastCalculatedAt: forecast?.forecastCalculatedAt ?? null,
      forecastDataUpdatedAt: forecast?.forecastDataUpdatedAt ?? null,
      forecastModelVersion: forecast?.forecastModelVersion ?? null,
      forecastSource: forecast ? "planner" as const : "history" as const,
      fixtures: forecast?.fixtures ?? [],
      fixtureFullNames: forecast?.fixtureFullNames ?? [],
      fixtureDifficulties: forecast?.fixtureDifficulties ?? []
    };
  });
  const rows = sortSharedMacheteRows(filterFantasyPlayerIdentityRows(filterByStarter(identityRows, starterFilter), query), sort);
  const sportsRuMappedCount = rows.filter((row) => row.fantasyIdentitySource === "sports-ru").length;
  const fotMobFallbackCount = rows.length - sportsRuMappedCount;

  return {
    allPlayers: rows,
    total: rows.length,
    windowSummary,
    sportsRuMappedCount,
    fotMobFallbackCount
  };
}

async function buildPlayerScopes(
  selectedTeamId: string,
  competitionKeys: string[],
  selectedLeagueScopes: SharedLeagueSeasonOption[]
): Promise<SharedPlayerRowsScope[]> {
  const teamId = parseSharedBigInt(selectedTeamId);
  const competitions = competitionKeys.map(parseSharedCompetitionKey).filter((competition): competition is { leagueId: bigint; season: string } => Boolean(competition));
  if (teamId && competitions.length > 0) {
    return competitions.map((competition) => ({ leagueId: competition.leagueId, season: competition.season, teamId }));
  }

  if (teamId) {
    return selectedLeagueScopes.map((scope) => ({ leagueId: scope.leagueId, season: scope.season, teamId }));
  }

  return selectedLeagueScopes.map((scope) => ({ leagueId: scope.leagueId, season: scope.season, teamId }));
}

async function loadTeamLeagueOptions(
  selectedLeagues: SharedLeagueSeasonOption[]
) {
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

function macheteSortLabel(sortValue: string, language: "en" | "ru") {
  const [key, direction] = sortValue.split(":");
  const labels: Record<string, [string, string]> = {
    playerName: ["player", "игрок"],
    name: ["player", "игрок"],
    teamName: ["team", "команда"],
    position: ["position", "позиция"],
    isStarter: ["starter status", "статус старта"],
    nationality: ["nationality", "гражданство"],
    matchesPlayed: ["apps", "матчи"],
    minutesPlayed: ["minutes", "минуты"],
    goals: ["goals", "голы"],
    assists: ["assists", "ассисты"],
    shotsOnTarget: ["shots on target", "удары в створ"],
    keyPasses: ["key passes", "ключевые передачи"],
    tackles: ["tackles", "отборы"],
    averageRating: ["rating", "рейтинг"],
    fantasyScore: ["expected FP", "ожидаемые ФО"],
    scoringScore: ["actual FP", "фактические ФО"],
    alternativeScore: ["alternative FP", "альтернативные ФО"]
  };
  const label = (labels[key] ?? labels.fantasyScore)[language === "ru" ? 1 : 0];
  const directionLabel = language === "ru"
    ? direction === "asc" ? "по возрастанию" : "по убыванию"
    : direction === "asc" ? "ascending" : "descending";
  return `${label}, ${directionLabel}`;
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

function forecastScopeKeysForMacheteRowId(rowId: string) {
  if (!rowId.startsWith("combined:")) {
    const [leagueId, season, teamId, playerId] = rowId.split(":");
    return leagueId && season && teamId && playerId ? [`${leagueId}:${season}:${teamId}:${playerId}`] : [];
  }

  const value = rowId.slice("combined:".length);
  const teamSeparatorIndex = value.indexOf(":");
  if (teamSeparatorIndex < 0) return [];
  const teamId = value.slice(0, teamSeparatorIndex);
  const afterTeam = value.slice(teamSeparatorIndex + 1);
  const playerSeparatorIndex = afterTeam.indexOf(":");
  if (playerSeparatorIndex < 0) return [];
  const playerId = afterTeam.slice(0, playerSeparatorIndex);
  const competitionsValue = afterTeam.slice(playerSeparatorIndex + 1);
  return competitionsValue.split("|").flatMap((competition) => {
    const parsed = parseSharedCompetitionKey(competition);
    return parsed ? [`${parsed.leagueId}:${parsed.season}:${teamId}:${playerId}`] : [];
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

function buildMacheteActiveChips({
  allLeagues,
  seasonsForSelectedLeague,
  teamLeagues,
  activeCompetitions,
  selectedLeagueIds,
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
  selectedLeagueIds: string[];
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

  for (const leagueId of selectedLeagueIds) {
    const league = allLeagues.find((entry) => String(entry.leagueId) === leagueId);
    chips.push({
      key: `league:${leagueId}`,
      label: <><I18nText en="League" ru="Лига" />: {league?.displayName ?? leagueId}</>,
      removeHref: filterHrefRemovingArrayValue(cleanedParams, "leagueId", leagueId)
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
