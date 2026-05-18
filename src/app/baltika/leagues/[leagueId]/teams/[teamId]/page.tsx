import Link from "next/link";
import { notFound } from "next/navigation";

import { PageBreadcrumbs } from "@/components/page-breadcrumbs";
import { StarterCheckbox } from "@/components/players/starter-checkbox";
import { prisma } from "@/lib/db";
import { formatCurrency, formatNumber, formatScore } from "@/lib/format";
import { leagueFlag } from "@/lib/leagues/flags";

export const dynamic = "force-dynamic";

type PageProps = {
  params: {
    leagueId: string;
    teamId: string;
  };
};

export default async function BaltikaTeamPage({ params }: PageProps) {
  const team = await prisma.team.findUnique({
    where: { id: params.teamId },
    include: {
      league: true,
      imports: {
        where: {
          status: "PUBLISHED",
          isCurrentPublished: true
        },
        orderBy: { publishedAt: "desc" },
        take: 1,
        include: {
          season: true,
          snapshots: {
            orderBy: [
              { isStarter: "desc" },
              { positionGroup: "asc" },
              { fantasyScore: { sort: "desc", nulls: "last" } },
              { playerName: "asc" }
            ]
          }
        }
      }
    }
  });

  if (!team || team.leagueId !== params.leagueId) notFound();

  const currentImport = team.imports[0];
  const players = currentImport?.snapshots ?? [];
  const startersCount = players.filter((player) => player.isStarter).length;

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <PageBreadcrumbs
        backHref={`/baltika/leagues/${team.leagueId}`}
        backLabel="Back to league"
        items={[
          { label: "Baltika", href: "/baltika/leagues" },
          { label: team.league.name, href: `/baltika/leagues/${team.leagueId}` },
          { label: team.name, href: `/baltika/leagues/${team.leagueId}/teams/${team.id}` }
        ]}
      />

      <div className="mt-5 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            {leagueFlag(team.league)} {team.league.name}
          </p>
          <h1 className="mt-2 text-3xl font-bold text-ink">{team.name}</h1>
          <p className="mt-2 text-sm text-slate-600">
            {currentImport
              ? `${players.length} players · ${startersCount} marked as starters · ${currentImport.season.name}`
              : "Publish a team import before marking starters."}
          </p>
        </div>
        <Link href="/baltika/players?starterOnly=1" className="rounded bg-ink px-3 py-2 text-sm font-semibold text-white hover:bg-slate-700">
          View starters
        </Link>
      </div>

      <section className="mt-8 overflow-hidden rounded border border-slate-200 bg-white shadow-soft">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3 text-center">В старте</th>
                <th className="px-4 py-3">Player</th>
                <th className="px-4 py-3">Pos</th>
                <th className="px-4 py-3 text-right">Age</th>
                <th className="px-4 py-3 text-right">Minutes</th>
                <th className="px-4 py-3 text-right">Goals</th>
                <th className="px-4 py-3 text-right">xG</th>
                <th className="px-4 py-3 text-right">Assists</th>
                <th className="px-4 py-3 text-right">Market</th>
                <th className="bg-emerald-50 px-4 py-3 text-right text-emerald-700">Predicted FP</th>
                <th className="bg-amber-50 px-4 py-3 text-right text-amber-700">Alt FP</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {players.map((player) => (
                <tr key={player.id} className="hover:bg-slate-50">
                  <td className="whitespace-nowrap px-4 py-3 text-center">
                    <StarterCheckbox snapshotId={player.id} defaultChecked={player.isStarter} label={`В старте: ${player.playerName}`} />
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 font-medium text-ink">{player.playerName}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-slate-600">{player.positionGroup ?? "-"}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-right text-slate-600">{formatNumber(player.age)}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-right text-slate-600">{formatNumber(player.minutesPlayed)}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-right text-slate-600">{formatScore(player.goals)}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-right text-slate-600">{formatScore(player.xg)}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-right text-slate-600">{formatScore(player.assists)}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-right text-slate-600">{formatCurrency(player.marketValue)}</td>
                  <td className="whitespace-nowrap bg-emerald-50/70 px-4 py-3 text-right font-semibold text-emerald-700">
                    {formatScore(player.fantasyScore)}
                  </td>
                  <td className="whitespace-nowrap bg-amber-50/70 px-4 py-3 text-right font-semibold text-amber-700">
                    {formatScore(player.alternativeScore)}
                  </td>
                </tr>
              ))}
              {players.length === 0 ? (
                <tr>
                  <td colSpan={11} className="px-4 py-10 text-center text-slate-500">
                    No published player snapshots for this team yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
