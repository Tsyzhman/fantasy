import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { Download } from "lucide-react";

import { I18nText } from "@/components/i18n-text";
import { MacheteRosterCoverageSummary } from "@/components/machete/MacheteRosterCoverageSummary";
import { MacheteShell } from "@/components/machete/MacheteShell";
import { MacheteStatusBadge } from "@/components/machete/MacheteStatusBadge";
import { MacheteTeamCard } from "@/components/machete/MacheteTeamCard";
import { PageBreadcrumbs } from "@/components/page-breadcrumbs";
import { AutoSubmitForm } from "@/components/players/auto-submit-form";
import { LocalizedOption } from "@/components/localized-option";
import { prisma } from "@/lib/db";
import { formatDate, formatNumber, formatScore } from "@/lib/format";
import { leagueSubtitle } from "@/lib/leagues/display";
import { LeagueFlag } from "@/components/ui/league-flag";
import { loadRosterCoverage, summarizeRosterCoverage } from "@/machete/roster-coverage";
import { loadSharedLeagueSeason, loadSharedLeagueSeasonOptions, loadSharedLeagueTeams } from "@/machete/shared_read_model";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{
    leagueId: string;
  }>;
  searchParams?: Promise<{
    season?: string;
  }>;
};

export default async function MacheteLeaguePage({ params, searchParams }: PageProps) {
  const { leagueId } = await params;
  const resolvedSearchParams = (await searchParams) ?? {};
  const [league, leagueSeasonOptions] = await Promise.all([
    loadSharedLeagueSeason(prisma, leagueId, resolvedSearchParams.season),
    loadSharedLeagueSeasonOptions(prisma)
  ]);
  if (!league) notFound();
  const seasonsForLeague = leagueSeasonOptions.filter((option) => option.leagueId === league.leagueId);

  const [teams, fixturesCount, fantasyAggregate, coverageRows] = await Promise.all([
    loadSharedLeagueTeams(prisma, league.leagueId, league.season),
    prisma.coreMatch.count({
      where: {
        leagueId: league.leagueId,
        season: league.season
      }
    }),
    prisma.fantasyPoint.aggregate({
      where: {
        match: {
          leagueId: league.leagueId,
          season: league.season
        }
      },
      _avg: {
        points: true
      }
    }),
    loadRosterCoverage(prisma, league.leagueId, league.season)
  ]);
  const rosterCoverageByTeam = new Map(coverageRows.map((row) => [String(row.teamId), row]));
  const rosterCoverage = summarizeRosterCoverage(coverageRows);
  const teamCards = await Promise.all(
    teams.map(async (team) => {
      const coverage = rosterCoverageByTeam.get(String(team.id)) ?? {
        playersCount: 0,
        startersCount: 0,
        forecastPlayers: 0,
        startingXiChangedAt: null
      };
      const [playersSynced, teamFixtures, teamFantasy] = await Promise.all([
        prisma.teamPlayerSeason.count({
          where: {
            leagueId: league.leagueId,
            season: league.season,
            teamId: team.id,
            active: true
          }
        }),
        prisma.coreMatch.count({
          where: {
            leagueId: league.leagueId,
            season: league.season,
            OR: [{ homeTeamId: team.id }, { awayTeamId: team.id }]
          }
        }),
        prisma.fantasyPoint.aggregate({
          where: {
            teamId: team.id,
            match: {
              leagueId: league.leagueId,
              season: league.season
            }
          },
          _avg: {
            points: true
          }
        })
      ]);

      return {
        id: String(team.id),
        leagueId: String(league.leagueId),
        season: league.season,
        name: team.name,
        country: team.country,
        leagueName: league.displayName,
        providerTeamId: team.rawRef ?? String(team.id),
        logoUrl: team.logoUrl,
        status: playersSynced > 0 || teamFixtures > 0 ? "SYNCED" : "NOT_CONFIGURED",
        playersSynced,
        fixturesSynced: teamFixtures,
        expectedFantasyPoints: teamFantasy._avg.points ?? null,
        lastSyncedAt: league.updatedAt,
        startingXiChangedAt: coverage.startingXiChangedAt,
        startersCount: coverage.startersCount,
        forecastPlayers: coverage.forecastPlayers
      };
    })
  );

  const flagInput = {
    id: league.providerLeagueId,
    name: league.name,
    country: league.country
  };

  return (
    <MacheteShell>
      <div className="mt-6">
        <PageBreadcrumbs
          backHref="/machete/leagues"
          backLabel={<I18nText en="Back to leagues" ru="Назад к лигам" />}
          items={[
            { label: "Machete", href: "/machete/leagues" },
            { label: <I18nText en="Leagues" ru="Лиги" />, href: "/machete/leagues" },
            { label: league.displayName, href: macheteLeagueHref(league.leagueId, league.season) }
          ]}
        />
      </div>

      <section className="mt-8 rounded border border-slate-200 bg-white p-5 shadow-soft">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <LeagueFlag league={flagInput} size={44} className="rounded shadow-soft" />

              <h2 className="text-2xl font-bold text-ink">{league.displayName}</h2>
              <MacheteStatusBadge status={teams.length > 0 ? "SYNCED" : "NOT_CONFIGURED"} />
            </div>
            <p className="mt-2 text-sm text-slate-600">
              {[leagueSubtitle(flagInput, league.season), "Provider FOTMOB"].filter(Boolean).join(" / ")}
            </p>
            <div className="mt-5 rounded border border-slate-200 bg-field p-3">
              <MacheteRosterCoverageSummary coverage={rosterCoverage} />
            </div>
          </div>
          <div className="flex w-full flex-col gap-2 sm:w-56">
            <AutoSubmitForm>
              <label className="text-sm">
                <span className="mb-1 block font-medium text-slate-600"><I18nText en="Season" ru="Сезон" /></span>
                <select name="season" defaultValue={league.season} className="w-full rounded border border-slate-200 px-3 py-2">
                  {seasonsForLeague.map((option) => (
                    <option key={`${option.leagueId}:${option.season}`} value={option.season}>
                      {option.season}{option.isCurrent ? " · current" : ""}
                    </option>
                  ))}
                  {seasonsForLeague.length === 0 ? <LocalizedOption value={league.season} en={league.season} ru={league.season} /> : null}
                </select>
              </label>
            </AutoSubmitForm>
            <a
              href={startingXiExportHref(league.leagueId, league.season)}
              className="inline-flex items-center justify-center gap-2 rounded border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              <Download className="h-4 w-4" aria-hidden="true" />
              <I18nText en="Export starting XI" ru="Выгрузить игроков старта" />
            </a>
          </div>
          <dl className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-5">
            <Metric label={<I18nText en="Teams" ru="Команды" />} value={formatNumber(teams.length)} />
            <Metric
              label={<I18nText en="Players" ru="Игроки" />}
              value={formatNumber(teamCards.reduce((total, team) => total + team.playersSynced, 0))}
            />
            <Metric label={<I18nText en="Fixtures" ru="Матчи" />} value={formatNumber(fixturesCount)} />
            <Metric label={<I18nText en="Last sync" ru="Последняя синхронизация" />} value={formatDate(league.updatedAt)} />
            <Metric label={<I18nText en="Expected FP" ru="Прогноз FP" />} value={formatScore(fantasyAggregate._avg.points ?? null)} accent />
          </dl>
        </div>
      </section>

      <section className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {teamCards.map((team) => (
          <MacheteTeamCard key={team.id} team={team} />
        ))}
      </section>
      {teams.length === 0 ? (
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

function macheteLeagueHref(leagueId: bigint, season: string) {
  return `/machete/leagues/${leagueId}?season=${encodeURIComponent(season)}`;
}

function startingXiExportHref(leagueId: bigint, season: string) {
  return `/api/machete/leagues/${leagueId}/export-starting-xi?season=${encodeURIComponent(season)}`;
}
