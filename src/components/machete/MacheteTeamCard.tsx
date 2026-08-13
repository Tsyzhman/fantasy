import { ArrowRight, IdCard } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

import { I18nText } from "@/components/i18n-text";
import { formatDate, formatDateTime, formatNumber, formatScore } from "@/lib/format";
import { initials } from "@/lib/text";
import {
  forecastCoverageStatus,
  startingXiCoverageStatus,
  type ForecastCoverageStatus,
  type StartingXiCoverageStatus
} from "@/machete/roster-coverage";

import { MacheteStatusBadge } from "./MacheteStatusBadge";

export type MacheteTeamCardDto = {
  id: string;
  leagueId: string;
  season: string | null;
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
  startingXiChangedAt: Date | string | null;
  startersCount: number;
  forecastPlayers: number;
};

export function MacheteTeamCard({ team }: { team: MacheteTeamCardDto }) {
  const xiStatus = startingXiCoverageStatus({ playersCount: team.playersSynced, startersCount: team.startersCount });
  const forecastStatus = forecastCoverageStatus({ playersCount: team.playersSynced, forecastPlayers: team.forecastPlayers });
  const coverageClassName = team.playersSynced === 0 || xiStatus === "NONE" || xiStatus === "EMPTY"
    ? "border-rose-200 bg-rose-50/40"
    : forecastStatus === "NONE"
      ? "border-orange-200 bg-orange-50/40"
      : xiStatus === "FULL" && forecastStatus === "FULL"
        ? "border-emerald-200 bg-emerald-50/40"
        : "border-amber-200 bg-amber-50/40";

  return (
    <article className={`flex min-h-[310px] flex-col rounded border p-4 shadow-soft ${coverageClassName}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <MacheteTeamLogo logoUrl={team.logoUrl} name={team.name} />
          <div className="min-w-0">
            <h2 className="truncate text-base font-semibold text-ink">{team.name}</h2>
            <p className="text-xs text-slate-500">
              {[team.country, team.leagueName].filter(Boolean).join(" / ")}
            </p>
          </div>
        </div>
        <div className="flex max-w-[58%] flex-wrap justify-end gap-1.5">
          <MacheteStatusBadge status={team.status} />
          <MacheteStatusBadge status={xiBadgeStatus(xiStatus)} />
          <MacheteStatusBadge status={forecastBadgeStatus(forecastStatus)} />
        </div>
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
        <div>
          <dt className="text-xs font-medium uppercase text-slate-400">FotMob ID</dt>
          <dd className="mt-1 flex items-center gap-1 truncate text-slate-700">
            <IdCard className="h-3.5 w-3.5 shrink-0 text-slate-400" />
            {team.providerTeamId ?? <I18nText en="Not linked" ru="Не связан" />}
          </dd>
        </div>
        <div>
          <dt className="text-xs font-medium uppercase text-slate-400">
            <I18nText en="Last sync" ru="Последняя синхронизация" />
          </dt>
          <dd className="mt-1 text-slate-700">{formatDate(team.lastSyncedAt)}</dd>
        </div>
        <div>
          <dt className="text-xs font-medium uppercase text-slate-400">
            <I18nText en="Players" ru="Игроки" />
          </dt>
          <dd className="mt-1 font-semibold text-ink">{formatNumber(team.playersSynced)}</dd>
        </div>
        <div>
          <dt className="text-xs font-medium uppercase text-slate-400">
            <I18nText en="Fixtures" ru="Матчи" />
          </dt>
          <dd className="mt-1 font-semibold text-ink">{formatNumber(team.fixturesSynced)}</dd>
        </div>
        <div>
          <dt className="text-xs font-medium uppercase text-slate-400"><I18nText en="Expected FP" ru="Прогноз FP" /></dt>
          <dd className="mt-1 font-semibold text-emerald-700">{formatScore(team.expectedFantasyPoints)}</dd>
        </div>
        <div>
          <dt className="text-xs font-medium uppercase text-slate-400">
            <I18nText en="Starting XI" ru="Стартовый XI" />
          </dt>
          <dd className="mt-1 font-semibold text-ink">{formatNumber(team.startersCount)}/11</dd>
        </div>
        <div>
          <dt className="text-xs font-medium uppercase text-slate-400">
            <I18nText en="Forecast players" ru="Игроки с прогнозом" />
          </dt>
          <dd className="mt-1 font-semibold text-ink">{formatNumber(team.forecastPlayers)}/{formatNumber(team.playersSynced)}</dd>
        </div>
        <div>
          <dt className="text-xs font-medium uppercase text-slate-400">
            <I18nText en="XI flags updated" ru="Флаги XI обновлены" />
          </dt>
          <dd className="mt-1 whitespace-nowrap text-slate-700">{formatDateTime(team.startingXiChangedAt)}</dd>
        </div>
      </dl>

      <div className="mt-auto flex flex-col gap-2 pt-5">
        <Link
          href={`/machete/leagues/${team.leagueId}/teams/${team.id}`}
          className="inline-flex items-center justify-center gap-2 rounded border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
        >
          <I18nText en="View details" ru="Открыть детали" />
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    </article>
  );
}

function xiBadgeStatus(status: StartingXiCoverageStatus) {
  return {
    FULL: "XI_COMPLETE",
    PARTIAL: "XI_PARTIAL",
    NONE: "XI_NONE",
    EMPTY: "XI_EMPTY",
    OVERSIZED: "XI_OVERSIZED"
  }[status];
}

function forecastBadgeStatus(status: ForecastCoverageStatus) {
  return {
    FULL: "FORECAST_FULL",
    PARTIAL: "FORECAST_PARTIAL",
    NONE: "FORECAST_NONE"
  }[status];
}

export function MacheteTeamLogo({ logoUrl, name, size = "md" }: { logoUrl: string | null; name: string; size?: "md" | "lg" }) {
  const frameSize = size === "lg" ? "h-16 w-16" : "h-12 w-12";
  const imageSize = size === "lg" ? "h-14 w-14" : "h-10 w-10";
  const imageDimension = size === "lg" ? 56 : 40;
  const renderableLogoUrl = logoUrl && (logoUrl.startsWith("/") || logoUrl.startsWith("https://images.fotmob.com/")) ? logoUrl : null;

  if (renderableLogoUrl) {
    return (
      <div className={`team-logo-frame grid ${frameSize} shrink-0 place-items-center`}>
        <Image
          src={renderableLogoUrl}
          alt=""
          width={imageDimension}
          height={imageDimension}
          unoptimized
          className={`team-logo-image ${imageSize} object-contain`}
        />
      </div>
    );
  }

  return (
    <div className={`team-logo-frame grid ${frameSize} shrink-0 place-items-center text-sm font-bold text-ink`}>
      {initials(name)}
    </div>
  );
}
