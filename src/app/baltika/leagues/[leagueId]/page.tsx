import { BarChart3 } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { BulkImportButton } from "@/components/baltika/bulk-import-button";
import { I18nText } from "@/components/i18n-text";
import { PageBreadcrumbs } from "@/components/page-breadcrumbs";
import { TeamCardGrid, type TeamCardDto } from "@/components/admin/team-card-grid";
import { prisma } from "@/lib/db";
import { leagueSubtitle } from "@/lib/leagues/display";
import { leagueFlag } from "@/lib/leagues/flags";
import { teamLogoUrlForSlug } from "@/lib/teams/logo-assets";
import { nationalTeamFlag } from "@/lib/teams/national-flags";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{
    leagueId: string;
  }>;
};

export default async function BaltikaLeaguePage({ params }: PageProps) {
  const { leagueId } = await params;
  const league = await prisma.league.findUnique({
    where: { id: leagueId },
    include: {
      seasons: {
        orderBy: { createdAt: "desc" },
        take: 1
      },
      teams: {
        orderBy: { name: "asc" },
        include: {
          baltikaFixturesHome: {
            where: { source: "WYSCOUT_TEAM_STATS" },
            select: {
              id: true,
              homeTeamId: true,
              awayTeamId: true,
              homeTeamName: true,
              awayTeamName: true,
              kickoffAt: true,
              homeScore: true,
              awayScore: true
            }
          },
          baltikaFixturesAway: {
            where: { source: "WYSCOUT_TEAM_STATS" },
            select: {
              id: true,
              homeTeamId: true,
              awayTeamId: true,
              homeTeamName: true,
              awayTeamName: true,
              kickoffAt: true,
              homeScore: true,
              awayScore: true
            }
          },
          baltikaTeamStatsImports: {
            where: { status: "PUBLISHED" },
            orderBy: { updatedAt: "desc" },
            take: 1
          },
          imports: {
            orderBy: { createdAt: "desc" },
            take: 4,
            include: {
              _count: {
                select: { snapshots: true }
              }
            }
          }
        }
      }
    }
  });

  if (!league) notFound();

  const season = league.seasons[0];
  const teams: TeamCardDto[] = league.teams.map((team) => {
    const latestImport = team.imports[0];
    const publishedImport = team.imports.find((teamImport) => teamImport.isCurrentPublished);

    return {
      id: team.id,
      name: team.name,
      slug: team.slug,
      logoUrl: teamLogoUrlForSlug(league.id, team.slug, team.logoUrl),
      flag: nationalTeamFlag(team.name),
      status: latestImport?.status ?? "EMPTY",
      playersCount: latestImport?._count.snapshots ?? 0,
      lastUploadAt: latestImport?.createdAt.toISOString() ?? null,
      playersPublishedAt: publishedImport?.publishedAt?.toISOString() ?? null,
      latestImportId: latestImport?.id ?? null,
      fixturesCount: uniqueTeamFixturesCount([...team.baltikaFixturesHome, ...team.baltikaFixturesAway]),
      teamStatsPublishedAt: team.baltikaTeamStatsImports[0]?.updatedAt.toISOString() ?? null,
      errors: Array.isArray(latestImport?.errorsJson) ? latestImport.errorsJson : [],
      warnings: Array.isArray(latestImport?.warningsJson) ? latestImport.warningsJson : []
    };
  });

  const publishedCount = teams.filter((team) => team.status === "PUBLISHED").length;
  const progress = teams.length ? (publishedCount / teams.length) * 100 : 0;

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <PageBreadcrumbs
        backHref="/baltika/leagues"
        backLabel={<I18nText en="Back to leagues" ru="Назад к лигам" />}
        items={[
          { label: <I18nText en="Baltika" ru="Балтика" />, href: "/baltika/leagues" },
          { label: league.name, href: `/baltika/leagues/${league.id}` }
        ]}
      />
      <div className="mt-5 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-slate-500"><I18nText en="League workspace" ru="Рабочее место лиги" /></p>
          <h1 className="mt-2 flex items-center gap-3 text-3xl font-bold text-ink">
            <span aria-hidden="true" className="text-4xl leading-none">
              {leagueFlag(league)}
            </span>
            {league.name}
          </h1>
          <p className="mt-2 text-sm text-slate-600">
            {leagueSubtitle(league, season?.name ?? "No season")}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <BulkImportButton leagueId={league.id} seasonId={season?.id ?? ""} />
          <Link
            href="/baltika/players"
            className="inline-flex items-center gap-2 rounded bg-ink px-3 py-2 text-sm font-semibold text-white hover:bg-slate-700"
          >
            <BarChart3 className="h-4 w-4" />
            <I18nText en="View players" ru="Смотреть игроков" />
          </Link>
          <Link
            href={`/baltika/leagues/${league.id}/schedule`}
            className="inline-flex items-center gap-2 rounded border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            <I18nText en="Calendar" ru="Календарь" />
          </Link>
        </div>
      </div>

      <section className="mt-8 rounded border border-slate-200 bg-white p-5 shadow-soft">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-ink">
              {publishedCount}/{teams.length} <I18nText en="teams published" ru="команд опубликовано" />
            </p>
            <p className="text-sm text-slate-500"><I18nText en="Drop one Wyscout .xlsx file onto each team card." ru="Можно загружать файлы по одной команде или импортировать сразу много .xlsx через массовый импорт." /></p>
          </div>
          <span className="text-sm font-medium text-slate-500"><I18nText en="Target period" ru="Период" />: 2025/26</span>
        </div>
        <div className="mt-4 h-3 overflow-hidden rounded-full bg-slate-100">
          <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${progress}%` }} />
        </div>
      </section>

      <section className="mt-6">
        <TeamCardGrid teams={teams} seasonId={season?.id ?? ""} leagueId={league.id} />
      </section>
    </main>
  );
}

type TeamFixtureForCount = {
  id: string;
  homeTeamId: string | null;
  awayTeamId: string | null;
  homeTeamName: string;
  awayTeamName: string | null;
  kickoffAt: Date | null;
  homeScore: number | null;
  awayScore: number | null;
};

function uniqueTeamFixturesCount(fixtures: TeamFixtureForCount[]) {
  const keys = new Set(fixtures.map(teamFixtureKey));
  return keys.size;
}

function teamFixtureKey(fixture: TeamFixtureForCount) {
  const teams = [
    fixture.homeTeamId ?? fixture.homeTeamName,
    fixture.awayTeamId ?? fixture.awayTeamName ?? "TBD"
  ].sort();

  const date = fixture.kickoffAt ? fixture.kickoffAt.toISOString().slice(0, 10) : "no-date";
  const score = [fixture.homeScore ?? "x", fixture.awayScore ?? "x"].sort().join("-");

  return `${date}|${teams.join("|")}|${score}`;
}
