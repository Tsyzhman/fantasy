import { BarChart3, GitCompareArrows, ListRestart, TableProperties, Users } from "lucide-react";
import { notFound } from "next/navigation";

import { MacheteShell } from "@/components/machete/MacheteShell";
import { MacheteStatusBadge } from "@/components/machete/MacheteStatusBadge";
import { MacheteSyncButton } from "@/components/machete/MacheteSyncButton";
import { MacheteTeamCard } from "@/components/machete/MacheteTeamCard";
import { PageBreadcrumbs } from "@/components/page-breadcrumbs";
import { prisma } from "@/lib/db";
import { formatDate, formatNumber, formatScore } from "@/lib/format";
import { leagueSeeds } from "@/lib/leagues/seed-data";
import { leagueSubtitle, macheteLeagueDisplayName } from "@/lib/leagues/display";
import { leagueFlag } from "@/lib/leagues/flags";

export const dynamic = "force-dynamic";

type PageProps = {
  params: {
    leagueId: string;
  };
};

export default async function MacheteLeaguePage({ params }: PageProps) {
  const league = await prisma.macheteLeague.findUnique({
    where: { id: params.leagueId },
    include: {
      teams: {
        orderBy: { name: "asc" },
        include: {
          players: {
            include: {
              snapshots: {
                where: { leagueId: params.leagueId },
                orderBy: { createdAt: "desc" },
                take: 1
              }
            }
          },
          fixturesHome: true,
          fixturesAway: true
        }
      },
      fixtures: true,
      syncJobs: {
        orderBy: { createdAt: "desc" },
        take: 3
      }
    }
  });

  if (!league) notFound();

  const fixtures = league.fixtures.filter(isMatchFixture);
  const playersCount = league.teams.reduce((total, team) => total + team.players.length, 0);
  const leagueFantasyScores = league.teams.flatMap((team) =>
    team.players
      .map((player) => player.snapshots[0]?.fantasyScore)
      .filter((score): score is number => typeof score === "number")
  );
  const expectedFantasyPoints = leagueFantasyScores.length
    ? leagueFantasyScores.reduce((total, score) => total + score, 0) / leagueFantasyScores.length
    : null;
  const seedLeague = leagueSeeds.find((item) => item.fotMobLeagueId === league.providerLeagueId);
  const flagInput = {
    id: seedLeague?.id ?? league.id,
    name: league.name,
    code: seedLeague?.code,
    country: seedLeague?.country ?? league.country
  };
  const displayName = macheteLeagueDisplayName({ ...flagInput, providerLeagueId: league.providerLeagueId });

  return (
    <MacheteShell>
      <div className="mt-6">
        <PageBreadcrumbs
          backHref="/machete/leagues"
          backLabel="Back to leagues"
          items={[
            { label: "Machete", href: "/machete" },
            { label: "Leagues", href: "/machete/leagues" },
            { label: displayName, href: `/machete/leagues/${league.id}` }
          ]}
        />
      </div>
      <section className="mt-8 rounded border border-slate-200 bg-white p-5 shadow-soft">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <div className="grid h-11 w-11 place-items-center rounded bg-ink text-white">
                <span aria-hidden="true" className="text-2xl leading-none">
                  {leagueFlag(flagInput)}
                </span>
              </div>
              <h2 className="text-2xl font-bold text-ink">{displayName}</h2>
              <MacheteStatusBadge status={league.status} />
            </div>
            <p className="mt-2 text-sm text-slate-600">
              {[leagueSubtitle(flagInput, league.season), "Provider FOTMOB"].filter(Boolean).join(" / ")}
            </p>
          </div>
          <dl className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-5">
            <div>
              <dt className="text-xs font-medium uppercase text-slate-400">Teams</dt>
              <dd className="mt-1 font-semibold text-ink">{formatNumber(league.teams.length)}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase text-slate-400">Players</dt>
              <dd className="mt-1 font-semibold text-ink">{formatNumber(playersCount)}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase text-slate-400">Fixtures</dt>
              <dd className="mt-1 font-semibold text-ink">{formatNumber(fixtures.length)}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase text-slate-400">Last sync</dt>
              <dd className="mt-1 font-semibold text-ink">{formatDate(league.lastSyncedAt)}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase text-slate-400">Expected FP</dt>
              <dd className="mt-1 font-semibold text-emerald-700">{formatScore(expectedFantasyPoints)}</dd>
            </div>
          </dl>
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          <MacheteSyncButton endpoint={`/api/machete/leagues/${league.id}/sync-full`}>
            Full league refresh
          </MacheteSyncButton>
          <MacheteSyncButton endpoint={`/api/machete/leagues/${league.id}/sync-metadata`} variant="secondary">
            <TableProperties className="hidden h-4 w-4" />
            Sync league metadata
          </MacheteSyncButton>
          <MacheteSyncButton endpoint={`/api/machete/leagues/${league.id}/sync-teams`} variant="secondary">
            <Users className="hidden h-4 w-4" />
            Sync teams
          </MacheteSyncButton>
          <MacheteSyncButton endpoint={`/api/machete/leagues/${league.id}/sync-fixtures`} variant="secondary">
            <ListRestart className="hidden h-4 w-4" />
            Sync fixtures
          </MacheteSyncButton>
          <MacheteSyncButton endpoint={`/api/machete/leagues/${league.id}/sync-player-stats`} variant="secondary">
            Sync player stats
          </MacheteSyncButton>
          <MacheteSyncButton endpoint={`/api/machete/leagues/${league.id}/run-entity-matching`} variant="secondary">
            <GitCompareArrows className="hidden h-4 w-4" />
            Run entity matching
          </MacheteSyncButton>
          <MacheteSyncButton endpoint={`/api/machete/leagues/${league.id}/calculate-scores`} variant="secondary">
            <BarChart3 className="hidden h-4 w-4" />
            Calculate fantasy scores
          </MacheteSyncButton>
        </div>
      </section>

      <section className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {league.teams.map((team) => {
          const teamFixtures = [...team.fixturesHome, ...team.fixturesAway].filter(isMatchFixture);
          const teamScores = team.players
            .map((player) => player.snapshots[0]?.fantasyScore)
            .filter((score): score is number => typeof score === "number");
          const teamExpectedFantasyPoints = teamScores.length
            ? teamScores.reduce((total, score) => total + score, 0) / teamScores.length
            : null;

          return (
            <MacheteTeamCard
              key={team.id}
              team={{
                id: team.id,
                leagueId: league.id,
                name: team.name,
                country: team.country,
                leagueName: displayName,
                providerTeamId: team.providerTeamId,
                logoUrl: team.logoUrl,
                status: team.status,
                playersSynced: team.players.length,
                fixturesSynced: teamFixtures.length,
                expectedFantasyPoints: teamExpectedFantasyPoints,
                lastSyncedAt: team.lastSyncedAt
              }}
            />
          );
        })}
      </section>
      {league.teams.length === 0 ? (
        <div className="mt-6 rounded border border-dashed border-slate-300 bg-white p-10 text-center text-slate-500">
          No teams synced yet. Start with Sync teams.
        </div>
      ) : null}
    </MacheteShell>
  );
}

function isMatchFixture(fixture: { status: string | null }) {
  return fixture.status !== "SEASON_AGGREGATE";
}
