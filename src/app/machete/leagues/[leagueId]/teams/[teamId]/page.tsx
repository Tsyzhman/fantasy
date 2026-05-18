import { Database, GitCompareArrows, Shield } from "lucide-react";
import { notFound } from "next/navigation";

import { MacheteFixtureTable } from "@/components/machete/MacheteFixtureTable";
import { MachetePlayerTable } from "@/components/machete/MachetePlayerTable";
import { MacheteStatusBadge } from "@/components/machete/MacheteStatusBadge";
import { MacheteSyncButton } from "@/components/machete/MacheteSyncButton";
import { PageBreadcrumbs } from "@/components/page-breadcrumbs";
import { prisma } from "@/lib/db";
import { formatDate, formatNumber, formatScore } from "@/lib/format";

export const dynamic = "force-dynamic";

type PageProps = {
  params: {
    leagueId: string;
    teamId: string;
  };
};

export default async function MacheteTeamPage({ params }: PageProps) {
  const team = await prisma.macheteTeam.findUnique({
    where: { id: params.teamId },
    include: {
      league: true,
      players: {
        orderBy: { name: "asc" },
        include: {
          snapshots: {
            where: { leagueId: params.leagueId },
            orderBy: { createdAt: "desc" },
            take: 1
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

  if (!team || team.leagueId !== params.leagueId) notFound();

  const providerIds = [
    team.providerTeamId,
    ...team.players.map((player) => player.providerPlayerId),
    ...team.fixturesHome.map((fixture) => fixture.providerFixtureId),
    ...team.fixturesAway.map((fixture) => fixture.providerFixtureId)
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

  const fixtures = [...team.fixturesHome, ...team.fixturesAway]
    .sort((a, b) => (b.kickoffAt?.getTime() ?? 0) - (a.kickoffAt?.getTime() ?? 0))
    .slice(0, 8);

  const players = team.players.map((player) => {
    const snapshot = player.snapshots[0];
    return {
      id: player.id,
      name: player.name,
      position: player.position,
      age: player.age,
      nationality: player.nationality,
      matchesPlayed: snapshot?.matchesPlayed ?? 0,
      minutesPlayed: snapshot?.minutesPlayed ?? 0,
      goals: snapshot?.goals ?? 0,
      assists: snapshot?.assists ?? 0,
      shotsOnTarget: snapshot?.shotsOnTarget ?? 0,
      keyPasses: snapshot?.keyPasses ?? 0,
      tackles: snapshot?.tackles ?? 0,
      averageRating: snapshot?.averageRating ?? null,
      fantasyScore: snapshot?.fantasyScore ?? null,
      alternativeScore: snapshot?.alternativeScore ?? null
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
        backLabel="Back to league"
        items={[
          { label: "Machete", href: "/machete" },
          { label: "Leagues", href: "/machete/leagues" },
          { label: team.league.name, href: `/machete/leagues/${team.leagueId}` },
          { label: team.name, href: `/machete/leagues/${team.leagueId}/teams/${team.id}` }
        ]}
      />

      <section className="mt-6 rounded border border-slate-200 bg-white p-5 shadow-soft">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">
              {team.league.name} / FOTMOB
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <h1 className="text-3xl font-bold text-ink">{team.name}</h1>
              <MacheteStatusBadge status={team.status} />
            </div>
            <p className="mt-2 text-sm text-slate-600">
              Provider ID {team.providerTeamId ?? "not linked"} / Last sync {formatDate(team.lastSyncedAt)}
            </p>
          </div>
          <MacheteSyncButton endpoint={`/api/machete/teams/${team.id}/sync`}>Sync team</MacheteSyncButton>
        </div>

        <dl className="mt-6 grid grid-cols-1 gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded border border-slate-200 bg-field p-4">
            <dt className="flex items-center gap-2 text-xs font-medium uppercase text-slate-400">
              <Shield className="h-4 w-4" />
              Matched internal team
            </dt>
            <dd className="mt-2 font-semibold text-ink">
              {entityMap?.status === "MATCHED" ? entityMap.internalEntityId : "Unmatched"}
            </dd>
          </div>
          <div className="rounded border border-slate-200 bg-field p-4">
            <dt className="text-xs font-medium uppercase text-slate-400">Players synced</dt>
            <dd className="mt-2 font-semibold text-ink">{formatNumber(team.players.length)}</dd>
          </div>
          <div className="rounded border border-slate-200 bg-field p-4">
            <dt className="flex items-center gap-2 text-xs font-medium uppercase text-slate-400">
              <GitCompareArrows className="h-4 w-4" />
              Unmatched players
            </dt>
            <dd className="mt-2 font-semibold text-ink">{formatNumber(team.players.length)}</dd>
          </div>
          <div className="rounded border border-slate-200 bg-field p-4">
            <dt className="text-xs font-medium uppercase text-slate-400">Avg fantasy score</dt>
            <dd className="mt-2 font-semibold text-ink">{formatScore(averageFantasyScore)}</dd>
          </div>
        </dl>
      </section>

      <section className="mt-6">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-ink">Players</h2>
          <span className="text-sm text-slate-500">Fantasy score preview</span>
        </div>
        <MachetePlayerTable players={players} />
      </section>

      <section className="mt-6">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-ink">Recent fixtures</h2>
          <span className="text-sm text-slate-500">{formatNumber(fixtures.length)} shown</span>
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
          <h2 className="text-lg font-semibold text-ink">Raw payload references</h2>
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
            <p className="text-sm text-slate-500">No raw payloads stored for this team yet.</p>
          ) : null}
        </div>
      </section>
    </main>
  );
}
