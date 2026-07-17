import type { ReactNode } from "react";

import { I18nText } from "@/components/i18n-text";
import { FdrRow } from "@/components/ui/fdr-pill";
import { formatNumber, formatScore } from "@/lib/format";
import { cn } from "@/lib/cn";
import { compactPlayerDisplayName } from "@/lib/players/display-name";
import { compactTeamDisplayName } from "@/lib/teams/display";

export type PlayerHoverCardData = {
  name: string;
  position?: string | null;
  teamName?: string | null;
  teamShortName?: string | null;
  nationality?: string | null;
  age?: number | null;
  matchesPlayed?: number | null;
  minutesPlayed?: number | null;
  goals?: number | null;
  assists?: number | null;
  averageRating?: number | null;
  xFp?: number | null;
  actualFp?: number | null;
  altFp?: number | null;
  fixtures?: Array<{ label: string; difficulty: number | null | undefined; title?: string }>;
};

export function PlayerHoverCard({
  player,
  trigger,
  className
}: {
  player: PlayerHoverCardData;
  trigger: ReactNode;
  className?: string;
}) {
  return (
    <span className={cn("hover-card-trigger", className)} tabIndex={0}>
      {trigger}
      <span className="hover-card-panel" role="tooltip">
        <span className="block text-sm font-bold text-ink" title={player.name}>{compactPlayerDisplayName(player.name)}</span>
        <span className="mt-0.5 block text-xs text-slate-500" title={player.teamName ?? undefined}>
          {[player.position, compactTeamDisplayName({ name: player.teamName, shortName: player.teamShortName })].filter(Boolean).join(" · ") || (
            <I18nText en="No team data" ru="Нет данных о команде" />
          )}
        </span>

        <dl className="mt-2 grid grid-cols-3 gap-2 text-[11px] text-slate-600">
          <DataPoint
            label={<I18nText en="Apps" ru="Матчи" />}
            value={formatNumber(player.matchesPlayed)}
          />
          <DataPoint
            label={<I18nText en="Min" ru="Мин." />}
            value={formatNumber(player.minutesPlayed)}
          />
          <DataPoint
            label={<I18nText en="Rating" ru="Рейтинг" />}
            value={formatScore(player.averageRating)}
          />
          <DataPoint label="G" value={formatNumber(player.goals)} />
          <DataPoint label="A" value={formatNumber(player.assists)} />
          <DataPoint
            label={<I18nText en="Age" ru="Возраст" />}
            value={formatNumber(player.age)}
          />
        </dl>

        <div className="mt-2 grid grid-cols-3 gap-2 text-[11px]">
          <ScoreBlock tone="emerald" label="xFP" value={player.xFp} />
          <ScoreBlock tone="sky" label="FP" value={player.actualFp} />
          <ScoreBlock tone="amber" label="vFP" value={player.altFp} />
        </div>

        {player.fixtures && player.fixtures.length > 0 ? (
          <div className="mt-2">
            <span className="block text-[10px] font-semibold uppercase tracking-wide text-slate-500">
              <I18nText en="Next fixtures" ru="Ближайшие матчи" />
            </span>
            <FdrRow className="mt-1" fixtures={player.fixtures.slice(0, 6)} />
          </div>
        ) : null}
      </span>
    </span>
  );
}

function DataPoint({ label, value }: { label: ReactNode; value: string }) {
  return (
    <div>
      <dt className="text-[10px] font-medium uppercase tracking-wide text-slate-400">{label}</dt>
      <dd className="num-tabular font-semibold text-ink">{value}</dd>
    </div>
  );
}

function ScoreBlock({
  tone,
  label,
  value
}: {
  tone: "emerald" | "sky" | "amber";
  label: string;
  value: number | null | undefined;
}) {
  const bg =
    tone === "emerald"
      ? "bg-emerald-50 text-emerald-700"
      : tone === "sky"
        ? "bg-sky-50 text-sky-700"
        : "bg-amber-50 text-amber-800";
  return (
    <div className={cn("rounded px-2 py-1 text-center", bg)}>
      <div className="text-[10px] font-bold uppercase tracking-wide">{label}</div>
      <div className="num-tabular text-sm font-bold">{formatScore(value)}</div>
    </div>
  );
}
