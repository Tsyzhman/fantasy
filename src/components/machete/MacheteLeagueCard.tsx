import { ArrowRight, CalendarDays } from "lucide-react";
import Link from "next/link";

import { I18nText } from "@/components/i18n-text";
import { LeagueFlag } from "@/components/ui/league-flag";
import { formatDate, formatNumber, formatScore } from "@/lib/format";
import { macheteCatalogByFotMobId } from "@/lib/leagues/machete-catalog";
import { leagueSubtitle, macheteLeagueDisplayName } from "@/lib/leagues/display";

import { MacheteStatusBadge } from "./MacheteStatusBadge";

export type MacheteLeagueCardDto = {
  id: string;
  providerLeagueId: string | null;
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
  const seedLeague = macheteCatalogByFotMobId(league.providerLeagueId);
  const flagInput = {
    id: seedLeague?.id ?? league.id,
    name: league.name,
    code: seedLeague?.code,
    country: seedLeague?.country ?? league.country
  };
  const displayName = macheteLeagueDisplayName({ ...flagInput, providerLeagueId: league.providerLeagueId });

  return (
    <Link
      href={`/machete/leagues/${league.id}${league.season ? `?season=${encodeURIComponent(league.season)}` : ""}`}
      className="rounded border border-slate-200 bg-white p-5 shadow-soft transition hover:-translate-y-0.5 hover:border-slate-300"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <LeagueFlag league={flagInput} size={36} />
          <div>
            <h2 className="font-semibold text-ink">{displayName}</h2>
            <p className="text-sm text-slate-500">
              {leagueSubtitle(flagInput, league.season) || <I18nText en="FotMob league" ru="Лига FotMob" />}
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
          <dt className="text-xs font-medium uppercase text-slate-400"><I18nText en="Teams" ru="Команды" /></dt>
          <dd className="mt-1 font-semibold text-ink num-tabular">{formatNumber(league.teamsSynced)}</dd>
        </div>
        <div>
          <dt className="text-xs font-medium uppercase text-slate-400"><I18nText en="Players" ru="Игроки" /></dt>
          <dd className="mt-1 font-semibold text-ink num-tabular">{formatNumber(league.playersSynced)}</dd>
        </div>
        <div>
          <dt className="text-xs font-medium uppercase text-slate-400"><I18nText en="Fixtures" ru="Матчи" /></dt>
          <dd className="mt-1 font-semibold text-ink num-tabular">{formatNumber(league.fixturesSynced)}</dd>
        </div>
        <div>
          <dt className="text-xs font-medium uppercase text-slate-400">xFP</dt>
          <dd className="mt-1 font-semibold text-emerald-700 num-tabular">{formatScore(league.expectedFantasyPoints)}</dd>
        </div>
      </dl>
    </Link>
  );
}
