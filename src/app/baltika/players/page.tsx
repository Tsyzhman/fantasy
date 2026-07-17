import { ImportStatus, Prisma } from "@prisma/client";
import { Download } from "lucide-react";
import Link from "next/link";

import {
  PlayerCompareDock,
  PlayerCompareDraggable,
  PlayerComparePickButton,
  PlayerCompareProvider,
  PlayerCompareToggle,
  type ComparePlayer
} from "@/components/compare/player-compare";
import { I18nText } from "@/components/i18n-text";
import { LocalizedOption } from "@/components/localized-option";
import { LocalizedNumberInput } from "@/components/ui/localized-number-input";
import { AutoSubmitForm } from "@/components/players/auto-submit-form";
import { PlayerSavedViews } from "@/components/players/player-saved-views";
import { PlayerWatchlistButton, PlayerWatchlistPanel } from "@/components/players/player-watchlist";
import { PageBreadcrumbs } from "@/components/page-breadcrumbs";
import { SortableTable } from "@/components/sortable-table";
import { ActiveFilterChips, type ActiveFilterChip } from "@/components/ui/active-filter-chips";
import { FilterShell } from "@/components/ui/filter-shell";
import { PlayerHoverCard, type PlayerHoverCardData } from "@/components/ui/player-hover-card";
import { ResultsToolbar } from "@/components/ui/results-toolbar";
import { ScoreHeatCell, computeRanks } from "@/components/ui/score-heat-cell";
import { formatCurrency, formatNumber, NULL_GLYPH } from "@/lib/format";
import { prisma } from "@/lib/db";
import { compactPlayerDisplayName } from "@/lib/players/display-name";

export const dynamic = "force-dynamic";

type SearchParams = {
  leagueId?: string;
  teamId?: string;
  positionGroup?: string;
  minMinutes?: string;
  starterFilter?: string;
  starterOnly?: string;
  sort?: string;
  page?: string;
  pageSize?: string;
};

type PageProps = {
  searchParams: Promise<SearchParams>;
};

const positions = ["GK", "DEF", "MID", "FWD", "UNKNOWN"];
const DEFAULT_PAGE_SIZE = 100;
const PAGE_SIZE_OPTIONS = [50, 100, 250] as const;
const playerSnapshotSortColumns = {
  playerName: { field: "playerName", defaultDirection: "asc", nullable: false },
  teamName: { field: "teamName", defaultDirection: "asc", nullable: false },
  positionGroup: { field: "positionGroup", defaultDirection: "asc", nullable: true },
  isStarter: { field: "isStarter", defaultDirection: "desc", nullable: false },
  age: { field: "age", defaultDirection: "desc", nullable: true },
  minutesPlayed: { field: "minutesPlayed", defaultDirection: "desc", nullable: true },
  goals: { field: "goals", defaultDirection: "desc", nullable: true },
  xg: { field: "xg", defaultDirection: "desc", nullable: true },
  assists: { field: "assists", defaultDirection: "desc", nullable: true },
  xa: { field: "xa", defaultDirection: "desc", nullable: true },
  marketValue: { field: "marketValue", defaultDirection: "desc", nullable: true },
  fantasyScore: { field: "fantasyScore", defaultDirection: "desc", nullable: true },
  scoringScore: { field: "scoringScore", defaultDirection: "desc", nullable: true },
  alternativeScore: { field: "alternativeScore", defaultDirection: "desc", nullable: true },
  valueScore: { field: "valueScore", defaultDirection: "desc", nullable: true }
} as const;

