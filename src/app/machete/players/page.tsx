import { Prisma } from "@prisma/client";
import Link from "next/link";

import { I18nText } from "@/components/i18n-text";
import { MachetePlayerTable } from "@/components/machete/MachetePlayerTable";
import { PageBreadcrumbs } from "@/components/page-breadcrumbs";
import { AutoSubmitForm } from "@/components/players/auto-submit-form";
import { prisma } from "@/lib/db";
import { macheteLeagueDisplayName } from "@/lib/leagues/display";
import { getActiveScoringModelForSource } from "@/lib/scoring";
import { matchWindowLabel, matchWindowModeValue, parseMacheteMatchWindow, type MacheteMatchWindow } from "@/scoring/machete/match-window";
import { aggregateRecentMachetePlayerStats, teamFixtureIdsForWindow } from "@/scoring/machete/recent-match-stats";

export const dynamic = "force-dynamic";

type SearchParams = {
  leagueId?: string;
  teamId?: string;
  position?: string;
  minMinutes?: string;
  recentMatches?: string;
  matchWindow?: string;
  customMatches?: string;
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
  const matchWindow = parseMacheteMatchWindow({
    mode: resolvedSearchParams.matchWindow,
    customMatches: resolvedSearchParams.customMatches,
    legacyRecentMatches: resolvedSearchParams.recentMatches
  });

  const players = await buildMatchWindowRows({
    selectedLeagueId,
    selectedTeamId,
    position: resolvedSearchParams.position,
    minMinutes: resolvedSearchParams.minMinutes,
    matchWindow,
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
      </AutoSubmitForm>

      <p className="mt-3 text-sm text-slate-500">Stats and FP are recalculated from {matchWindowLabel(matchWindow)}.</p>

      <section className="mt-6">
        <MachetePlayerTable players={players} showContext />
      </section>
    </main>
  );
}

async function buildMatchWindowRows({
  selectedLeagueId,
  selectedTeamId,
  position,
  minMinutes,
  matchWindow,
  sort
}: {
  selectedLeagueId: string;
  selectedTeamId: string;
  position?: string;
  minMinutes?: string;
  matchWindow: MacheteMatchWindow;
  sort: string;
}) {
  const teams = await prisma.macheteTeam.findMany({
    where: selectedTeamId ? { id: selectedTeamId } : selectedLeagueId ? { leagueId: selectedLeagueId } : undefined,
    include: {
      league: true,
      fixturesHome: { select: { id: true, status: true, kickoffAt: true } },
      fixturesAway: { select: { id: true, status: true, kickoffAt: true } }
    }
  });
  const teamIds = teams.map((team) => team.id);
  const playerWhere: Prisma.MachetePlayerWhereInput = teamIds.length
    ? {
        OR: [
          { teamId: { in: teamIds } },
          {
            matchStats: {
              some: {
                teamId: { in: teamIds }
              }
            }
          }
        ]
      }
    : {};
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
        where: teamIds.length ? { teamId: { in: teamIds } } : undefined,
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
  const fixtureIdsByTeam = new Map(
    teams.map(
      (team) =>
        [
          team.id,
          teamFixtureIdsForWindow([...team.fixturesHome, ...team.fixturesAway], matchWindow, team.league.season, team.league.providerLeagueId)
        ] as const
    )
  );
  const scoringModel = await getActiveScoringModelForSource("MACHETE");
  const minimumMinutes = minMinutes ? Number(minMinutes) : null;

  return teams
    .flatMap((team) =>
      sourcePlayers.map((player) => {
      const stats = aggregateRecentMachetePlayerStats(
        player.matchStats.filter((stat) => stat.teamId === team.id),
        player.position,
        scoringModel,
        fixtureIdsByTeam.get(team.id) ?? new Set<string>()
      );

      return {
        id: `${player.id}:${team.id}`,
        name: player.name,
        teamName: team.name,
        leagueName: macheteLeagueDisplayName(team.league),
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
    )
    .filter((player) => (minimumMinutes !== null && Number.isFinite(minimumMinutes) ? player.minutesPlayed >= minimumMinutes : true))
    .sort((left, right) => compareMacheteRows(left, right, sort))
    .slice(0, 250);
}

type MacheteSortableRow = {
  name: string;
  minutesPlayed: number;
  fantasyScore: number | null;
  scoringScore?: number | null;
  alternativeScore?: number | null;
};

function compareMacheteRows(left: MacheteSortableRow, right: MacheteSortableRow, sort: string) {
  if (sort === "playerName") return left.name.localeCompare(right.name);
  if (sort === "minutesPlayed") return right.minutesPlayed - left.minutesPlayed;
  if (sort === "scoringScore") return (right.scoringScore ?? -Infinity) - (left.scoringScore ?? -Infinity);
  if (sort === "alternativeScore") return (right.alternativeScore ?? -Infinity) - (left.alternativeScore ?? -Infinity);
  return (right.fantasyScore ?? -Infinity) - (left.fantasyScore ?? -Infinity);
}
