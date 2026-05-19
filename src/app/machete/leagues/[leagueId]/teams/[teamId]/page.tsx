import { Database, GitCompareArrows, Shield } from "lucide-react";
import { notFound } from "next/navigation";

import { MacheteFixtureTable } from "@/components/machete/MacheteFixtureTable";
import { MachetePlayerTable } from "@/components/machete/MachetePlayerTable";
import { MacheteStatusBadge } from "@/components/machete/MacheteStatusBadge";
import { MacheteSyncButton } from "@/components/machete/MacheteSyncButton";
import { PageBreadcrumbs } from "@/components/page-breadcrumbs";
import { AutoSubmitForm } from "@/components/players/auto-submit-form";
import { I18nText } from "@/components/i18n-text";
import { prisma } from "@/lib/db";
import { formatDate, formatNumber, formatScore } from "@/lib/format";
import { macheteLeagueDisplayName } from "@/lib/leagues/display";
import { getActiveScoringModelForSource } from "@/lib/scoring";
import { aggregateRecentMachetePlayerStats, parseRecentMatchWindow, recentTeamFixtureIds } from "@/scoring/machete/recent-match-stats";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{
    leagueId: string;
    teamId: string;
  }>;
  searchParams?: Promise<{
    recentMatches?: string;
  }>;
};