export default async function PlayersPage({ searchParams }: PageProps) {
  const resolvedSearchParams = await searchParams;
  const leagues = await prisma.league.findMany({
    orderBy: { name: "asc" },
    include: {
      teams: {
        where: {
          imports: {
            some: {
              status: ImportStatus.PUBLISHED,
              isCurrentPublished: true
            }
          }
        },
        orderBy: { name: "asc" }
      }
    }
  });
  const selectedLeagueId = resolvedSearchParams.leagueId ?? "";
  const teamLeagues = selectedLeagueId ? leagues.filter((league) => league.id === selectedLeagueId) : leagues;
  const selectedTeamId =
    resolvedSearchParams.teamId && teamLeagues.some((league) => league.teams.some((team) => team.id === resolvedSearchParams.teamId))
      ? resolvedSearchParams.teamId
      : "";
  const starterFilter = parseStarterFilter(resolvedSearchParams.starterFilter, resolvedSearchParams.starterOnly);
  const pageSize = parsePageSize(resolvedSearchParams.pageSize);
  const requestedPage = parsePositiveInt(resolvedSearchParams.page, 1);

  const where: Prisma.PlayerSnapshotWhereInput = {
    teamImport: {
      status: ImportStatus.PUBLISHED,
      isCurrentPublished: true
    }
  };

  if (selectedLeagueId) where.leagueId = selectedLeagueId;
  if (selectedTeamId) where.teamId = selectedTeamId;
  if (resolvedSearchParams.positionGroup) where.positionGroup = resolvedSearchParams.positionGroup;
  if (starterFilter === "starter") where.isStarter = true;
  if (starterFilter === "bench") where.isStarter = false;
  if (resolvedSearchParams.minMinutes) {
    const minutes = Number(resolvedSearchParams.minMinutes);
    if (Number.isFinite(minutes)) where.minutesPlayed = { gte: minutes };
  }

  const sort = resolvedSearchParams.sort ?? "fantasyScore";
  const orderBy = playerSnapshotOrderBy(sort);
  const totalPlayers = await prisma.playerSnapshot.count({ where });
  const pageCount = Math.max(1, Math.ceil(totalPlayers / pageSize));
  const page = Math.min(Math.max(1, requestedPage), pageCount);
  const offset = (page - 1) * pageSize;

  const players = await prisma.playerSnapshot.findMany({
    where,
    orderBy,
    skip: offset,
    take: pageSize,
    include: {
      league: true,
      team: true
    }
  });
  const paginationParams = {
    ...resolvedSearchParams,
    leagueId: selectedLeagueId || undefined,
    teamId: selectedTeamId || undefined,
    starterFilter: starterFilter || undefined,
    pageSize: String(pageSize)
  };
  const shownFrom = totalPlayers === 0 ? 0 : offset + 1;
  const shownTo = Math.min(offset + players.length, totalPlayers);

  const columnsCount = 14;
  const xRanks = computeRanks(players.map((p) => p.fantasyScore));
  const fpRanks = computeRanks(players.map((p) => p.scoringScore));
  const altRanks = computeRanks(players.map((p) => p.alternativeScore));

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <PageBreadcrumbs
        backHref="/baltika/leagues"
        backLabel={<I18nText en="Back to leagues" ru="Назад к лигам" />}
        items={[
          { label: <I18nText en="Baltika" ru="Балтика" />, href: "/baltika/leagues" },
          { label: <I18nText en="Players" ru="Игроки" />, href: "/baltika/players" }
        ]}
      />
      <div className="mt-5">
        <p className="text-sm font-semibold uppercase tracking-wide text-slate-500"><I18nText en="Baltika player explorer" ru="Таблица игроков Балтики" /></p>
        <h1 className="mt-2 text-3xl font-bold text-ink"><I18nText en="Published Wyscout players" ru="Опубликованные игроки Wyscout" /></h1>
        <p className="mt-2 max-w-2xl text-sm text-slate-600">
          <I18nText en="This table only reads snapshots from imports marked current and published." ru="Здесь показаны только игроки из текущих опубликованных импортов." />
        </p>
      </div>

      <FilterShell
        className="mt-8"
        title={<I18nText en="Filters" ru="Фильтры" />}
        description={<I18nText en="Changes apply automatically and keep the table focused on the current published snapshots." ru="Изменения применяются автоматически и оставляют таблицу в текущих опубликованных снимках." />}
        resetHref="/baltika/players"
      >
      <AutoSubmitForm className="grid grid-cols-1 gap-3 md:grid-cols-6">
        <label className="text-sm">
          <span className="mb-1 block font-medium text-slate-600"><I18nText en="League" ru="Лига" /></span>
          <select name="leagueId" defaultValue={selectedLeagueId} className="w-full rounded border border-slate-200 px-3 py-2">
            <LocalizedOption value="" en="All leagues" ru="Все лиги" />
            {leagues.map((league) => (
              <option key={league.id} value={league.id}>
                {league.name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <span className="mb-1 block font-medium text-slate-600"><I18nText en="Team" ru="Команда" /></span>
          <select name="teamId" defaultValue={selectedTeamId} className="w-full rounded border border-slate-200 px-3 py-2">
            <LocalizedOption value="" en="All teams" ru="Все команды" />
            {teamLeagues.flatMap((league) =>
              league.teams.map((team) => (
                <option key={team.id} value={team.id}>
                  {selectedLeagueId ? team.name : `${team.name} - ${league.name}`}
                </option>
              ))
            )}
          </select>
        </label>
        <label className="text-sm">
          <span className="mb-1 block font-medium text-slate-600"><I18nText en="Position" ru="Позиция" /></span>
          <select
            name="positionGroup"
            defaultValue={resolvedSearchParams.positionGroup ?? ""}
            className="w-full rounded border border-slate-200 px-3 py-2"
          >
            <LocalizedOption value="" en="All positions" ru="Все позиции" />
            {positions.map((position) => (
              <option key={position} value={position}>
                {position}
              </option>
            ))}
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
          <span className="mb-1 block font-medium text-slate-600"><I18nText en="Starter status" ru="Статус старта" /></span>
          <select name="starterFilter" defaultValue={starterFilter} className="w-full rounded border border-slate-200 px-3 py-2">
            <LocalizedOption value="" en="All players" ru="Все игроки" />
            <LocalizedOption value="starter" en="In starting XI" ru="В старте" />
            <LocalizedOption value="bench" en="Not in starting XI" ru="Не в старте" />
          </select>
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
        resetHref="/baltika/players"
        chips={buildBaltikaActiveChips({
          leagues,
          selectedLeagueId,
          selectedTeamId,
          positionGroup: resolvedSearchParams.positionGroup,
          starterFilter,
          minMinutes: resolvedSearchParams.minMinutes,
          resolvedSearchParams
        })}
      />

      <PlayerCompareProvider source="baltika">
      <ResultsToolbar
        className="mt-5"
        title={<I18nText en={`Showing ${shownFrom}-${shownTo} of ${totalPlayers} players`} ru={`Показаны ${shownFrom}-${shownTo} из ${totalPlayers} игроков`} />}
        meta={<I18nText en={`Sorted by ${baltikaSortLabel(sort)}`} ru={`Сортировка: ${baltikaSortLabel(sort)}`} />}
        resetHref="/baltika/players"
      >
        <PlayerSavedViews source="baltika" />
        <PlayerWatchlistPanel source="baltika" />
        <ExportLink href={baltikaPlayerExportHref(paginationParams, "csv")} label="CSV" />
        <ExportLink href={baltikaPlayerExportHref(paginationParams, "xlsx")} label="XLSX" />
        <PlayerCompareToggle />
        <PaginationLinks page={page} pageCount={pageCount} params={paginationParams} />
      </ResultsToolbar>
      <PlayerCompareDock />

      <section className="mt-6 overflow-hidden rounded border border-slate-200 bg-white shadow-soft">
        <div className="sm:hidden">
          <SortableTable serverSortParam="sort" defaultSort={sort} className="min-w-full table-fixed divide-y divide-slate-200 text-xs">
            <thead className="bg-slate-50 text-left font-semibold uppercase text-slate-500">
              <tr>
                <th className="w-[42%] px-3 py-3" data-sort-key="playerName"><I18nText en="Player" ru="Игрок" /></th>
                <th className="w-[29%] bg-emerald-50 px-3 py-3 text-right text-emerald-700" data-sort-key="fantasyScore">xFP</th>
                <th className="w-[29%] bg-sky-50 px-3 py-3 text-right text-sky-700" data-sort-key="scoringScore">FP</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {players.map((player, idx) => (
                <tr key={player.id} className="hover:bg-slate-50">
                  <td className="max-w-[42vw] px-3 py-3 font-medium text-ink">
                    <div className="flex min-w-0 items-center gap-1.5">
                      <PlayerComparePickButton player={baltikaComparePlayer(player)} />
                      <PlayerWatchlistButton source="baltika" player={baltikaWatchlistPlayer(player)} />
                      <PlayerCompareDraggable player={baltikaComparePlayer(player)} className="min-w-0 flex-1">
                        <span className="block truncate" title={player.playerName}>{compactPlayerDisplayName(player.playerName)}</span>
                      </PlayerCompareDraggable>
                    </div>
                    <span className="mt-0.5 flex min-w-0 items-center gap-1 text-[11px] font-normal text-slate-500">
                      <StarterBadge isStarter={player.isStarter} compact />
                      <span className="truncate">{player.positionGroup ?? NULL_GLYPH} · {player.team.name}</span>
                    </span>
                  </td>
                  <td className="px-1 py-2 text-right">
                    <ScoreHeatCell value={player.fantasyScore} rank={xRanks[idx]} tone="emerald" />
                  </td>
                  <td className="px-1 py-2 text-right">
                    <ScoreHeatCell value={player.scoringScore} rank={fpRanks[idx]} tone="sky" />
                  </td>
                </tr>
              ))}
              {players.length === 0 ? (
                <tr>
                  <td colSpan={3} className="px-4 py-10 text-center text-slate-500">
                    <I18nText en="No published player snapshots match these filters yet." ru="Пока нет опубликованных игроков под эти фильтры." />
                  </td>
                </tr>
              ) : null}
            </tbody>
          </SortableTable>
        </div>

        {/* tablet */}
        <div className="hidden overflow-x-auto sm:block xl:hidden">
          <SortableTable serverSortParam="sort" defaultSort={sort} className="sticky-first-col min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3" data-sort-key="playerName"><I18nText en="Player" ru="Игрок" /></th>
                <th className="px-4 py-3" data-sort-key="teamName"><I18nText en="Team" ru="Команда" /></th>
                <th className="px-4 py-3" data-sort-key="positionGroup"><I18nText en="Pos" ru="Поз." /></th>
                <th className="px-4 py-3" data-sort-key="isStarter"><I18nText en="Start" ru="В старте" /></th>
                <th className="px-4 py-3 text-right num-tabular" data-sort-key="minutesPlayed"><I18nText en="Minutes" ru="Минуты" /></th>
                <th className="hidden px-4 py-3 text-right num-tabular lg:table-cell" data-sort-key="goals"><I18nText en="Goals" ru="Голы" /></th>
                <th className="hidden px-4 py-3 text-right num-tabular lg:table-cell" data-sort-key="assists"><I18nText en="Assists" ru="Ассисты" /></th>
                <th className="bg-emerald-50 px-2 py-3 text-right text-emerald-700" data-sort-key="fantasyScore">xFP</th>
                <th className="bg-sky-50 px-2 py-3 text-right text-sky-700" data-sort-key="scoringScore">FP</th>
                <th className="bg-amber-50 px-2 py-3 text-right text-amber-700" data-sort-key="alternativeScore">vFP</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {players.map((player, idx) => (
                <tr key={player.id} className="hover:bg-slate-50">
                  <td className="whitespace-nowrap px-4 py-3 font-medium text-ink">
                    <BaltikaPlayerNameCell player={player} />
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-slate-600">{player.team.name}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-slate-600">{player.positionGroup ?? NULL_GLYPH}</td>
                  <td className="whitespace-nowrap px-4 py-3"><StarterBadge isStarter={player.isStarter} /></td>
                  <td className="whitespace-nowrap px-4 py-3 text-right text-slate-600 num-tabular">{formatNumber(player.minutesPlayed)}</td>
                  <td className="hidden whitespace-nowrap px-4 py-3 text-right text-slate-600 num-tabular lg:table-cell">{formatNumber(player.goals, 2)}</td>
                  <td className="hidden whitespace-nowrap px-4 py-3 text-right text-slate-600 num-tabular lg:table-cell">{formatNumber(player.assists, 2)}</td>
                  <td className="px-1 py-2 text-right">
                    <ScoreHeatCell value={player.fantasyScore} rank={xRanks[idx]} tone="emerald" />
                  </td>
                  <td className="px-1 py-2 text-right">
                    <ScoreHeatCell value={player.scoringScore} rank={fpRanks[idx]} tone="sky" />
                  </td>
                  <td className="px-1 py-2 text-right">
                    <ScoreHeatCell value={player.alternativeScore} rank={altRanks[idx]} tone="amber" />
                  </td>
                </tr>
              ))}
              {players.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-4 py-10 text-center text-slate-500">
                    <I18nText en="No published player snapshots match these filters yet." ru="Пока нет опубликованных игроков под эти фильтры." />
                  </td>
                </tr>
              ) : null}
            </tbody>
          </SortableTable>
        </div>

        <div className="hidden overflow-x-auto xl:block">
          <SortableTable serverSortParam="sort" defaultSort={sort} className="sticky-first-col min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3" data-sort-key="playerName"><I18nText en="Player" ru="Игрок" /></th>
                <th className="px-4 py-3" data-sort-key="teamName"><I18nText en="Team" ru="Команда" /></th>
                <th className="px-4 py-3" data-sort-key="positionGroup"><I18nText en="Pos" ru="Поз." /></th>
                <th className="px-4 py-3" data-sort-key="isStarter"><I18nText en="Start" ru="В старте" /></th>
                <th className="px-4 py-3 text-right num-tabular" data-sort-key="age"><I18nText en="Age" ru="Возраст" /></th>
                <th className="px-4 py-3 text-right num-tabular" data-sort-key="minutesPlayed"><I18nText en="Min" ru="Мин" /></th>
                <th className="px-4 py-3 text-right num-tabular" data-sort-key="goals">G</th>
                <th className="px-4 py-3 text-right num-tabular" data-sort-key="xg">xG</th>
                <th className="px-4 py-3 text-right num-tabular" data-sort-key="assists">A</th>
                <th className="px-4 py-3 text-right num-tabular" data-sort-key="xa">xA</th>
                <th className="px-4 py-3 text-right num-tabular" data-sort-key="marketValue"><I18nText en="Market" ru="Стоимость" /></th>
                <th className="bg-emerald-50 px-2 py-3 text-right text-emerald-700" data-sort-key="fantasyScore">xFP</th>
                <th className="bg-sky-50 px-2 py-3 text-right text-sky-700" data-sort-key="scoringScore">FP</th>
                <th className="bg-amber-50 px-2 py-3 text-right text-amber-700" data-sort-key="alternativeScore">vFP</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {players.map((player, idx) => (
                <tr key={player.id} className="hover:bg-slate-50">
                  <td className="whitespace-nowrap px-4 py-3 font-medium text-ink">
                    <BaltikaPlayerNameCell player={player} />
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-slate-600">{player.team.name}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-slate-600">{player.positionGroup ?? NULL_GLYPH}</td>
                  <td className="whitespace-nowrap px-4 py-3"><StarterBadge isStarter={player.isStarter} /></td>
                  <td className="whitespace-nowrap px-4 py-3 text-right text-slate-600 num-tabular">{formatNumber(player.age)}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-right text-slate-600 num-tabular">{formatNumber(player.minutesPlayed)}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-right text-slate-600 num-tabular">{formatNumber(player.goals, 2)}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-right text-slate-600 num-tabular">{formatNumber(player.xg, 2)}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-right text-slate-600 num-tabular">{formatNumber(player.assists, 2)}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-right text-slate-600 num-tabular">{formatNumber(player.xa, 2)}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-right text-slate-600 num-tabular">{formatCurrency(player.marketValue)}</td>
                  <td className="px-1 py-2 text-right">
                    <ScoreHeatCell value={player.fantasyScore} rank={xRanks[idx]} tone="emerald" />
                  </td>
                  <td className="px-1 py-2 text-right">
                    <ScoreHeatCell value={player.scoringScore} rank={fpRanks[idx]} tone="sky" />
                  </td>
                  <td className="px-1 py-2 text-right">
                    <ScoreHeatCell value={player.alternativeScore} rank={altRanks[idx]} tone="amber" />
                  </td>
                </tr>
              ))}
              {players.length === 0 ? (
                <tr>
                  <td colSpan={columnsCount} className="px-4 py-10 text-center text-slate-500">
                    <I18nText en="No published player snapshots match these filters yet." ru="Пока нет опубликованных игроков под эти фильтры." />
                  </td>
                </tr>
              ) : null}
            </tbody>
          </SortableTable>
        </div>
      </section>
      <div className="mt-4 flex justify-end">
        <PaginationLinks page={page} pageCount={pageCount} params={paginationParams} />
      </div>
      </PlayerCompareProvider>
    </main>
  );
}

function parseStarterFilter(starterFilter: string | undefined, starterOnly: string | undefined) {
  if (starterFilter === "starter" || starterOnly === "1") return "starter";
  if (starterFilter === "bench") return "bench";
  return "";
}

function StarterBadge({ isStarter, compact = false }: { isStarter: boolean; compact?: boolean }) {
  const className = isStarter
    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
    : "border-slate-200 bg-slate-50 text-slate-500";

  return (
    <span className={`inline-flex items-center justify-center rounded border px-2 py-0.5 text-[11px] font-semibold ${className}`}>
      {compact ? (isStarter ? "XI" : "B") : <I18nText en={isStarter ? "Start" : "Bench"} ru={isStarter ? "Старт" : "Запас"} />}
    </span>
  );
}

function baltikaSortLabel(sortValue: string) {
  const [key, direction] = sortValue.split(":");
  const labels: Record<keyof typeof playerSnapshotSortColumns, string> = {
    playerName: "player",
    teamName: "team",
    positionGroup: "position",
    isStarter: "starter status",
    age: "age",
    minutesPlayed: "minutes",
    goals: "goals",
    xg: "xG",
    assists: "assists",
    xa: "xA",
    marketValue: "market value",
    fantasyScore: "predicted FP",
    scoringScore: "actual FP",
    alternativeScore: "alternative FP",
    valueScore: "value"
  };
  const safeKey = key in labels ? (key as keyof typeof labels) : "fantasyScore";
  const safeDirection = direction === "asc" ? "ascending" : "descending";
  return `${labels[safeKey]}, ${safeDirection}`;
}

function parsePositiveInt(value: string | undefined, fallback: number) {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parsePageSize(value: string | undefined) {
  const parsed = parsePositiveInt(value, DEFAULT_PAGE_SIZE);
  return PAGE_SIZE_OPTIONS.includes(parsed as (typeof PAGE_SIZE_OPTIONS)[number]) ? parsed : DEFAULT_PAGE_SIZE;
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
    <div className="flex items-center gap-2 text-sm">
      {page <= 1 ? (
        <span aria-disabled="true" className="rounded border border-slate-200 px-3 py-1.5 font-medium text-slate-300">
          <I18nText en="Prev" ru="Назад" />
        </span>
      ) : (
        <Link href={baltikaPlayersHref(params, page - 1)} className="rounded border border-slate-200 px-3 py-1.5 font-medium text-slate-700 hover:bg-slate-50">
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
        <Link href={baltikaPlayersHref(params, page + 1)} className="rounded border border-slate-200 px-3 py-1.5 font-medium text-slate-700 hover:bg-slate-50">
          <I18nText en="Next" ru="Вперед" />
        </Link>
      )}
    </div>
  );
}

function ExportLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-2 rounded border border-slate-200 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
    >
      <Download className="h-4 w-4" aria-hidden="true" />
      {label}
    </Link>
  );
}

