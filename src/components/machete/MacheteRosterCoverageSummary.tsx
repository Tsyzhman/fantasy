import type { ReactNode } from "react";

import { I18nText } from "@/components/i18n-text";
import { formatDateTime, formatNumber } from "@/lib/format";
import type { RosterCoverageSummary } from "@/machete/roster-coverage";

export function MacheteRosterCoverageSummary({ coverage }: { coverage: RosterCoverageSummary }) {
  return (
    <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
      <CoverageMetric
        label={<I18nText en="Teams with roster" ru="Команды с составом" />}
        value={`${formatNumber(coverage.teamsWithRoster)}/${formatNumber(coverage.teams)}`}
      />
      <CoverageMetric
        label={<I18nText en="Full starting XI" ru="Полные XI" />}
        value={`${formatNumber(coverage.completeStartingXiTeams)}/${formatNumber(coverage.teams)}`}
        tone={coverage.completeStartingXiTeams === coverage.teams && coverage.teams > 0 ? "good" : "warn"}
      />
      <CoverageMetric
        label={<I18nText en="Teams without forecasts" ru="Команды без прогнозов" />}
        value={formatNumber(coverage.teamsWithoutForecasts)}
        tone={coverage.teamsWithoutForecasts === 0 ? "good" : "bad"}
      />
      <CoverageMetric
        label={<I18nText en="XI flags updated" ru="Флаги XI обновлены" />}
        value={formatDateTime(coverage.latestStartingXiChangedAt)}
      />
    </dl>
  );
}

function CoverageMetric({
  label,
  value,
  tone = "neutral"
}: {
  label: ReactNode;
  value: string;
  tone?: "neutral" | "good" | "warn" | "bad";
}) {
  const valueClassName = {
    neutral: "text-ink",
    good: "text-emerald-700",
    warn: "text-amber-700",
    bad: "text-rose-700"
  }[tone];

  return (
    <div>
      <dt className="text-xs font-medium uppercase text-slate-400">{label}</dt>
      <dd className={`mt-1 font-semibold ${valueClassName}`}>{value}</dd>
    </div>
  );
}
