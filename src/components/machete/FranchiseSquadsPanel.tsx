"use client";

import { AlertTriangle, ChevronDown, ChevronRight, Filter, RotateCcw, Users } from "lucide-react";
import { Fragment, useMemo, useState, type SyntheticEvent } from "react";

import { I18nText } from "@/components/i18n-text";
import { localizedText, useLanguage } from "@/components/localized-option";
import { FranchiseSquadPreview } from "@/components/machete/FranchiseSquadPreview";
import { SortableTable } from "@/components/sortable-table";
import { cn } from "@/lib/cn";
import { formatDateTime, formatScore, NULL_GLYPH } from "@/lib/format";
import type { AdminFranchiseSquadPreviewPlayer } from "@/machete/admin-franchise-squads";

type Franchise = "MACHETE" | "BALTIKA";
type UiLanguage = ReturnType<typeof useLanguage>;

export type FranchiseSquadTableFilters = {
  user: string;
  squad: string;
  starterMin: string;
  starterMax: string;
  captain: string;
  fpMin: string;
  fpMax: string;
  alternativeMin: string;
  alternativeMax: string;
  foontasyMin: string;
  foontasyMax: string;
};

const emptyTableFilters: FranchiseSquadTableFilters = {
  user: "", squad: "", starterMin: "", starterMax: "", captain: "",
  fpMin: "", fpMax: "", alternativeMin: "", alternativeMax: "", foontasyMin: "", foontasyMax: ""
};

export type FranchiseSquadRow = {
  userId: string;
  userName: string;
  email?: string;
  isActive?: boolean;
  squadName: string | null;
  squadUpdatedAt: string | null;
  starterCount: number;
  captainName: string | null;
  fp: number | null;
  alternativeFp: number | null;
  alternativeBreakdown?: Array<{ name: string; points: number; multiplier: number }>;
  foontasyFp: number | null;
  foontasyAvailable: number;
  alternativeIssuePlayerNames: string[];
  previewPlayers: AdminFranchiseSquadPreviewPlayer[];
  error: string | null;
};