function baltikaPlayersHref(params: SearchParams, page: number) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (key === "page") continue;
    if (typeof value === "string" && value !== "") query.set(key, value);
  }
  query.set("page", String(page));
  return `/baltika/players?${query.toString()}`;
}

function baltikaPlayerExportHref(params: SearchParams, format: "csv" | "xlsx") {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (key === "page" || key === "pageSize") continue;
    if (typeof value === "string" && value !== "") query.set(key, value);
  }
  query.set("format", format);
  return `/api/players?${query.toString()}`;
}

function playerSnapshotOrderBy(sortValue: string): Prisma.PlayerSnapshotOrderByWithRelationInput[] {
  const [rawKey, rawDirection] = sortValue.split(":");
  const key = rawKey in playerSnapshotSortColumns ? (rawKey as keyof typeof playerSnapshotSortColumns) : "fantasyScore";
  const column = playerSnapshotSortColumns[key];
  const direction = rawDirection === "asc" || rawDirection === "desc" ? rawDirection : column.defaultDirection;
  const primary = column.nullable
    ? { [column.field]: { sort: direction, nulls: "last" } }
    : { [column.field]: direction };

  return [primary as Prisma.PlayerSnapshotOrderByWithRelationInput, { playerName: "asc" }];
}

type BaltikaPlayerRow = {
  id: string;
  playerName: string;
  positionGroup: string | null;
  isStarter: boolean;
  age: number | null;
  minutesPlayed: number | null;
  goals: number | null;
  xg: number | null;
  assists: number | null;
  xa: number | null;
  marketValue: number | null;
  fantasyScore: number | null;
  scoringScore: number | null;
  alternativeScore: number | null;
  team: { name: string };
};

