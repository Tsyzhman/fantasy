import { ArrowRight, BarChart3, Boxes, DatabaseZap, Layers3, ListChecks, Search, Settings, Shield } from "lucide-react";
import Link from "next/link";

import { MacheteShell } from "@/components/machete/MacheteShell";
import { prisma } from "@/lib/db";
import { formatScore } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function MacheteHomePage() {
  const [leagues, teams, jobs, snapshots, snapshotRows, unmatched] = await Promise.all([
    prisma.macheteLeague.count(),
    prisma.macheteTeam.count(),
    prisma.macheteSyncJob.count(),
    prisma.machetePlayerSnapshot.count(),
    prisma.machetePlayerSnapshot.findMany({ select: { fantasyScore: true } }),
    prisma.providerEntityMap.count({ where: { provider: "FOTMOB", status: "UNMATCHED" } })
  ]);

  const expectedFantasyPoints = snapshotRows.length
    ? snapshotRows.reduce((total, snapshot) => total + (snapshot.fantasyScore ?? 0), 0) / snapshotRows.length
    : null;

  const cards = [
    { label: "Modules", value: 5, href: "/machete", icon: Boxes, caption: "Leagues / players / sync / matching / scoring" },
    { label: "Leagues", value: leagues, href: "/machete/leagues", icon: Layers3, caption: "FotMob provider workspaces" },
    { label: "Teams", value: teams, href: "/machete/leagues", icon: Shield, caption: "Synced team cards" },
    { label: "Expected FP", value: formatScore(expectedFantasyPoints), href: "/machete/leagues", icon: BarChart3, caption: "Average Machete fantasy points" },
    { label: "Sync jobs", value: jobs, href: "/machete/sync-jobs", icon: ListChecks, caption: "Persisted provider jobs" },
    { label: "Entity matching", value: unmatched, href: "/machete/leagues", icon: Search, caption: "Unmatched FotMob entities" },
    { label: "Player snapshots", value: snapshots, href: "/machete/players", icon: DatabaseZap, caption: "Normalized scoring rows" },
    { label: "Model settings", value: "Own", href: "/machete/models", icon: Settings, caption: "Machete-specific formulas" }
  ];

  return (
    <MacheteShell>
      <section className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <Link
              key={card.label}
              href={card.href}
              className="rounded border border-slate-200 bg-white p-5 shadow-soft transition hover:-translate-y-0.5 hover:border-slate-300"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="grid h-11 w-11 place-items-center rounded bg-ink text-white">
                  <Icon className="h-5 w-5" />
                </div>
                <ArrowRight className="h-5 w-5 text-slate-400" />
              </div>
              <p className="mt-5 text-sm font-semibold uppercase text-slate-500">{card.label}</p>
              <p className="mt-2 text-3xl font-bold text-ink">{card.value}</p>
              <p className="mt-2 text-xs text-slate-500">{card.caption}</p>
            </Link>
          );
        })}
      </section>
    </MacheteShell>
  );
}