export default async function MacheteTeamPage({ params, searchParams }: PageProps) {
  const { leagueId, teamId } = await params;
  const resolvedSearchParams = (await searchParams) ?? {};
  const recentMatches = parseRecentMatchWindow(resolvedSearchParams.recentMatches);
  const team = await prisma.macheteTeam.findUnique({
    where: { id: teamId },
    include: {
      league: true,
      players: {
        orderBy: { name: "asc" },
        include: {
          snapshots: {
            where: { leagueId },
            orderBy: { createdAt: "desc" },
            take: 1
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
      },
      fixturesHome: {
        include: { homeTeam: true, awayTeam: true },
        orderBy: { kickoffAt: "desc" }
      },
      fixturesAway: {
        include: { homeTeam: true, awayTeam: true },
        orderBy: { kickoffAt: "desc" }
      }
    }
  });

  if (!team || team.leagueId !== leagueId) notFound();
  const leagueDisplayName = macheteLeagueDisplayName(team.league);

  const teamFixtures = [...team.fixturesHome, ...team.fixturesAway].filter(isMatchFixture);
  const providerIds = [
    team.providerTeamId,
    ...team.players.map((player) => player.providerPlayerId),
    ...teamFixtures.map((fixture) => fixture.providerFixtureId)
  ].filter((value): value is string => Boolean(value));

  const [rawPayloads, entityMap] = await Promise.all([
    prisma.macheteRawPayload.findMany({
      where: {
        provider: "FOTMOB",
        providerEntityId: { in: providerIds }
      },
      orderBy: { createdAt: "desc" },
      take: 8
    }),
    team.providerTeamId
      ? prisma.providerEntityMap.findUnique({
          where: {
            provider_providerEntityType_providerEntityId_internalEntityType: {
              provider: "FOTMOB",
              providerEntityType: "TEAM",
              providerEntityId: team.providerTeamId,
              internalEntityType: "TEAM"
            }
          }
        })
      : null
  ]);

  const fixtures = teamFixtures
    .sort((a, b) => (b.kickoffAt?.getTime() ?? 0) - (a.kickoffAt?.getTime() ?? 0))
    .slice(0, 8);
  const recentFixtureIds = recentMatches ? recentTeamFixtureIds(teamFixtures, recentMatches) : null;
  const scoringModel = recentMatches ? await getActiveScoringModelForSource("MACHETE") : null;

  const players = team.players.map((player) => {
    const snapshot = player.snapshots[0];
    const recentStats =
      recentFixtureIds && scoringModel
        ? aggregateRecentMachetePlayerStats(player.matchStats, player.position, scoringModel, recentFixtureIds)
        : null;
    return {
      id: player.id,
      name: player.name,
      position: player.position,
      age: player.age,
      nationality: player.nationality,
      matchesPlayed: recentStats?.matchesPlayed ?? snapshot?.matchesPlayed ?? 0,
      minutesPlayed: recentStats?.minutesPlayed ?? snapshot?.minutesPlayed ?? 0,
      goals: recentStats?.goals ?? snapshot?.goals ?? 0,
      assists: recentStats?.assists ?? snapshot?.assists ?? 0,
      shotsOnTarget: recentStats?.shotsOnTarget ?? snapshot?.shotsOnTarget ?? 0,
      keyPasses: recentStats?.keyPasses ?? snapshot?.keyPasses ?? 0,
      tackles: recentStats?.tackles ?? snapshot?.tackles ?? 0,
      averageRating: recentStats?.averageRating ?? snapshot?.averageRating ?? null,
      fantasyScore: recentStats?.fantasyScore ?? snapshot?.fantasyScore ?? null,
      scoringScore: recentStats?.scoringScore ?? snapshot?.scoringScore ?? null,
      alternativeScore: recentStats?.alternativeScore ?? snapshot?.alternativeScore ?? null
    };
  });

  const fantasyPreview = players
    .map((player) => player.fantasyScore)
    .filter((score): score is number => typeof score === "number");
  const averageFantasyScore = fantasyPreview.length
    ? fantasyPreview.reduce((total, score) => total + score, 0) / fantasyPreview.length
    : null;

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <PageBreadcrumbs
        backHref={`/machete/leagues/${team.leagueId}`}
        backLabel={<I18nText en="Back to league" ru="Назад к лиге" />}
        items={[
          { label: "Machete", href: "/machete/leagues" },
          { label: <I18nText en="Leagues" ru="Лиги" />, href: "/machete/leagues" },
          { label: leagueDisplayName, href: `/machete/leagues/${team.leagueId}` },
          { label: team.name, href: `/machete/leagues/${team.leagueId}/teams/${team.id}` }
        ]}
      />

      <section className="mt-6 rounded border border-slate-200 bg-white p-5 shadow-soft">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">
              {leagueDisplayName} / FOTMOB
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <h1 className="text-3xl font-bold text-ink">{team.name}</h1>
              <MacheteStatusBadge status={team.status} />
            </div>
            <p className="mt-2 text-sm text-slate-600">
              <I18nText en="Provider ID" ru="ID провайдера" /> {team.providerTeamId ?? <I18nText en="not linked" ru="не связан" />} /{" "}
              <I18nText en="Last sync" ru="последняя синхронизация" /> {formatDate(team.lastSyncedAt)}
            </p>
          </div>
          <MacheteSyncButton endpoint={`/api/machete/teams/${team.id}/sync`}>
            <I18nText en="Sync team" ru="Синхронизировать команду" />
          </MacheteSyncButton>
        </div>

        <dl className="mt-6 grid grid-cols-1 gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded border border-slate-200 bg-field p-4">
            <dt className="flex items-center gap-2 text-xs font-medium uppercase text-slate-400">
              <Shield className="h-4 w-4" />
              <I18nText en="Matched internal team" ru="Связанная внутренняя команда" />
            </dt>
            <dd className="mt-2 font-semibold text-ink">
              {entityMap?.status === "MATCHED" ? entityMap.internalEntityId : <I18nText en="Unmatched" ru="Не сопоставлено" />}
            </dd>
          </div>
          <div className="rounded border border-slate-200 bg-field p-4">
            <dt className="text-xs font-medium uppercase text-slate-400"><I18nText en="Players synced" ru="Игроков синхронизировано" /></dt>
            <dd className="mt-2 font-semibold text-ink">{formatNumber(team.players.length)}</dd>
          </div>
          <div className="rounded border border-slate-200 bg-field p-4">
            <dt className="flex items-center gap-2 text-xs font-medium uppercase text-slate-400">
              <GitCompareArrows className="h-4 w-4" />
              <I18nText en="Unmatched players" ru="Игроки без связи" />
            </dt>
            <dd className="mt-2 font-semibold text-ink">{formatNumber(team.players.length)}</dd>
          </div>
          <div className="rounded border border-slate-200 bg-field p-4">
            <dt className="text-xs font-medium uppercase text-slate-400"><I18nText en="Avg fantasy score" ru="Средний fantasy score" /></dt>
            <dd className="mt-2 font-semibold text-ink">{formatScore(averageFantasyScore)}</dd>
          </div>
        </dl>
      </section>

      <section className="mt-6">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-ink"><I18nText en="Players" ru="Игроки" /></h2>
          <span className="text-sm text-slate-500"><I18nText en="Fantasy score preview" ru="Предпросмотр fantasy-очков" /></span>
        </div>
        <AutoSubmitForm className="mb-3 flex w-full max-w-xs items-end gap-2">
          <label className="flex-1 text-sm">
            <span className="mb-1 block font-medium text-slate-600">Last team matches</span>
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
          <p className="mb-3 text-sm text-slate-500">Stats and FP are recalculated from the last {recentMatches} played team matches.</p>
        ) : null}
        <MachetePlayerTable players={players} />
      </section>

      <section className="mt-6">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-ink"><I18nText en="Recent fixtures" ru="Последние матчи" /></h2>
          <span className="text-sm text-slate-500">
            {formatNumber(fixtures.length)} <I18nText en="shown" ru="показано" />
          </span>
        </div>
        <MacheteFixtureTable
          fixtures={fixtures.map((fixture) => ({
            id: fixture.id,
            kickoffAt: fixture.kickoffAt,
            status: fixture.status,
            homeTeamName: fixture.homeTeam?.name ?? null,
            awayTeamName: fixture.awayTeam?.name ?? null,
            homeScore: fixture.homeScore,
            awayScore: fixture.awayScore
          }))}
        />
      </section>

      <section className="mt-6 rounded border border-slate-200 bg-white p-5 shadow-soft">
        <div className="flex items-center gap-2">
          <Database className="h-5 w-5 text-slate-500" />
          <h2 className="text-lg font-semibold text-ink"><I18nText en="Raw payload references" ru="Сырые payload-ссылки" /></h2>
        </div>
        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
          {rawPayloads.map((payload) => (
            <div key={payload.id} className="rounded border border-slate-200 bg-field p-3 text-sm">
              <p className="font-semibold text-ink">{payload.entityType}</p>
              <p className="mt-1 truncate text-slate-600">{payload.providerEntityId ?? "collection"}</p>
              <p className="mt-1 text-xs text-slate-500">{formatDate(payload.createdAt)}</p>
            </div>
          ))}
          {rawPayloads.length === 0 ? (
            <p className="text-sm text-slate-500">
              <I18nText en="No raw payloads stored for this team yet." ru="Для этой команды пока нет сохраненных raw payload." />
            </p>
          ) : null}
        </div>
      </section>
    </main>
  );
}

function isMatchFixture(fixture: { status: string | null }) {
  return fixture.status !== "SEASON_AGGREGATE";
}