function BaltikaPlayerNameCell({ player }: { player: BaltikaPlayerRow }) {
  const comparePlayer = baltikaComparePlayer(player);
  const data: PlayerHoverCardData = {
    name: player.playerName,
    position: player.positionGroup,
    teamName: player.team.name,
    age: player.age,
    minutesPlayed: player.minutesPlayed,
    goals: player.goals,
    assists: player.assists,
    xFp: player.fantasyScore,
    actualFp: player.scoringScore,
    altFp: player.alternativeScore
  };
  return (
    <div className="flex min-w-0 items-center gap-2">
      <PlayerComparePickButton player={comparePlayer} />
      <PlayerWatchlistButton source="baltika" player={baltikaWatchlistPlayer(player)} />
      <PlayerCompareDraggable player={comparePlayer} className="min-w-0">
        <PlayerHoverCard
          player={data}
          trigger={
            <span className="cursor-help truncate border-b border-dashed border-slate-300" title={player.playerName}>
              {compactPlayerDisplayName(player.playerName)}
            </span>
          }
        />
      </PlayerCompareDraggable>
    </div>
  );
}

function baltikaWatchlistPlayer(player: BaltikaPlayerRow) {
  return {
    id: player.id,
    name: player.playerName,
    position: player.positionGroup,
    teamName: player.team.name
  };
}

