import { ArrowRight, CalendarDays } from "lucide-react";
import Link from "next/link";

import { formatDate } from "@/lib/format";
import { prisma } from "@/lib/db";
import { leagueSubtitle } from "@/lib/leagues/display";
import { leagueFlag } from "@/lib/leagues/flags";

export const dynamic = "force-dynamic";

export default async function BaltikaLeaguesPage() {
  const leagues = await prisma.league.findMany({
    orderBy: { name: "asc" },
    include: {
      seasons: {
        orderBy: { createdAt: "desc" },
        take: 1
      },
      teams: {
        include: {
          imports: {
            where: { isCurrentPublished: true },
            take: 1
          }
        }
      }
    }
  });

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">Baltika</p>
          <h1 className="mt-2 text-3xl font-bold text-ink">Leagues</h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-600">
            Maintain fantasy datasets one league at a time by uploading Wyscout team spreadsheets.
          </p>
        </div>
      </div>

      <div className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {leagues.map((league) => {
          const publishedCount = league.teams.filter((team) => team.imports.length > 0).length;
          const lastUpdate = league.teams
            .flatMap((team) => team.imports)
            .map((teamImport) => teamImport.publishedAt)
            .filter((date): date is Date => Boolean(date))
            .sort((a, b) => b.getTime() - a.getTime())[0];

          return (
            <Link
              key={league.id}
              href={`/baltika/leagues/${league.id}`}
              className="rounded border border-slate-200 bg-white p-5 shadow-soft transition hover:-translate-y-0.5 hover:border-slate-300"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="grid h-11 w-11 place-items-center rounded bg-ink text-white">
                    <span aria-hidden="true" className="text-2xl leading-none">
                      {leagueFlag(league)}
                    </span>
                  </div>
                  <div>
                    <h2 className="font-semibold text-ink">{league.name}</h2>
                    <p className="text-sm text-slate-500">
                      {leagueSubtitle(league, league.seasons[0]?.name)}
                    </p>
                  </div>
                </div>
                <ArrowRight className="h-5 w-5 text-slate-400" />
              </div>

              <div className="mt-6">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-500">Published teams</span>
                  <span className="font-semibold text-ink">
                    {publishedCount}/{league.teams.length}
                  </span>
                </div>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-full rounded-full bg-emerald-500"
                    style={{ width: `${league.teams.length ? (publishedCount / league.teams.length) * 100 : 0}%` }}
                  />
                </div>
              </div>

              <p className="mt-5 flex items-center gap-2 text-sm text-slate-500">
                <CalendarDays className="h-4 w-4" />
                Last update {formatDate(lastUpdate)}
              </p>
            </Link>
          );
        })}
      </div>
    </main>
  );
}
