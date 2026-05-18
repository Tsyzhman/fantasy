import { Prisma } from "@prisma/client";
import Link from "next/link";

import { MachetePlayerTable } from "@/components/machete/MachetePlayerTable";
import { PageBreadcrumbs } from "@/components/page-breadcrumbs";
import { AutoSubmitForm } from "@/components/players/auto-submit-form";
import { prisma } from "@/lib/db";
import { macheteLeagueDisplayName } from "@/lib/leagues/display";

export const dynamic = "force-dynamic";

type SearchParams = {
  leagueId?: string;
  teamId?: string;
  position?: string;
  minMinutes?: string;
  sort?: string;
};

type PageProps = {
  searchParams: SearchParams;
};

export default async function MachetePlayersPage({ searchParams }: PageProps) {
  const leagues = await prisma.macheteLeague.findMany({
    orderBy: { name: "asc" },
    include: {
      teams: {
        orderBy: { name: "asc" }
      }
    }
  });
  const sortedLeagues = [...leagues].sort((left, right) =>
    macheteLeagueDisplayName(left).localeCompare(macheteLeagueDisplayName(right))
  );

  const where: Prisma.MachetePlayerSnapshotWhereInput = {};
  if (searchParams.leagueId) where.leagueId = searchParams.leagueId;
  if (searchParams.teamId) where.teamId = searchParams.teamId;
  if (searchParams.position) where.position = { contains: searchParams.position, mode: "insensitive" };
  if (searchParams.minMinutes) {
    const minutes = Number(searchParams.minMinutes);
    if (Number.isFinite(minutes)) where.minutesPlayed = { gte: minutes };
  }

  const sort = searchParams.sort ?? "fantasyScore";
  const orderBy: Prisma.MachetePlayerSnapshotOrderByWithRelationInput =
    sort === "minutesPlayed"
      ? { minutesPlayed: "desc" }
      : sort === "playerName"
        ? { player: { name: "asc" } }
        : sort === "alternativeScore"
          ? { alternativeScore: { sort: "desc", nulls: "last" } }
          : { fantasyScore: { sort: "desc", nulls: "last" } };

  const snapshots = await prisma.machetePlayerSnapshot.findMany({
    where,
    orderBy,
    take: 250,
    include: {
      player: {
        include: {
          team: {
            include: {
              league: true
            }
          }
        }
      }
    }
  });

  const players = snapshots.map((snapshot) => ({
    id: snapshot.id,
    name: snapshot.player.name,
    teamName: snapshot.player.team?.name ?? null,
    leagueName: snapshot.player.team?.league ? macheteLeagueDisplayName(snapshot.player.team.league) : null,
    position: snapshot.position,
    age: snapshot.player.age,
    nationality: snapshot.player.nationality,
    matchesPlayed: snapshot.matchesPlayed,
    minutesPlayed: snapshot.minutesPlayed,
    goals: snapshot.goals,
    assists: snapshot.assists,
    shotsOnTarget: snapshot.shotsOnTarget,
    keyPasses: snapshot.keyPasses,
    tackles: snapshot.tackles,
    averageRating: snapshot.averageRating,
    fantasyScore: snapshot.fantasyScore,
    alternativeScore: snapshot.alternativeScore
  }));

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <PageBreadcrumbs
        backHref="/machete"
        backLabel="Back to Machete"
        items={[
          { label: "Machete", href: "/machete" },
          { label: "Players", href: "/machete/players" }
        ]}
      />
      <div className="mt-5 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">Machete player explorer</p>
          <h1 className="mt-2 text-3xl font-bold text-ink">FotMob players</h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-600">
            Separate Machete snapshots with their own primary and alternative predictions.
          </p>
        </div>
        <Link href="/machete" className="rounded bg-ink px-3 py-2 text-sm font-semibold text-white hover:bg-slate-700">
          Back to Machete
        </Link>
      </div>

      <AutoSubmitForm className="mt-8 grid grid-cols-1 gap-3 rounded border border-slate-200 bg-white p-4 shadow-soft md:grid-cols-5">
        <label className="text-sm">
          <span className="mb-1 block font-medium text-slate-600">League</span>
          <select name="leagueId" defaultValue={searchParams.leagueId ?? ""} className="w-full rounded border border-slate-200 px-3 py-2">
            <option value="">All leagues</option>
            {sortedLeagues.map((league) => (
              <option key={league.id} value={league.id}>
                {macheteLeagueDisplayName(league)}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <span className="mb-1 block font-medium text-slate-600">Team</span>
          <select name="teamId" defaultValue={searchParams.teamId ?? ""} className="w-full rounded border border-slate-200 px-3 py-2">
            <option value="">All teams</option>
            {sortedLeagues.flatMap((league) =>
              league.teams.map((team) => (
                <option key={team.id} value={team.id}>
                  {team.name} - {macheteLeagueDisplayName(league)}
                </option>
              ))
            )}
          </select>
        </label>
        <label className="text-sm">
          <span className="mb-1 block font-medium text-slate-600">Position</span>
          <input
            name="position"
            defaultValue={searchParams.position ?? ""}
            className="w-full rounded border border-slate-200 px-3 py-2"
            placeholder="Defender"
          />
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
            <option value="fantasyScore">Expected FP</option>
            <option value="alternativeScore">Alt FP</option>
            <option value="minutesPlayed">Minutes</option>
            <option value="playerName">Player name</option>
          </select>
        </label>
      </AutoSubmitForm>

      <section className="mt-6">
        <MachetePlayerTable players={players} showContext />
      </section>
    </main>
  );
}
