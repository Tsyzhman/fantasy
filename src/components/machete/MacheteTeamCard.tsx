import { ArrowRight, IdCard } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

import { formatDate, formatNumber, formatScore } from "@/lib/format";
import { initials } from "@/lib/text";

import { MacheteStatusBadge } from "./MacheteStatusBadge";
import { MacheteSyncButton } from "./MacheteSyncButton";

export type MacheteTeamCardDto = {
  id: string;
  leagueId: string;
  name: string;
  country: string | null;
  leagueName: string;
  providerTeamId: string | null;
  logoUrl: string | null;
  status: string;
  playersSynced: number;
  fixturesSynced: number;
  expectedFantasyPoints: number | null;
  lastSyncedAt: Date | string | null;
};

export function MacheteTeamCard({ team }: { team: MacheteTeamCardDto }) {
  return (
    <article className="flex min-h-[310px] flex-col rounded border border-slate-200 bg-white p-4 shadow-soft">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <TeamLogo logoUrl={team.logoUrl} name={team.name} />
          <div className="min-w-0">
            <h2 className="truncate text-base font-semibold text-ink">{team.name}</h2>
            <p className="text-xs text-slate-500">
              {[team.country, team.leagueName].filter(Boolean).join(" / ")}
            </p>
          </div>
        </div>
        <MacheteStatusBadge status={team.status} />
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
        <div>
          <dt className="text-xs font-medium uppercase text-slate-400">FotMob ID</dt>
          <dd className="mt-1 flex items-center gap-1 truncate text-slate-700">
            <IdCard className="h-3.5 w-3.5 shrink-0 text-slate-400" />
            {team.providerTeamId ?? "Not linked"}
          </dd>
        </div>
        <div>
          <dt className="text-xs font-medium uppercase text-slate-400">Last sync</dt>
          <dd className="mt-1 text-slate-700">{formatDate(team.lastSyncedAt)}</dd>
        </div>
        <div>
          <dt className="text-xs font-medium uppercase text-slate-400">Players</dt>
          <dd className="mt-1 font-semibold text-ink">{formatNumber(team.playersSynced)}</dd>
        </div>
        <div>
          <dt className="text-xs font-medium uppercase text-slate-400">Fixtures</dt>
          <dd className="mt-1 font-semibold text-ink">{formatNumber(team.fixturesSynced)}</dd>
        </div>
        <div>
          <dt className="text-xs font-medium uppercase text-slate-400">Expected FP</dt>
          <dd className="mt-1 font-semibold text-emerald-700">{formatScore(team.expectedFantasyPoints)}</dd>
        </div>
      </dl>

      <div className="mt-auto flex flex-col gap-2 pt-5">
        <MacheteSyncButton endpoint={`/api/machete/teams/${team.id}/sync`}>Sync team</MacheteSyncButton>
        <Link
          href={`/machete/leagues/${team.leagueId}/teams/${team.id}`}
          className="inline-flex items-center justify-center gap-2 rounded border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
        >
          View details
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    </article>
  );
}

function TeamLogo({ logoUrl, name }: { logoUrl: string | null; name: string }) {
  if (logoUrl && logoUrl.startsWith("/")) {
    return (
      <div className="grid h-12 w-12 shrink-0 place-items-center rounded bg-slate-900">
        <Image src={logoUrl} alt="" width={40} height={40} className="h-10 w-10 object-contain" />
      </div>
    );
  }

  return (
    <div className="grid h-12 w-12 shrink-0 place-items-center rounded bg-slate-900 text-sm font-bold text-white">
      {initials(name)}
    </div>
  );
}
