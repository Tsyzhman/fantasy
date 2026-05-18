import { ArrowRight, CalendarDays, ShieldCheck } from "lucide-react";
import Link from "next/link";

import { formatDate, formatNumber, formatScore } from "@/lib/format";

import { MacheteStatusBadge } from "./MacheteStatusBadge";

export type MacheteLeagueCardDto = {
  id: string;
  name: string;
  country: string | null;
  season: string | null;
  status: string;
  lastSyncedAt: Date | string | null;
  teamsSynced: number;
  playersSynced: number;
  fixturesSynced: number;
  expectedFantasyPoints: number | null;
};

export function MacheteLeagueCard({ league }: { league: MacheteLeagueCardDto }) {
  return (
    <Link
      href={`/machete/leagues/${league.id}`}
      className="rounded border border-slate-200 bg-white p-5 shadow-soft transition hover:-translate-y-0.5 hover:border-slate-300"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="grid h-11 w-11 place-items-center rounded bg-ink text-white">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <div>
            <h2 className="font-semibold text-ink">{league.name}</h2>
            <p className="text-sm text-slate-500">
              {[league.country, league.season].filter(Boolean).join(" / ") || "FotMob league"}
            </p>
          </div>
        </div>
        <ArrowRight className="h-5 w-5 text-slate-400" />
      </div>

      <div className="mt-5 flex items-center justify-between">
        <MacheteStatusBadge status={league.status} />
        <p className="flex items-center gap-2 text-sm text-slate-500">
          <CalendarDays className="h-4 w-4" />
          {formatDate(league.lastSyncedAt)}
        </p>
      </div>

      <dl className="mt-5 grid grid-cols-4 gap-3 text-sm">
        <div>
          <dt className="text-xs font-medium uppercase text-slate-400">Teams</dt>
          <dd className="mt-1 font-semibold text-ink">{formatNumber(league.teamsSynced)}</dd>
        </div>
        <div>
          <dt className="text-xs font-medium uppercase text-slate-400">Players</dt>
          <dd className="mt-1 font-semibold text-ink">{formatNumber(league.playersSynced)}</dd>
        </div>
        <div>
          <dt className="text-xs font-medium uppercase text-slate-400">Fixtures</dt>
          <dd className="mt-1 font-semibold text-ink">{formatNumber(league.fixturesSynced)}</dd>
        </div>
        <div>
          <dt className="text-xs font-medium uppercase text-slate-400">Exp FP</dt>
          <dd className="mt-1 font-semibold text-emerald-700">{formatScore(league.expectedFantasyPoints)}</dd>
        </div>
      </dl>
    </Link>
  );
}
