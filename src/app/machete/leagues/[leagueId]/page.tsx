import { notFound } from "next/navigation";
import type { ReactNode } from "react";

import { I18nText } from "@/components/i18n-text";
import { MacheteShell } from "@/components/machete/MacheteShell";
import { MacheteStatusBadge } from "@/components/machete/MacheteStatusBadge";
import { MacheteTeamCard } from "@/components/machete/MacheteTeamCard";
import { PageBreadcrumbs } from "@/components/page-breadcrumbs";
import { prisma } from "@/lib/db";
import { formatDate, formatNumber, formatScore } from "@/lib/format";
import { macheteCatalogByFotMobId } from "@/lib/leagues/machete-catalog";
import { leagueSubtitle, macheteLeagueDisplayName } from "@/lib/leagues/display";
import { leagueFlag } from "@/lib/leagues/flags";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{
    leagueId: string;
  }>;
};

export default async function MacheteLeaguePage({ params }: PageProps) {
  const { leagueId } = await params;
  const league = await prisma.macheteLeague.findUnique({
    where: { id: leagueId },
    include: {
      teams: {
        orderBy: { name: "asc" },
        include: {
          players: {
            include: {
              snapshots: {
                where: { leagueId },
                orderBy: { createdAt: "desc" },
                take: 1
              }
            }
          },
          fixturesHome: true,
          fixturesAway: true
        }
      },
      fixtures: true
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
  const seedLeague = macheteCatalogByFotMobId(league.providerLeagueId);
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
          backLabel={<I18nText en="Back to leagues" ru="Назад к лигам" />}
          items={[
            { label: "Machete", href: "/machete/leagues" },
            { label: <I18nText en="Leagues" ru="Лиги" />, href: "/machete/leagues" },
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
            <Metric label={<I18nText en="Teams" ru="Команды" />} value={formatNumber(league.teams.length)} />
            <Metric label={<I18nText en="Players" ru="Игроки" />} value={formatNumber(playersCount)} />
            <Metric label={<I18nText en="Fixtures" ru="Матчи" />} value={formatNumber(fixtures.length)} />
            <Metric label={<I18nText en="Last sync" ru="Последняя синхронизация" />} value={formatDate(league.lastSyncedAt)} />
            <Metric label="Expected FP" value={formatScore(expectedFantasyPoints)} accent />
          </dl>
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
          <I18nText
            en="No teams synced yet. Ask an administrator to run the shared FotMob ingestion."
            ru="Команды еще не синхронизированы. Попросите администратора запустить общую загрузку FotMob."
          />
        </div>
      ) : null}
    </MacheteShell>
  );
}

function Metric({ label, value, accent = false }: { label: ReactNode; value: string; accent?: boolean }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase text-slate-400">{label}</dt>
      <dd className={`mt-1 font-semibold ${accent ? "text-emerald-700" : "text-ink"}`}>{value}</dd>
    </div>
  );
}

function isMatchFixture(fixture: { status: string | null }) {
  return fixture.status !== "SEASON_AGGREGATE";
}
