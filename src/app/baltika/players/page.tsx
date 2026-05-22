import { ImportStatus, Prisma } from "@prisma/client";
import Link from "next/link";

import { I18nText } from "@/components/i18n-text";
import { LocalizedOption } from "@/components/localized-option";
import { AutoSubmitForm } from "@/components/players/auto-submit-form";
import { PageBreadcrumbs } from "@/components/page-breadcrumbs";
import { SortableTable } from "@/components/sortable-table";
import { FilterShell } from "@/components/ui/filter-shell";
import { ResultsToolbar } from "@/components/ui/results-toolbar";
import { formatCurrency, formatNumber, formatScore } from "@/lib/format";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

type SearchParams = {
  leagueId?: string;
  teamId?: string;
  positionGroup?: string;
  minMinutes?: string;
  starterFilter?: string;
  starterOnly?: string;
  sort?: string;
};

type PageProps = {
  searchParams: Promise<SearchParams>;
};

const positions = ["GK", "DEF", "MID", "FWD", "UNKNOWN"];
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

  const players = await prisma.playerSnapshot.findMany({
    where,
    orderBy,
    take: 250,
    include: {
      league: true,
      team: true
    }
  });

  const columnsCount = 14;

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
      <div className="mt-5 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-slate-500"><I18nText en="Baltika player explorer" ru="Таблица игроков Балтики" /></p>
          <h1 className="mt-2 text-3xl font-bold text-ink"><I18nText en="Published Wyscout players" ru="Опубликованные игроки Wyscout" /></h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-600">
            <I18nText en="This table only reads snapshots from imports marked current and published." ru="Здесь показаны только игроки из текущих опубликованных импортов." />
          </p>
        </div>
        <Link href="/baltika/leagues" className="rounded bg-ink px-3 py-2 text-sm font-semibold text-white hover:bg-slate-700">
          <I18nText en="Back to Baltika" ru="Назад в Балтику" />
        </Link>
      </div>

      <FilterShell
        className="mt-8"
        title={<I18nText en="Filters" ru="Фильтры" />}
        description={<I18nText en="Changes apply automatically and keep the table focused on the current published snapshots." ru="Изменения применяются автоматически и оставляют таблицу в текущих опубликованных снимках." />}
        resetHref="/baltika/players"
      >
      <AutoSubmitForm className="grid grid-cols-1 gap-3 md:grid-cols-5">
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
          <span className="mb-1 block font-medium text-slate-600"><I18nText en="Starter status" ru="Статус старта" /></span>
          <select name="starterFilter" defaultValue={starterFilter} className="w-full rounded border border-slate-200 px-3 py-2">
            <LocalizedOption value="" en="All players" ru="Все игроки" />
            <LocalizedOption value="starter" en="In starting XI" ru="В старте" />
            <LocalizedOption value="bench" en="Not in starting XI" ru="Не в старте" />
          </select>
        </label>
      </AutoSubmitForm>
      </FilterShell>

      <ResultsToolbar
        className="mt-5"
        title={<I18nText en={`${players.length} players shown`} ru={`Показано игроков: ${players.length}`} />}
        meta={<I18nText en={`Sorted by ${baltikaSortLabel(sort)}`} ru={`Сортировка: ${baltikaSortLabel(sort)}`} />}
        resetHref="/baltika/players"
      />

      <section className="mt-6 overflow-hidden rounded border border-slate-200 bg-white shadow-soft">
        <div className="sm:hidden">
          <SortableTable serverSortParam="sort" defaultSort={sort} className="min-w-full table-fixed divide-y divide-slate-200 text-xs">
            <thead className="bg-slate-50 text-left font-semibold uppercase text-slate-500">
              <tr>
                <th className="w-[42%] px-3 py-3" data-sort-key="playerName"><I18nText en="Surname" ru="Фамилия" /></th>
                <th className="w-[29%] bg-emerald-50 px-3 py-3 text-right text-emerald-700" data-sort-key="fantasyScore"><I18nText en="Forecast" ru="Прогноз" /></th>
                <th className="w-[29%] bg-sky-50 px-3 py-3 text-right text-sky-700" data-sort-key="scoringScore"><I18nText en="Scoring" ru="Скоринг" /></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {players.map((player) => (
                <tr key={player.id} className="hover:bg-slate-50">
                  <td className="max-w-[42vw] px-3 py-3 font-medium text-ink">
                    <span className="block truncate" title={player.playerName}>{compactPlayerName(player.playerName)}</span>
                    <span className="mt-0.5 flex min-w-0 items-center gap-1 text-[11px] font-normal text-slate-500">
                      <StarterBadge isStarter={player.isStarter} compact />
                      <span className="truncate">{player.positionGroup ?? "-"} · {player.team.name}</span>
                    </span>
                  </td>
                  <td className="whitespace-nowrap bg-emerald-50/70 px-3 py-3 text-right font-semibold text-emerald-700">
                    {formatScore(player.fantasyScore)}
                  </td>
                  <td className="whitespace-nowrap bg-sky-50/70 px-3 py-3 text-right font-semibold text-sky-700">
                    {formatScore(player.scoringScore)}
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

        <div className="hidden overflow-x-auto sm:block xl:hidden">
          <SortableTable serverSortParam="sort" defaultSort={sort} className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3" data-sort-key="playerName"><I18nText en="Player" ru="Игрок" /></th>
                <th className="px-4 py-3" data-sort-key="teamName"><I18nText en="Team" ru="Команда" /></th>
                <th className="px-4 py-3" data-sort-key="positionGroup"><I18nText en="Pos" ru="Поз." /></th>
                <th className="px-4 py-3" data-sort-key="isStarter"><I18nText en="Start" ru="В старте" /></th>
                <th className="px-4 py-3 text-right" data-sort-key="minutesPlayed"><I18nText en="Minutes" ru="Минуты" /></th>
                <th className="hidden px-4 py-3 text-right lg:table-cell" data-sort-key="goals"><I18nText en="Goals" ru="Голы" /></th>
                <th className="hidden px-4 py-3 text-right lg:table-cell" data-sort-key="assists"><I18nText en="Assists" ru="Ассисты" /></th>
                <th className="bg-emerald-50 px-4 py-3 text-right text-emerald-700" data-sort-key="fantasyScore"><I18nText en="Predicted FP" ru="Прогноз FP" /></th>
                <th className="bg-sky-50 px-4 py-3 text-right text-sky-700" data-sort-key="scoringScore"><I18nText en="Actual FP" ru="Реальные FP" /></th>
                <th className="bg-amber-50 px-4 py-3 text-right text-amber-700" data-sort-key="alternativeScore"><I18nText en="Alt FP" ru="Альт. FP" /></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {players.map((player) => (
                <tr key={player.id} className="hover:bg-slate-50">
                  <td className="whitespace-nowrap px-4 py-3 font-medium text-ink">{player.playerName}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-slate-600">{player.team.name}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-slate-600">{player.positionGroup ?? "-"}</td>
                  <td className="whitespace-nowrap px-4 py-3"><StarterBadge isStarter={player.isStarter} /></td>
                  <td className="whitespace-nowrap px-4 py-3 text-right text-slate-600">{formatNumber(player.minutesPlayed)}</td>
                  <td className="hidden whitespace-nowrap px-4 py-3 text-right text-slate-600 lg:table-cell">{formatScore(player.goals)}</td>
                  <td className="hidden whitespace-nowrap px-4 py-3 text-right text-slate-600 lg:table-cell">{formatScore(player.assists)}</td>
                  <td className="whitespace-nowrap bg-emerald-50/70 px-4 py-3 text-right font-semibold text-emerald-700">
                    {formatScore(player.fantasyScore)}
                  </td>
                  <td className="whitespace-nowrap bg-sky-50/70 px-4 py-3 text-right font-semibold text-sky-700">
                    {formatScore(player.scoringScore)}
                  </td>
                  <td className="whitespace-nowrap bg-amber-50/70 px-4 py-3 text-right font-semibold text-amber-700">
                    {formatScore(player.alternativeScore)}
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
          <SortableTable serverSortParam="sort" defaultSort={sort} className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3" data-sort-key="playerName"><I18nText en="Player" ru="Игрок" /></th>
                <th className="px-4 py-3" data-sort-key="teamName"><I18nText en="Team" ru="Команда" /></th>
                <th className="px-4 py-3" data-sort-key="positionGroup"><I18nText en="Pos" ru="Поз." /></th>
                <th className="px-4 py-3" data-sort-key="isStarter"><I18nText en="Start" ru="В старте" /></th>
                <th className="px-4 py-3 text-right" data-sort-key="age"><I18nText en="Age" ru="Возраст" /></th>
                <th className="px-4 py-3 text-right" data-sort-key="minutesPlayed"><I18nText en="Minutes" ru="Минуты" /></th>
                <th className="px-4 py-3 text-right" data-sort-key="goals"><I18nText en="Goals" ru="Голы" /></th>
                <th className="px-4 py-3 text-right" data-sort-key="xg">xG</th>
                <th className="px-4 py-3 text-right" data-sort-key="assists"><I18nText en="Assists" ru="Ассисты" /></th>
                <th className="px-4 py-3 text-right" data-sort-key="xa">xA</th>
                <th className="px-4 py-3 text-right" data-sort-key="marketValue"><I18nText en="Market" ru="Стоимость" /></th>
                <th className="bg-emerald-50 px-4 py-3 text-right text-emerald-700" data-sort-key="fantasyScore"><I18nText en="Predicted FP" ru="Прогноз FP" /></th>
                <th className="bg-sky-50 px-4 py-3 text-right text-sky-700" data-sort-key="scoringScore"><I18nText en="Actual FP" ru="Реальные FP" /></th>
                <th className="bg-amber-50 px-4 py-3 text-right text-amber-700" data-sort-key="alternativeScore"><I18nText en="Alt FP" ru="Альт. FP" /></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {players.map((player) => (
                <tr key={player.id} className="hover:bg-slate-50">
                  <td className="whitespace-nowrap px-4 py-3 font-medium text-ink">{player.playerName}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-slate-600">{player.team.name}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-slate-600">{player.positionGroup ?? "—"}</td>
                  <td className="whitespace-nowrap px-4 py-3"><StarterBadge isStarter={player.isStarter} /></td>
                  <td className="whitespace-nowrap px-4 py-3 text-right text-slate-600">{formatNumber(player.age)}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-right text-slate-600">{formatNumber(player.minutesPlayed)}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-right text-slate-600">{formatScore(player.goals)}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-right text-slate-600">{formatScore(player.xg)}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-right text-slate-600">{formatScore(player.assists)}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-right text-slate-600">{formatScore(player.xa)}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-right text-slate-600">{formatCurrency(player.marketValue)}</td>
                  <td className="whitespace-nowrap bg-emerald-50/70 px-4 py-3 text-right font-semibold text-emerald-700">
                    {formatScore(player.fantasyScore)}
                  </td>
                  <td className="whitespace-nowrap bg-sky-50/70 px-4 py-3 text-right font-semibold text-sky-700">
                    {formatScore(player.scoringScore)}
                  </td>
                  <td className="whitespace-nowrap bg-amber-50/70 px-4 py-3 text-right font-semibold text-amber-700">
                    {formatScore(player.alternativeScore)}
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
    </main>
  );
}

function compactPlayerName(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return parts.length > 1 ? parts[parts.length - 1] : name;
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