export function FranchiseSquadsPanel({ leagueId, season, initialFranchise, canSwitch }: {
  leagueId: string;
  season: string;
  initialFranchise: Franchise | null;
  canSwitch: boolean;
}) {
  const language = useLanguage();
  const [franchise, setFranchise] = useState<Franchise | null>(initialFranchise);
  const [rows, setRows] = useState<FranchiseSquadRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleToggle(event: SyntheticEvent<HTMLDetailsElement>) {
    if (event.currentTarget.open && rows === null && franchise) void load(franchise);
  }

  async function load(nextFranchise: Franchise) {
    setFranchise(nextFranchise);
    setLoading(true);
    setError(null);
    try {
      const query = new URLSearchParams({ leagueId, season, franchise: nextFranchise });
      const response = await fetch(`/api/machete/franchise-squads?${query.toString()}`, { cache: "no-store", headers: { Accept: "application/json" } });
      const payload = await response.json().catch(() => ({})) as { rows?: FranchiseSquadRow[]; error?: { message?: string } };
      if (!response.ok || !payload.rows) throw new Error(payload.error?.message ?? "Не удалось загрузить составы франшизы.");
      setRows(payload.rows);
    } catch (loadError) {
      setRows(null);
      setError(loadError instanceof Error ? loadError.message : "Не удалось загрузить составы франшизы.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <details id="franchise-squads" onToggle={handleToggle} className="mt-5 rounded border border-slate-200 bg-white shadow-sm">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 [&::-webkit-details-marker]:hidden">
        <span className="flex min-w-0 items-center gap-2 font-semibold text-ink">
          <Users className="h-4 w-4 shrink-0" aria-hidden="true" />
          <I18nText en="Franchise squads" ru="Составы франшизы" />
          {franchise ? <span className="truncate text-xs font-normal text-slate-500">· {franchiseLabel(franchise)}</span> : null}
        </span>
        <ChevronDown className="h-4 w-4 shrink-0 text-slate-500 transition-transform [[open]>&]:rotate-180" aria-hidden="true" />
      </summary>
      <div className="border-t border-slate-200 p-4">
        <p className="text-sm text-slate-600">
          <I18nText en="The selected league above is used automatically. FP, Alt and FFO count only the starting XI; the captain is doubled." ru="Используется уже выбранная выше лига. ФО, Альт и FFO считают только стартовые 11; капитан учитывается x2." />
        </p>
        {canSwitch ? (
          <div className="mt-3 flex gap-2" aria-label="Франшиза">
            {(["MACHETE", "BALTIKA"] as const).map((option) => (
              <button key={option} type="button" onClick={() => void load(option)} className={cn("rounded border px-3 py-2 text-sm font-semibold", franchise === option ? "border-ink bg-ink text-white" : "border-slate-200 text-slate-600 hover:border-slate-400")}>
                {franchiseLabel(option)}
              </button>
            ))}
          </div>
        ) : franchise ? (
          <p className="mt-3 inline-flex rounded bg-slate-100 px-3 py-1.5 text-sm font-semibold text-slate-700">{franchiseLabel(franchise)}</p>
        ) : (
          <p className="mt-3 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900"><I18nText en="No franchise is assigned." ru="Франшиза не назначена." /></p>
        )}
        {loading ? <p className="mt-4 text-sm text-slate-500"><I18nText en="Loading squads…" ru="Загрузка составов…" /></p> : null}
        {error ? <p role="alert" className="mt-4 rounded border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">{error}</p> : null}
        {rows ? <FranchiseSquadTable key={franchise ?? "unassigned"} rows={rows} language={language} /> : null}
      </div>
    </details>
  );
}

function FranchiseSquadTable({ rows, language }: { rows: FranchiseSquadRow[]; language: UiLanguage }) {
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filters, setFilters] = useState<FranchiseSquadTableFilters>(emptyTableFilters);
  const [expandedUserIds, setExpandedUserIds] = useState<Set<string>>(() => new Set());
  const filteredRows = useMemo(() => filterFranchiseSquadRows(rows, filters), [filters, rows]);
  const activeFilterCount = Object.values(filters).filter((value) => value.trim() !== "").length;

  function updateFilter(key: keyof FranchiseSquadTableFilters, value: string) {
    setFilters((current) => ({ ...current, [key]: value }));
  }

  function togglePreview(userId: string) {
    setExpandedUserIds((current) => {
      const next = new Set(current);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  }

  return (
    <div className="mt-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button type="button" aria-expanded={filtersOpen} onClick={() => setFiltersOpen((open) => !open)} className={cn("inline-flex items-center gap-2 rounded border px-3 py-2 text-sm font-semibold", filtersOpen || activeFilterCount > 0 ? "border-sky-300 bg-sky-50 text-sky-800" : "border-slate-200 bg-white text-slate-700 hover:border-slate-400")}>
          <Filter className="h-4 w-4" aria-hidden="true" />
          <I18nText en="Advanced filters" ru="Расширенные фильтры" />
          {activeFilterCount > 0 ? <span className="rounded-full bg-sky-700 px-1.5 text-[10px] text-white">{activeFilterCount}</span> : null}
        </button>
        <p className="text-xs text-slate-500">
          <I18nText en="Shown" ru="Показано" />: {filteredRows.length}/{rows.length}
        </p>
      </div>

      {filtersOpen ? (
        <div className="mt-3 rounded border border-sky-200 bg-sky-50/50 p-3">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <TextFilter label={localizedText(language, "User", "Пользователь")} value={filters.user} onChange={(value) => updateFilter("user", value)} />
            <TextFilter label={localizedText(language, "Squad / Alt issue player", "Состав / игрок с проблемой Alt")} value={filters.squad} onChange={(value) => updateFilter("squad", value)} />
            <NumberRangeFilter label={localizedText(language, "Starting XI", "Старт")} minimum={filters.starterMin} maximum={filters.starterMax} onMinimum={(value) => updateFilter("starterMin", value)} onMaximum={(value) => updateFilter("starterMax", value)} />
            <TextFilter label={localizedText(language, "Captain", "Капитан")} value={filters.captain} onChange={(value) => updateFilter("captain", value)} />
            <NumberRangeFilter label={localizedText(language, "FP", "ФО")} minimum={filters.fpMin} maximum={filters.fpMax} onMinimum={(value) => updateFilter("fpMin", value)} onMaximum={(value) => updateFilter("fpMax", value)} />
            <NumberRangeFilter label="Alt" minimum={filters.alternativeMin} maximum={filters.alternativeMax} onMinimum={(value) => updateFilter("alternativeMin", value)} onMaximum={(value) => updateFilter("alternativeMax", value)} />
            <NumberRangeFilter label="FFO" minimum={filters.foontasyMin} maximum={filters.foontasyMax} onMinimum={(value) => updateFilter("foontasyMin", value)} onMaximum={(value) => updateFilter("foontasyMax", value)} />
          </div>
          <button type="button" onClick={() => setFilters(emptyTableFilters)} disabled={activeFilterCount === 0} className="mt-3 inline-flex items-center gap-2 rounded border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50">
            <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
            <I18nText en="Reset filters" ru="Сбросить фильтры" />
          </button>
        </div>
      ) : null}

      <div className="mt-3 overflow-x-auto rounded border border-slate-200">
      <SortableTable
        sortRefreshKey={filteredRows.length}
        onClientSortChange={() => setExpandedUserIds(new Set())}
        className="min-w-[900px] w-full text-left text-sm"
      >
        <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
          <tr>
            <th data-sort-disabled="true" className="px-4 py-3"><I18nText en="User" ru="Пользователь" /></th>
            <th data-sort-disabled="true" className="px-4 py-3"><I18nText en="Squad" ru="Состав" /></th>
            <th className="px-4 py-3 text-center"><I18nText en="Starting XI" ru="Старт" /></th>
            <th data-sort-disabled="true" className="px-4 py-3"><I18nText en="Captain" ru="Капитан" /></th>
            <th data-sort-default-direction="desc" className="px-4 py-3 text-right"><I18nText en="FP" ru="ФО" /></th>
            <th data-sort-default-direction="desc" className="px-4 py-3 text-right"><I18nText en="Alt" ru="Альт" /></th>
            <th data-sort-default-direction="desc" className="px-4 py-3 text-right">FFO</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {filteredRows.map((row) => {
            const expanded = expandedUserIds.has(row.userId);
            const canPreview = Boolean(row.squadName && row.previewPlayers.length > 0);
            const toggleId = `franchise-squad-toggle-${row.userId}`;
            const previewId = `franchise-squad-preview-${row.userId}`;
            return (
            <Fragment key={row.userId}>
            <tr
              data-sort-row-key={row.userId}
              onClick={canPreview ? () => togglePreview(row.userId) : undefined}
              className={cn(
                row.isActive === false && "opacity-55",
                canPreview && "cursor-pointer transition-colors hover:bg-slate-50",
                expanded && "bg-sky-50/60"
              )}
            >
              <td className="px-4 py-3">
                <button
                  id={toggleId}
                  type="button"
                  aria-expanded={expanded}
                  aria-controls={previewId}
                  disabled={!canPreview}
                  title={canPreview ? localizedText(language, "Open squad preview", "Открыть предпросмотр состава") : undefined}
                  className="flex w-full items-start gap-2 text-left disabled:cursor-default"
                >
                  <ChevronRight className={cn("mt-0.5 h-4 w-4 shrink-0 text-slate-400 transition-transform", expanded && "rotate-90 text-sky-700", !canPreview && "invisible")} aria-hidden="true" />
                  <span className="min-w-0">
                    <span className="block font-semibold text-ink">{row.userName}</span>
                    {row.email ? <span className="block text-xs text-slate-500">{row.email}{row.isActive === false ? localizedText(language, " · disabled", " · отключён") : ""}</span> : null}
                  </span>
                </button>
              </td>
              <td className="px-4 py-3">
                <p className="font-medium text-slate-700">{row.squadName ?? localizedText(language, "No squad", "Нет состава")}</p>
                <p className="text-xs text-slate-500">{row.squadUpdatedAt ? formatDateTime(new Date(row.squadUpdatedAt)) : NULL_GLYPH}</p>
                {row.alternativeIssuePlayerNames.length > 0 ? (
                  <p className="mt-1 flex max-w-md items-start gap-1 rounded bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-900" title={row.alternativeIssuePlayerNames.join(", ")}>
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    <span>{localizedText(language, "Alt 0/no forecast", "Альт 0/нет прогноза")}: {row.alternativeIssuePlayerNames.join(", ")}</span>
                  </p>
                ) : null}
                {row.error ? <p className="mt-1 text-xs text-rose-700">{row.error}</p> : null}
              </td>
              <td data-sort-value={row.starterCount} className="px-4 py-3 text-center font-semibold text-slate-700">{row.squadName ? row.starterCount : NULL_GLYPH}</td>
              <td className="px-4 py-3 text-slate-600">{row.captainName ?? NULL_GLYPH}</td>
              <MetricCell value={row.fp} />
              <MetricCell value={row.alternativeFp} title={alternativeSquadTooltip(row, language)} />
              <td data-sort-value={row.foontasyFp ?? ""} className="px-4 py-3 text-right font-semibold text-sky-700">{formatScore(row.foontasyFp)}</td>
            </tr>
            {expanded ? (
              <tr data-sort-detail-row="true">
                <td colSpan={7} className="bg-slate-50 p-3">
                  <div id={previewId} role="region" aria-labelledby={toggleId}>
                    <FranchiseSquadPreview players={row.previewPlayers} ownerName={row.userName} />
                  </div>
                </td>
              </tr>
            ) : null}
            </Fragment>
            );
          })}
          {filteredRows.length === 0 ? <tr><td colSpan={7} className="px-4 py-10 text-center text-slate-500"><I18nText en="No squads match the current filters." ru="Нет составов, подходящих под текущие фильтры." /></td></tr> : null}
        </tbody>
      </SortableTable>
      </div>
    </div>
  );
}

function TextFilter({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="text-xs font-semibold text-slate-600">
      <span className="mb-1 block">{label}</span>
      <input type="search" value={value} onChange={(event) => onChange(event.target.value)} className="w-full rounded border border-slate-200 bg-white px-2.5 py-2 font-normal text-ink" />
    </label>
  );
}

function NumberRangeFilter({ label, minimum, maximum, onMinimum, onMaximum }: { label: string; minimum: string; maximum: string; onMinimum: (value: string) => void; onMaximum: (value: string) => void }) {
  return (
    <fieldset className="text-xs font-semibold text-slate-600">
      <legend className="mb-1">{label}</legend>
      <div className="grid grid-cols-2 gap-2">
        <input aria-label={`${label}: min`} type="number" step="any" value={minimum} onChange={(event) => onMinimum(event.target.value)} placeholder="min" className="min-w-0 rounded border border-slate-200 bg-white px-2.5 py-2 font-normal text-ink" />
        <input aria-label={`${label}: max`} type="number" step="any" value={maximum} onChange={(event) => onMaximum(event.target.value)} placeholder="max" className="min-w-0 rounded border border-slate-200 bg-white px-2.5 py-2 font-normal text-ink" />
      </div>
    </fieldset>
  );
}

function MetricCell({ value, title }: { value: number | null; title?: string }) {
  return <td title={title} data-sort-value={value ?? ""} className="px-4 py-3 text-right font-semibold text-emerald-700">{formatScore(value)}</td>;
}

function alternativeSquadTooltip(row: FranchiseSquadRow, language: UiLanguage) {
  const lines = [localizedText(
    language,
    "Alt for the saved starting XI only; bench players are excluded and the captain is doubled.",
    "Alt только для сохранённых стартовых 11; лавка не учитывается, капитан считается x2."
  )];
  for (const player of row.alternativeBreakdown ?? []) {
    lines.push(`${player.name}: ${formatScore(player.points)}${player.multiplier === 2 ? " × 2" : ""}`);
  }
  if (row.alternativeIssuePlayerNames.length > 0) {
    lines.push(localizedText(
      language,
      `These starters have Alt 0/no forecast and contribute 0 to the displayed total: ${row.alternativeIssuePlayerNames.join(", ")}.`,
      `У этих игроков основы Alt равен 0 или отсутствует, поэтому их вклад в показанную сумму равен 0: ${row.alternativeIssuePlayerNames.join(", ")}.`
    ));
  }
  return lines.join("\n");
}

function franchiseLabel(franchise: Franchise) {
  return franchise === "BALTIKA" ? "Балтика" : "Мачете";
}

function textMatches(value: string, query: string) {
  const normalized = query.trim().toLocaleLowerCase();
  return normalized === "" || value.toLocaleLowerCase().includes(normalized);
}

function numberMatches(value: number | null, minimum: string, maximum: string) {
  const minimumValue = finiteFilterNumber(minimum);
  const maximumValue = finiteFilterNumber(maximum);
  if (minimumValue === null && maximumValue === null) return true;
  if (value === null || !Number.isFinite(value)) return false;
  return (minimumValue === null || value >= minimumValue) && (maximumValue === null || value <= maximumValue);
}

function finiteFilterNumber(value: string) {
  if (value.trim() === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function filterFranchiseSquadRows(rows: FranchiseSquadRow[], filters: FranchiseSquadTableFilters) {
  return rows.filter((row) =>
    textMatches(`${row.userName} ${row.email ?? ""}`, filters.user)
    && textMatches(`${row.squadName ?? ""} ${row.alternativeIssuePlayerNames.join(" ")}`, filters.squad)
    && numberMatches(row.starterCount, filters.starterMin, filters.starterMax)
    && textMatches(row.captainName ?? "", filters.captain)
    && numberMatches(row.fp, filters.fpMin, filters.fpMax)
    && numberMatches(row.alternativeFp, filters.alternativeMin, filters.alternativeMax)
    && numberMatches(row.foontasyFp, filters.foontasyMin, filters.foontasyMax)
  );
}
