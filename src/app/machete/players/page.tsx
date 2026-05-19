import { Prisma } from "@prisma/client";
import Link from "next/link";

import { I18nText } from "@/components/i18n-text";
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
  searchParams: Promise<SearchParams>;
};

export default async function MachetePlayersPage({ searchParams }: PageProps) {
  const resolvedSearchParams = await searchParams;
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
  const selectedLeagueId = resolvedSearchParams.leagueId ?? "";
  const teamLeagues = selectedLeagueId ? sortedLeagues.filter((league) => league.id === selectedLeagueId) : sortedLeagues;
  const selectedTeamId =
    resolvedSearchParams.teamId && teamLeagues.some((league) => league.teams.some((team) => team.id === resolvedSearchParams.teamId))
      ? resolvedSearchParams.teamId
      : "";

  const where: Prisma.MachetePlayerSnapshotWhereInput = {};
  if (selectedLeagueId) where.leagueId = selectedLeagueId;
  if (selectedTeamId) where.teamId = selectedTeamId;
  if (resolvedSearchParams.position) where.position = { contains: resolvedSearchParams.position, mode: "insensitive" };
  if (resolvedSearchParams.minMinutes) {
    const minutes = Number(resolvedSearchParams.minMinutes);
    if (Number.isFinite(minutes)) where.minutesPlayed = { gte: minutes };
  }

  const sort = resolvedSearchParams.sort ?? "fantasyScore";
  const orderBy: Prisma.MachetePlayerSnapshotOrderByWithRelationInput =
    sort === "minutesPlayed"
      ? { minutesPlayed: "desc" }
      : sort === "playerName"
        ? { player: { name: "asc" } }
        : sort === "alternativeScore"
          ? { alternativeScore: { sort: "desc", nulls: "last" } }
          : sort === "scoringScore"
            ? { scoringScore: { sort: "desc", nulls: "last" } }
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
    scoringScore: snapshot.scoringScore,
    alternativeScore: snapshot.alternativeScore
  }));

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
              en="Separate Machete snapshots with their own Expected FP, Actual FP and Alt FP values."
              ru="Отдельные снапшоты Machete со своими Expected FP, Реальные FP и Alt FP."
            />
          </p>
        </div>
        <Link href="/machete/leagues" className="rounded bg-ink px-3 py-2 text-sm font-semibold text-white hover:bg-slate-700">
          <I18nText en="Back to Machete leagues" ru="Назад к лигам Machete" />
        </Link>
      </div>

      <AutoSubmitForm className="mt-8 grid grid-cols-1 gap-3 rounded border border-slate-200 bg-white p-4 shadow-soft md:grid-cols-5">
        <label className="text-sm">
          <span className="mb-1 block font-medium text-slate-600"><I18nText en="League" ru="Лига" /></span>
          <select name="leagueId" defaultValue={selectedLeagueId} className="w-full rounded border border-slate-200 px-3 py-2">
            <option value="">All leagues / Все лиги</option>
            {sortedLeagues.map((league) => (
              <option key={league.id} value={league.id}>
                {macheteLeagueDisplayName(league)}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <span className="mb-1 block font-medium text-slate-600"><I18nText en="Team" ru="Команда" /></span>
          <select name="teamId" defaultValue={selectedTeamId} className="w-full rounded border border-slate-200 px-3 py-2">
            <option value="">All teams / Все команды</option>
            {teamLeagues.flatMap((league) =>
              league.teams.map((team) => (
                <option key={team.id} value={team.id}>
                  {selectedLeagueId ? team.name : `${team.name} - ${macheteLeagueDisplayName(league)}`}
                </option>
              ))
            )}
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
      </AutoSubmitForm>

      <section className="mt-6">
        <MachetePlayerTable players={players} showContext />
      </section>
    </main>
  );
}