function baltikaComparePlayer(player: BaltikaPlayerRow): ComparePlayer {
  return {
    id: player.id,
    name: player.playerName,
    position: player.positionGroup,
    teamName: player.team.name
  };
}

function buildBaltikaActiveChips({
  leagues,
  selectedLeagueId,
  selectedTeamId,
  positionGroup,
  starterFilter,
  minMinutes,
  resolvedSearchParams
}: {
  leagues: Array<{ id: string; name: string; teams: Array<{ id: string; name: string }> }>;
  selectedLeagueId: string;
  selectedTeamId: string;
  positionGroup?: string;
  starterFilter: ReturnType<typeof parseStarterFilter>;
  minMinutes?: string;
  resolvedSearchParams: SearchParams;
}): ActiveFilterChip[] {
  const chips: ActiveFilterChip[] = [];

  if (selectedLeagueId) {
    const league = leagues.find((entry) => entry.id === selectedLeagueId);
    chips.push({
      key: `league:${selectedLeagueId}`,
      label: <><I18nText en="League" ru="Лига" />: {league?.name ?? selectedLeagueId}</>,
      removeHref: baltikaPlayersHrefWithout(resolvedSearchParams, "leagueId", "teamId")
    });
  }

  if (selectedTeamId) {
    const teamName =
      leagues.flatMap((league) => league.teams).find((team) => team.id === selectedTeamId)?.name ?? selectedTeamId;
    chips.push({
      key: `team:${selectedTeamId}`,
      label: <><I18nText en="Team" ru="Команда" />: {teamName}</>,
      removeHref: baltikaPlayersHrefWithout(resolvedSearchParams, "teamId")
    });
  }

  if (positionGroup) {
    chips.push({
      key: `pos:${positionGroup}`,
      label: <><I18nText en="Pos" ru="Поз." />: {positionGroup}</>,
      removeHref: baltikaPlayersHrefWithout(resolvedSearchParams, "positionGroup")
    });
  }

  if (starterFilter) {
    chips.push({
      key: `starter:${starterFilter}`,
      label: starterFilter === "starter" ? <I18nText en="In starting XI" ru="В старте" /> : <I18nText en="Bench only" ru="Только запас" />,
      removeHref: baltikaPlayersHrefWithout(resolvedSearchParams, "starterFilter", "starterOnly")
    });
  }

  if (minMinutes && Number.parseInt(minMinutes, 10) > 0) {
    chips.push({
      key: `min:${minMinutes}`,
      label: <>≥ {minMinutes}&apos;</>,
      removeHref: baltikaPlayersHrefWithout(resolvedSearchParams, "minMinutes")
    });
  }

  return chips;
}

function baltikaPlayersHrefWithout(params: SearchParams, ...keys: string[]) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (keys.includes(key) || key === "page") continue;
    if (typeof value === "string" && value !== "") query.set(key, value);
  }
  const qs = query.toString();
  return `/baltika/players${qs ? `?${qs}` : ""}`;
}
