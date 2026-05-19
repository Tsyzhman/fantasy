import { Prisma } from "@prisma/client";
import Link from "next/link";

import { I18nText } from "@/components/i18n-text";
import { MachetePlayerTable } from "@/components/machete/MachetePlayerTable";
import { PageBreadcrumbs } from "@/components/page-breadcrumbs";
import { AutoSubmitForm } from "@/components/players/auto-submit-form";
import { prisma } from "@/lib/db";
import { macheteLeagueDisplayName } from "@/lib/leagues/display";
import { getActiveScoringModelForSource } from "@/lib/scoring";
import { aggregateRecentMachetePlayerStats, parseRecentMatchWindow, recentTeamFixtureIds } from "@/scoring/machete/recent-match-stats";

export const dynamic = "force-dynamic";

type SearchParams = {
  leagueId?: string;
  teamId?: string;
  position?: string;
  minMinutes?: string;
  recentMatches?: string;
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
  const sort = resolvedSearchParams.sort ?? "fantasyScore";
  const recentMatches = parseRecentMatchWindow(resolvedSearchParams.recentMatches);

  const players = recentMatches
    ? await buildRecentMatchRows({
        selectedLeagueId,
        selectedTeamId,
        position: resolvedSearchParams.position,
        minMinutes: resolvedSearchParams.minMinutes,
        recentMatches,
        sort
      })
    : await buildSnapshotRows({
        selectedLeagueId,
        selectedTeamId,
        position: resolvedSearchParams.position,
        minMinutes: resolvedSearchParams.minMinutes,
        sort
      });

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

      <AutoSubmitForm className="mt-8 grid grid-cols-1 gap-3 rounded border border-slate-200 bg-white p-4 shadow-soft md:grid-cols-6">
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
        <label className="text-sm">
          <span className="mb-1 block font-medium text-slate-600"><I18nText en="Last team matches" ru="Последние матчи" /></span>
          <input
            name="recentMatches"
            type="number"
            min="1"
            max="50"
            defaultValue={resolvedSearchParams.recentMatches ?? ""}
            className="w-full rounded border border-slate-200 px-3 py-2"
            placeholder="6"
          />
        </label>
      </AutoSubmitForm>

      {recentMatches ? (
        <p className="mt-3 text-sm text-slate-500">
          Stats and FP are recalculated from the last {recentMatches} played matches for each player team.
        </p>
      ) : null}

      <section className="mt-6">
        <MachetePlayerTable players={players} showContext />
      </section>
    </main>
  );
}

async function buildSnapshotRows({
  selectedLeagueId,
  selectedTeamId,
  position,
  minMinutes,
  sort
}: {
  selectedLeagueId: string;
  selectedTeamId: string;
  position?: string;
  minMinutes?: string;
  sort: string;
}) {
  const where: Prisma.MachetePlayerSnapshotWhereInput = {};
  if (selectedLeagueId) where.leagueId = selectedLeagueId;
  if (selectedTeamId) where.teamId = selectedTeamId;
  if (position) where.position = { contains: position, mode: "insensitive" };
  if (minMinutes) {
    const minutes = Number(minMinutes);
    if (Number.isFinite(minutes)) where.minutesPlayed = { gte: minutes };
  }

  const snapshots = await prisma.machetePlayerSnapshot.findMany({
    where,
    orderBy: snapshotOrderBy(sort),
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

  return snapshots.map((snapshot) => ({
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
}

async function buildRecentMatchRows({
  selectedLeagueId,
  selectedTeamId,
  position,
  minMinutes,
  recentMatches,
  sort
}: {
  selectedLeagueId: string;
  selectedTeamId: string;
  position?: string;
  minMinutes?: string;
  recentMatches: number;
  sort: string;
}) {
  const playerWhere: Prisma.MachetePlayerWhereInput = {};
  if (selectedTeamId) playerWhere.teamId = selectedTeamId;
  else if (selectedLeagueId) playerWhere.team = { leagueId: selectedLeagueId };
  if (position) playerWhere.position = { contains: position, mode: "insensitive" };

  const sourcePlayers = await prisma.machetePlayer.findMany({
    where: playerWhere,
    include: {
      team: {
        include: {
          league: true
        }
      },
      matchStats: {
        include: {
          fixture: {
            select: {
              id: true,
              status: true,
              kickoffAt: true
            }
          }
        }
      }
    }
  });
  const teamIds = [...new Set(sourcePlayers.map((player) => player.teamId).filter((teamId): teamId is string => Boolean(teamId)))];
  const teams = await prisma.macheteTeam.findMany({
    where: { id: { in: teamIds } },
    include: {
      fixturesHome: { select: { id: true, status: true, kickoffAt: true } },
      fixturesAway: { select: { id: true, status: true, kickoffAt: true } }
    }
  });
  const fixtureIdsByTeam = new Map(
    teams.map((team) => [team.id, recentTeamFixtureIds([...team.fixturesHome, ...team.fixturesAway], recentMatches)] as const)
  );
  const scoringModel = await getActiveScoringModelForSource("MACHETE");
  const minimumMinutes = minMinutes ? Number(minMinutes) : null;

  return sourcePlayers
    .map((player) => {
      const stats = aggregateRecentMachetePlayerStats(
        player.matchStats,
        player.position,
        scoringModel,
        player.teamId ? fixtureIdsByTeam.get(player.teamId) ?? new Set<string>() : new Set<string>()
      );

      return {
        id: player.id,
        name: player.name,
        teamName: player.team?.name ?? null,
        leagueName: player.team?.league ? macheteLeagueDisplayName(player.team.league) : null,
        position: player.position,
        age: player.age,
        nationality: player.nationality,
        matchesPlayed: stats.matchesPlayed,
        minutesPlayed: stats.minutesPlayed,
        goals: stats.goals,
        assists: stats.assists,
        shotsOnTarget: stats.shotsOnTarget,
        keyPasses: stats.keyPasses,
        tackles: stats.tackles,
        averageRating: stats.averageRating,
        fantasyScore: stats.fantasyScore,
        scoringScore: stats.scoringScore,
        alternativeScore: stats.alternativeScore
      };
    })
    .filter((player) => (minimumMinutes !== null && Number.isFinite(minimumMinutes) ? player.minutesPlayed >= minimumMinutes : true))
    .sort((left, right) => compareMacheteRows(left, right, sort))
    .slice(0, 250);
}

type MacheteSortableRow = Awaited<ReturnType<typeof buildSnapshotRows>>[number];

function snapshotOrderBy(sort: string): Prisma.MachetePlayerSnapshotOrderByWithRelationInput {
  if (sort === "minutesPlayed") return { minutesPlayed: "desc" };
  if (sort === "playerName") return { player: { name: "asc" } };
  if (sort === "alternativeScore") return { alternativeScore: { sort: "desc", nulls: "last" } };
  if (sort === "scoringScore") return { scoringScore: { sort: "desc", nulls: "last" } };
  return { fantasyScore: { sort: "desc", nulls: "last" } };
}

function compareMacheteRows(left: MacheteSortableRow, right: MacheteSortableRow, sort: string) {
  if (sort === "playerName") return left.name.localeCompare(right.name);
  if (sort === "minutesPlayed") return right.minutesPlayed - left.minutesPlayed;
  if (sort === "scoringScore") return (right.scoringScore ?? -Infinity) - (left.scoringScore ?? -Infinity);
  if (sort === "alternativeScore") return (right.alternativeScore ?? -Infinity) - (left.alternativeScore ?? -Infinity);
  return (right.fantasyScore ?? -Infinity) - (left.fantasyScore ?? -Infinity);
}
