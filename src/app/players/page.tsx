import { ImportStatus, Prisma } from "@prisma/client";
import Link from "next/link";

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
  searchParams: SearchParams;
};

const positions = ["GK", "DEF", "MID", "FWD", "UNKNOWN"];

export default async function PlayersPage({ searchParams }: PageProps) {
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

  const where: Prisma.PlayerSnapshotWhereInput = {
    teamImport: {
      status: ImportStatus.PUBLISHED,
      isCurrentPublished: true
    }
  };

  if (searchParams.leagueId) where.leagueId = searchParams.leagueId;
  if (searchParams.teamId) where.teamId = searchParams.teamId;
  if (searchParams.positionGroup) where.positionGroup = searchParams.positionGroup;
  if (searchParams.starterOnly === "1") where.isStarter = true;
  if (searchParams.minMinutes) {
    const minutes = Number(searchParams.minMinutes);
    if (Number.isFinite(minutes)) where.minutesPlayed = { gte: minutes };
  }

  const sort = searchParams.sort ?? "fantasyScore";
  const orderBy: Prisma.PlayerSnapshotOrderByWithRelationInput =
    sort === "valueScore"
      ? { valueScore: { sort: "desc", nulls: "last" } }
      : sort === "minutesPlayed"
        ? { minutesPlayed: { sort: "desc", nulls: "last" } }
        : sort === "playerName"
          ? { playerName: "asc" }
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

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">Player explorer</p>
          <h1 className="mt-2 text-3xl font-bold text-ink">Published players</h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-600">
            This table only reads snapshots from imports marked current and published.
          </p>
        </div>
        <Link href="/admin/leagues" className="rounded bg-ink px-3 py-2 text-sm font-semibold text-white hover:bg-slate-700">
          Back to admin
        </Link>
      </div>

      <form className="mt-8 grid grid-cols-1 gap-3 rounded border border-slate-200 bg-white p-4 shadow-soft md:grid-cols-6">
        <label className="text-sm">
          <span className="mb-1 block font-medium text-slate-600">League</span>
          <select name="leagueId" defaultValue={searchParams.leagueId ?? ""} className="w-full rounded border border-slate-200 px-3 py-2">
            <option value="">All leagues</option>
            {leagues.map((league) => (
              <option key={league.id} value={league.id}>
                {league.name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <span className="mb-1 block font-medium text-slate-600">Team</span>
          <select name="teamId" defaultValue={searchParams.teamId ?? ""} className="w-full rounded border border-slate-200 px-3 py-2">
            <option value="">All teams</option>
            {leagues.flatMap((league) =>
              league.teams.map((team) => (
                <option key={team.id} value={team.id}>
                  {team.name}
                </option>
              ))
            )}
          </select>
        </label>
        <label className="text-sm">
          <span className="mb-1 block font-medium text-slate-600">Position</span>
          <select
            name="positionGroup"
            defaultValue={searchParams.positionGroup ?? ""}
            className="w-full rounded border border-slate-200 px-3 py-2"
          >
            <option value="">All positions</option>
            {positions.map((position) => (
              <option key={position} value={position}>
                {position}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <span className="mb-1 block font-medium text-slate-600">Min minutes</span>
          <input
            name="minMinutes"
            type="number"
            min="0"
            defaultValue={searchParams.minMinutes ?? ""}
            className="w-full rounded border border-slate-200 px-3 py-2"
            placeholder="0"
          />
        </label>
        <label className="text-sm">
          <span className="mb-1 block font-medium text-slate-600">Sort</span>
          <select name="sort" defaultValue={sort} className="w-full rounded border border-slate-200 px-3 py-2">
            <option value="fantasyScore">Fantasy score</option>
            <option value="valueScore">Value score</option>
            <option value="minutesPlayed">Minutes</option>
            <option value="playerName">Player name</option>
          </select>
        </label>
        <label className="flex items-end gap-2 rounded border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700">
          <input
            type="checkbox"
            name="starterOnly"
            value="1"
            defaultChecked={searchParams.starterOnly === "1"}
            className="mb-1 h-4 w-4 rounded border-slate-300"
          />
          <span>Только в старте</span>
        </label>
        <div className="md:col-span-6">
          <button type="submit" className="rounded bg-ink px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700">
            Apply filters
          </button>
        </div>
      </form>

      <section className="mt-6 overflow-hidden rounded border border-slate-200 bg-white shadow-soft">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3">Player</th>
                <th className="px-4 py-3">Team</th>
                <th className="px-4 py-3">Pos</th>
                <th className="px-4 py-3 text-right">Age</th>
                <th className="px-4 py-3 text-right">Minutes</th>
                <th className="px-4 py-3 text-right">Goals</th>
                <th className="px-4 py-3 text-right">xG</th>
                <th className="px-4 py-3 text-right">Assists</th>
                <th className="px-4 py-3 text-right">xA</th>
                <th className="px-4 py-3 text-right">Market</th>
                <th className="px-4 py-3 text-right">Fantasy</th>
                <th className="px-4 py-3 text-right">Value</th>
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
                  <td className="whitespace-nowrap px-4 py-3 text-right font-semibold text-ink">{formatScore(player.fantasyScore)}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-right font-semibold text-ink">{formatScore(player.valueScore)}</td>
                </tr>
              ))}
              {players.length === 0 ? (
                <tr>
                  <td colSpan={12} className="px-4 py-10 text-center text-slate-500">
                    No published player snapshots match these filters yet.
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
