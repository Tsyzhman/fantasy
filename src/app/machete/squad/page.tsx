import Link from "next/link";

import { FantasySquadPlanner } from "@/components/machete/FantasySquadPlanner";
import { MacheteShell } from "@/components/machete/MacheteShell";
import { PageBreadcrumbs } from "@/components/page-breadcrumbs";
import { AutoSubmitForm } from "@/components/players/auto-submit-form";
import { requireCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { loadSharedLeagueOptions } from "@/machete/shared_read_model";
import { loadFantasySquadPlannerData } from "@/machete/squad_planner";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: Promise<{
    leagueId?: string;
  }>;
};

export default async function MacheteSquadPage({ searchParams }: PageProps) {
  const user = await requireCurrentUser();
  const params = await searchParams;
  const leagues = await loadSharedLeagueOptions(prisma);
  const selectedLeague = leagues.find((league) => String(league.leagueId) === params.leagueId) ?? leagues[0] ?? null;
  const data = selectedLeague ? await loadFantasySquadPlannerData(prisma, user.id, selectedLeague) : null;

  return (
    <MacheteShell>
      <div className="mt-6">
        <PageBreadcrumbs
          backHref="/machete/leagues"
          backLabel="Back to leagues"
          items={[
            { label: "Machete", href: "/machete/leagues" },
            { label: "Squad", href: "/machete/squad" }
          ]}
        />
      </div>

      <section className="mt-8 rounded border border-slate-200 bg-white p-5 shadow-soft">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">Fantasy planning</p>
            <h2 className="mt-2 text-2xl font-bold text-ink">Squad picker and transfer planner</h2>
            <p className="mt-2 max-w-3xl text-sm text-slate-600">
              Build a user squad for each league, project the next rounds, and let Machete suggest transfers that improve the next round without dropping over the selected horizon.
            </p>
          </div>
          <Link href="/machete/players" className="inline-flex items-center justify-center rounded border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
            Player explorer
          </Link>
        </div>

        <AutoSubmitForm className="mt-5 grid grid-cols-1 gap-3 md:max-w-xl md:grid-cols-[1fr_auto]">
          <label className="text-sm">
            <span className="mb-1 block font-medium text-slate-600">League</span>
            <select name="leagueId" defaultValue={selectedLeague ? String(selectedLeague.leagueId) : ""} className="w-full rounded border border-slate-200 px-3 py-2">
              {leagues.map((league) => (
                <option key={`${league.leagueId}:${league.season}`} value={String(league.leagueId)}>
                  {league.displayName} - {league.season}
                </option>
              ))}
            </select>
          </label>
          <button type="submit" className="self-end rounded bg-ink px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700">
            Load
          </button>
        </AutoSubmitForm>
      </section>

      {selectedLeague && data ? (
        <FantasySquadPlanner
          leagueId={String(selectedLeague.leagueId)}
          season={selectedLeague.season}
          rules={data.rules}
          rounds={data.rounds}
          players={data.players}
          initialSquad={data.squad}
          priceStatus={data.priceStatus}
        />
      ) : (
        <div className="mt-8 rounded border border-dashed border-slate-300 bg-white p-10 text-center text-slate-500">
          No Machete league data is loaded yet. Run the shared FotMob ingestion first.
        </div>
      )}
    </MacheteShell>
  );
}
