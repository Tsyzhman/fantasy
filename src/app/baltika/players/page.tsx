import { ImportStatus, Prisma } from "@prisma/client";
import Link from "next/link";

import { I18nText } from "@/components/i18n-text";
import { LocalizedOption } from "@/components/localized-option";
import { AutoSubmitForm } from "@/components/players/auto-submit-form";
import { PageBreadcrumbs } from "@/components/page-breadcrumbs";
import { formatCurrency, formatNumber, formatScore } from "@/lib/format";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

type SearchParams = {
  leagueId?: string;
  teamId?: string;
  positionGroup?: string;
  minMinutes?: string;
  starterOnly?: string;
  sort?: string;
};

type PageProps = {
  searchParams: Promise<SearchParams>;
};

const positions = ["GK", "DEF", "MID", "FWD", "UNKNOWN"];

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

  const where: Prisma.PlayerSnapshotWhereInput = {
    teamImport: {
      status: ImportStatus.PUBLISHED,
      isCurrentPublished: true
    }
  };

  if (selectedLeagueId) where.leagueId = selectedLeagueId;
  if (selectedTeamId) where.teamId = selectedTeamId;
  if (resolvedSearchParams.positionGroup) where.positionGroup = resolvedSearchParams.positionGroup;
  if (resolvedSearchParams.starterOnly === "1") where.isStarter = true;
  if (resolvedSearchParams.minMinutes) {
    const minutes = Number(resolvedSearchParams.minMinutes);
    if (Number.isFinite(minutes)) where.minutesPlayed = { gte: minutes };
  }

  const sort = resolvedSearchParams.sort ?? "fantasyScore";
  const orderBy: Prisma.PlayerSnapshotOrderByWithRelationInput =
    sort === "minutesPlayed"
        ? { minutesPlayed: { sort: "desc", nulls: "last" } }
        : sort === "playerName"
          ? { playerName: "asc" }
          : sort === "alternativeScore"
            ? { alternativeScore: { sort: "desc", nulls: "last" } }
            : sort === "scoringScore"
              ? { scoringScore: { sort: "desc", nulls: "last" } }
            : { fantasyScore: { sort: "desc", nulls: "last" } };

  const players = await prisma.playerSnapshot.findMany({
    where,
    orderBy,
    take: 250,
    include: {
      league: true,
      team: true
    }
  });

  const columnsCount = 13;

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

      <AutoSubmitForm className="mt-8 grid grid-cols-1 gap-3 rounded border border-slate-200 bg-white p-4 shadow-soft md:grid-cols-6">
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
          <span className="mb-1 block font-medium text-slate-600"><I18nText en="Sort" ru="Сортировка" /></span>
          <select name="sort" defaultValue={sort} className="w-full rounded border border-slate-200 px-3 py-2">
            <LocalizedOption value="fantasyScore" en="Predicted FP" ru="Прогноз FP" />
            <LocalizedOption value="scoringScore" en="Actual FP" ru="Реальные FP" />
            <LocalizedOption value="alternativeScore" en="Alt FP" ru="Альт. FP" />
            <LocalizedOption value="minutesPlayed" en="Minutes" ru="Минуты" />
            <LocalizedOption value="playerName" en="Player name" ru="Имя игрока" />
          </select>
        </label>
        <label className="flex items-end gap-2 rounded border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700">
          <input
            type="checkbox"
            name="starterOnly"
            value="1"
            defaultChecked={resolvedSearchParams.starterOnly === "1"}
            className="mb-1 h-4 w-4 rounded border-slate-300"
          />
          <span><I18nText en="Starters only" ru="Только стартовые" /></span>
        </label>
      </AutoSubmitForm>

      <section className="mt-6 overflow-hidden rounded border border-slate-200 bg-white shadow-soft">
        <div className="sm:hidden">
          <table className="min-w-full table-fixed divide-y divide-slate-200 text-xs">
            <thead className="bg-slate-50 text-left font-semibold uppercase text-slate-500">
              <tr>
                <th className="w-[42%] px-3 py-3"><I18nText en="Surname" ru="Фамилия" /></th>
                <th className="w-[29%] bg-emerald-50 px-3 py-3 text-right text-emerald-700"><I18nText en="Forecast" ru="Прогноз" /></th>
                <th className="w-[29%] bg-sky-50 px-3 py-3 text-right text-sky-700"><I18nText en="Scoring" ru="Скоринг" /></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {players.map((player) => (
                <tr key={player.id} className="hover:bg-slate-50">
                  <td className="max-w-[42vw] px-3 py-3 font-medium text-ink">
                    <span className="block truncate" title={player.playerName}>{compactPlayerName(player.playerName)}</span>
                    <span className="mt-0.5 block truncate text-[11px] font-normal text-slate-500">{player.positionGroup ?? "-"} · {player.team.name}</span>
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
          </table>
        </div>

        <div className="hidden overflow-x-auto sm:block xl:hidden">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3"><I18nText en="Player" ru="Игрок" /></th>
                <th className="px-4 py-3"><I18nText en="Team" ru="Команда" /></th>
                <th className="px-4 py-3"><I18nText en="Pos" ru="Поз." /></th>
                <th className="px-4 py-3 text-right"><I18nText en="Minutes" ru="Минуты" /></th>
                <th className="hidden px-4 py-3 text-right lg:table-cell"><I18nText en="Goals" ru="Голы" /></th>
                <th className="hidden px-4 py-3 text-right lg:table-cell"><I18nText en="Assists" ru="Ассисты" /></th>
                <th className="bg-emerald-50 px-4 py-3 text-right text-emerald-700"><I18nText en="Predicted FP" ru="Прогноз FP" /></th>
                <th className="bg-sky-50 px-4 py-3 text-right text-sky-700"><I18nText en="Actual FP" ru="Реальные FP" /></th>
                <th className="bg-amber-50 px-4 py-3 text-right text-amber-700"><I18nText en="Alt FP" ru="Альт. FP" /></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {players.map((player) => (
                <tr key={player.id} className="hover:bg-slate-50">
                  <td className="whitespace-nowrap px-4 py-3 font-medium text-ink">{player.playerName}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-slate-600">{player.team.name}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-slate-600">{player.positionGroup ?? "-"}</td>
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
                  <td colSpan={9} className="px-4 py-10 text-center text-slate-500">
                    <I18nText en="No published player snapshots match these filters yet." ru="Пока нет опубликованных игроков под эти фильтры." />
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        <div className="hidden overflow-x-auto xl:block">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3"><I18nText en="Player" ru="Игрок" /></th>
                <th className="px-4 py-3"><I18nText en="Team" ru="Команда" /></th>
                <th className="px-4 py-3"><I18nText en="Pos" ru="Поз." /></th>
                <th className="px-4 py-3 text-right"><I18nText en="Age" ru="Возраст" /></th>
                <th className="px-4 py-3 text-right"><I18nText en="Minutes" ru="Минуты" /></th>
                <th className="px-4 py-3 text-right"><I18nText en="Goals" ru="Голы" /></th>
                <th className="px-4 py-3 text-right">xG</th>
                <th className="px-4 py-3 text-right"><I18nText en="Assists" ru="Ассисты" /></th>
                <th className="px-4 py-3 text-right">xA</th>
                <th className="px-4 py-3 text-right"><I18nText en="Market" ru="Стоимость" /></th>
                <th className="bg-emerald-50 px-4 py-3 text-right text-emerald-700"><I18nText en="Predicted FP" ru="Прогноз FP" /></th>
                <th className="bg-sky-50 px-4 py-3 text-right text-sky-700"><I18nText en="Actual FP" ru="Реальные FP" /></th>
                <th className="bg-amber-50 px-4 py-3 text-right text-amber-700"><I18nText en="Alt FP" ru="Альт. FP" /></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {players.map((player) => (
                <tr key={player.id} className="hover:bg-slate-50">
                  <td className="whitespace-nowrap px-4 py-3 font-medium text-ink">{player.playerName}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-slate-600">{player.team.name}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-slate-600">{player.positionGroup ?? "—"}</td>
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
          </table>
        </div>
      </section>
    </main>
  );
}

function compactPlayerName(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return parts.length > 1 ? parts[parts.length - 1] : name;
}
