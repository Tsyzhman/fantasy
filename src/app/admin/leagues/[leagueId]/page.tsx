import { BarChart3, Database } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { TeamCardGrid, type TeamCardDto } from "@/components/admin/team-card-grid";
import { prisma } from "@/lib/db";
import { leagueSubtitle } from "@/lib/leagues/display";
import { leagueFlag } from "@/lib/leagues/flags";
import { teamLogoUrlForSlug } from "@/lib/teams/logo-assets";
import { nationalTeamFlag } from "@/lib/teams/national-flags";

export const dynamic = "force-dynamic";

type PageProps = {
  params: {
    leagueId: string;
  };
};

export default async function AdminLeaguePage({ params }: PageProps) {
  const league = await prisma.league.findUnique({
    where: { id: params.leagueId },
    include: {
      seasons: {
        orderBy: { createdAt: "desc" },
        take: 1
      },
      teams: {
        orderBy: { name: "asc" },
        include: {
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
      publishedAt: publishedImport?.publishedAt?.toISOString() ?? null,
      latestImportId: latestImport?.id ?? null,
      errors: Array.isArray(latestImport?.errorsJson) ? latestImport.errorsJson : [],
      warnings: Array.isArray(latestImport?.warningsJson) ? latestImport.warningsJson : []
    };
  });

  const publishedCount = teams.filter((team) => team.status === "PUBLISHED").length;
  const progress = teams.length ? (publishedCount / teams.length) * 100 : 0;

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">League workspace</p>
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
          <button
            type="button"
            disabled
            className="inline-flex items-center gap-2 rounded border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-400"
          >
            <Database className="h-4 w-4" />
            Bulk upload
          </button>
          <Link
            href="/players"
            className="inline-flex items-center gap-2 rounded bg-ink px-3 py-2 text-sm font-semibold text-white hover:bg-slate-700"
          >
            <BarChart3 className="h-4 w-4" />
            View players
          </Link>
        </div>
      </div>

      <section className="mt-8 rounded border border-slate-200 bg-white p-5 shadow-soft">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-ink">
              {publishedCount}/{teams.length} teams published
            </p>
            <p className="text-sm text-slate-500">Drop one Wyscout .xlsx file onto each team card.</p>
          </div>
          <span className="text-sm font-medium text-slate-500">Target period: 2025/26</span>
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
