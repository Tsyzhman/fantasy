"use client";

import { ArrowLeft, ArrowRight, Columns3, Download, Save, SlidersHorizontal, Trash2 } from "lucide-react";
import { type PointerEvent as ReactPointerEvent, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";

import { PlayerCompareDraggable, PlayerComparePickButton, type ComparePlayer } from "@/components/compare/player-compare";
import { I18nText } from "@/components/i18n-text";
import { localizedText, useLanguage } from "@/components/localized-option";
import { MacheteStarterCheckbox } from "@/components/machete/MacheteStarterCheckbox";
import { fixtureChipPresentations } from "@/components/machete/fantasy-squad-ui";
import { PlayerWatchlistButton } from "@/components/players/player-watchlist";
import { SortableTable } from "@/components/sortable-table";
import { PlayerHoverCard, type PlayerHoverCardData } from "@/components/ui/player-hover-card";
import { ScoreHeatCell, computeRanks } from "@/components/ui/score-heat-cell";
import { SparkLine } from "@/components/ui/spark-line";
import { FdrRow } from "@/components/ui/fdr-pill";
import { cn } from "@/lib/cn";
import { formatNumber } from "@/lib/format";
import { compactPlayerDisplayName } from "@/lib/players/display-name";
import { compactTeamDisplayName } from "@/lib/teams/display";
import {
  machetePlayerTableFiltersSource,
  machetePlayerTableSettingsSource,
  parseMachetePlayerFilterPresetValue,
  parseMachetePlayerTableSettings,
  type MachetePlayerFilterPresetValue,
  type MachetePlayerTableSettings,
  type MachetePlayerTableValueFilter
} from "@/machete/machete-player-table-preferences";
import { nextAlternativeFantasyPoints, nextFantasyPoints, playerAlternativeHorizonPoints, playerHorizonPoints } from "@/machete/squad_logic";
import { startingXiSelectionBlockReason, type StartingXiLimitCode } from "@/machete/starting-xi-limits";

export type MachetePlayerRow = {
  id: string;
  name: string;
  teamName?: string | null;
  teamShortName?: string | null;
  leagueName?: string | null;
  position: string | null;
  price?: number | null;
  age: number | null;
  nationality: string | null;
  isStarter?: boolean | null;
  matchesPlayed: number;
  minutesPlayed: number;
  goals: number;
  assists: number;
  shotsOnTarget: number;
  keyPasses: number;
  tackles: number;
  averageRating: number | null;
  fantasyScore: number | null;
  scoringScore?: number | null;
  alternativeScore?: number | null;
  recentFp?: number[] | null;
  expectedMinutes?: number | null;
  minutesDeviation?: number | null;
  startProbability?: number | null;
  forecastConfidence?: number | null;
  predictedFp?: number | null;
  roundPoints?: number[] | null;
  alternativePredictedFp?: number | null;
  alternativeRoundPoints?: Array<number | null> | null;
  fixtures?: string[];
  fixtureFullNames?: string[];
  fixtureDifficulties?: Array<number | null>;
  rawMetrics?: Record<string, unknown>;
};

type Column = {
  key: string;
  label: string;
  title: string;
  width: number;
  numeric: boolean;
  value: (player: MachetePlayerRow) => string | number | null;
};

type ValueFilter = MachetePlayerTableValueFilter;
type FilterPreset = { id: string; name: string; filters: MachetePlayerFilterPresetValue; updatedAt: string };

const emptyFilter: ValueFilter = { min: "", max: "", query: "" };
const fixedWidths = { player: 190, team: 120, position: 64 } as const;
const defaultColumns = ["predictedFp", "forecastHorizonFp", "alternativePredictedFp", "alternativeForecastHorizon", "fixtures", "fantasyScore", "scoringScore", "expectedMinutes", "forecastConfidence", "averageRating"];
const storageKey = "machete-player-table:v2";

export function MachetePlayerTable({
  players,
  showContext = false,
  showStarterStatus = false,
  starterControls
}: {
  players: MachetePlayerRow[];
  showContext?: boolean;
  serverSortParam?: string;
  defaultSort?: string;
  showStarterStatus?: boolean;
  starterControls?: {
    leagueId: string;
    season: string;
    teamId: string;
    canEdit?: boolean;
    roster: Array<{ position: string | null; isStarter: boolean }>;
  };
}) {
  const language = useLanguage();
  const [horizon, setHorizon] = useState<3 | 5 | 10>(5);
  const columns = useMemo(() => macheteColumns(players, language, horizon), [horizon, language, players]);
  const columnsByKey = useMemo(() => new Map(columns.map((column) => [column.key, column])), [columns]);
  const [visibleKeys, setVisibleKeys] = useState(defaultColumns);
  const [widths, setWidths] = useState<Record<string, number>>({});
  const [filters, setFilters] = useState<Record<string, ValueFilter>>({});
  const [clientSort, setClientSort] = useState<{ key: string; direction: "asc" | "desc" } | null>(null);
  const [compactViewport, setCompactViewport] = useState<boolean | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [preferencesReady, setPreferencesReady] = useState(false);
  const [filterPresets, setFilterPresets] = useState<FilterPreset[]>([]);
  const [presetName, setPresetName] = useState("");
  const [presetPending, setPresetPending] = useState(false);
  const tableContainerRef = useRef<HTMLDivElement>(null);
  const deferredFilters = useDeferredValue(filters);
  const visibleColumns = visibleKeys.map((key) => columnsByKey.get(key)).filter((column): column is Column => Boolean(column));
  const fixedColumns = useMemo<Column[]>(() => [
    { key: "player", label: localizedText(language, "Player", "Игрок"), title: localizedText(language, "Player name. Minutes and forecast confidence are shown below it.", "Имя игрока. Под ним показаны ожидаемые минуты и уверенность прогноза."), width: fixedWidths.player, numeric: false, value: (player) => player.name },
    ...(showContext ? [{ key: "team", label: localizedText(language, "Team", "Клуб"), title: localizedText(language, "Current club and selected league context.", "Текущий клуб и контекст выбранной лиги."), width: fixedWidths.team, numeric: false, value: (player: MachetePlayerRow) => machetePlayerTeamDisplayName(player) ?? null }] : []),
    { key: "position", label: localizedText(language, "Pos", "Поз."), title: localizedText(language, "Fantasy position group.", "Позиционная группа фэнтези."), width: fixedWidths.position, numeric: false, value: (player) => player.position },
    { key: "price", label: localizedText(language, "Price", "Цена"), title: localizedText(language, "Current Sports.ru fantasy price. Missing means no verified price mapping.", "Текущая цена фэнтези Sports.ru. Пустое значение означает отсутствие подтверждённого сопоставления цены."), width: 72, numeric: true, value: (player) => player.price ?? null }
  ], [language, showContext]);

  useEffect(() => {
    const media = window.matchMedia("(max-width: 767px), (pointer: coarse)");
    const update = () => setCompactViewport(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    const container = tableContainerRef.current;
    if (!container) return;
    const updateSort = (event: Event) => {
      const detail = (event as CustomEvent<{ key?: unknown; direction?: unknown }>).detail;
      if (typeof detail?.key !== "string" || (detail.direction !== "asc" && detail.direction !== "desc")) return;
      setClientSort({ key: detail.key, direction: detail.direction });
    };
    container.addEventListener("sortable-table:sort-change", updateSort);
    return () => container.removeEventListener("sortable-table:sort-change", updateSort);
  }, [compactViewport]);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    void Promise.all([
      loadPlayerTableSavedViews(machetePlayerTableSettingsSource, controller.signal),
      loadPlayerTableSavedViews(machetePlayerTableFiltersSource, controller.signal)
    ]).then(([settingsViews, presetViews]) => {
      if (cancelled) return;
      const serverSettings = parseMachetePlayerTableSettings(settingsViews?.[0]?.filters);
      if (serverSettings) {
        setVisibleKeys(serverSettings.columns);
        setWidths(serverSettings.widths);
        setHorizon(serverSettings.horizon);
      } else {
        try {
          const saved = JSON.parse(window.localStorage.getItem(storageKey) ?? "null") as { version?: unknown; columns?: unknown; widths?: unknown; horizon?: unknown } | null;
          const parsedSaved = parseMachetePlayerTableSettings({ version: saved?.version === 2 ? 2 : 1, columns: saved?.columns, widths: saved?.widths, horizon: saved?.horizon });
          if (parsedSaved) {
            setVisibleKeys(parsedSaved.columns);
            setWidths(parsedSaved.widths);
            setHorizon(parsedSaved.horizon);
          }
        } catch { /* Invalid local preferences fall back to defaults. */ }
      }
      setFilterPresets(filterPresetsFromViews(presetViews));
      setPreferencesReady(true);
    });
    return () => { cancelled = true; controller.abort(); };
  }, []);

  useEffect(() => {
    if (!preferencesReady) return;
    window.localStorage.setItem(storageKey, JSON.stringify({ version: 2, columns: visibleKeys, widths, horizon }));
    const timeout = window.setTimeout(() => {
      void savePlayerTableSettings({ version: 2, columns: visibleKeys, widths, horizon });
    }, 400);
    return () => window.clearTimeout(timeout);
  }, [horizon, preferencesReady, visibleKeys, widths]);

  const activeFilterColumns = useMemo(() => [...fixedColumns, ...columns].filter((column) => filterIsActive(deferredFilters[column.key], column.numeric)), [columns, deferredFilters, fixedColumns]);
  const filteredPlayers = useMemo(() => players.filter((player) => activeFilterColumns.every((column) => valueMatches(column.value(player), deferredFilters[column.key] ?? emptyFilter, column.numeric))), [activeFilterColumns, deferredFilters, players]);
  const displayedPlayers = useMemo(() => {
    if (!clientSort) return filteredPlayers;
    const sortColumn = [...fixedColumns, ...columns].find((column) => column.key === clientSort.key);
    if (!sortColumn) return filteredPlayers;
    return [...filteredPlayers].sort((left, right) => compareColumnValues(sortColumn.value(left), sortColumn.value(right), clientSort.direction));
  }, [clientSort, columns, filteredPlayers, fixedColumns]);
  const [xRanks, fpRanks, altRanks] = useMemo(() => [
    computeRanks(displayedPlayers.map((player) => player.fantasyScore)),
    computeRanks(displayedPlayers.map((player) => player.scoringScore ?? null)),
    computeRanks(displayedPlayers.map((player) => player.alternativeScore ?? null))
  ], [displayedPlayers]);
  const tableWidth = [...fixedColumns, ...visibleColumns].reduce((total, column) => total + widthFor(column), 0) + (showStarterStatus ? 76 : 0);

  function widthFor(column: Column) {
    return Math.min(640, Math.max(44, widths[column.key] ?? column.width));
  }

  function updateFilter(key: string, next: ValueFilter) {
    setFilters((current) => ({ ...current, [key]: next }));
  }

  async function saveFilterPreset() {
    const name = presetName.trim();
    if (!name) return;
    setPresetPending(true);
    const presets = await savePlayerTableFilterPreset(name, filters);
    if (presets) {
      setFilterPresets(presets);
      setPresetName("");
    }
    setPresetPending(false);
  }

  async function deleteFilterPreset(id: string) {
    setPresetPending(true);
    const presets = await deletePlayerTableFilterPreset(id);
    if (presets) setFilterPresets(presets);
    setPresetPending(false);
  }

  function startResize(event: ReactPointerEvent<HTMLElement>, column: Column) {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const startX = event.clientX;
    const startWidth = widthFor(column);
    const startTableWidth = tableWidth;
    let latestWidth = startWidth;
    const oldCursor = document.body.style.cursor;
    const oldSelection = document.body.style.userSelect;
    setDocumentResizeState("col-resize", "none");
    const move = (pointerEvent: PointerEvent) => {
      latestWidth = Math.min(640, Math.max(44, Math.round(startWidth + pointerEvent.clientX - startX)));
      const table = tableContainerRef.current?.querySelector<HTMLTableElement>("table");
      const col = table?.querySelector<HTMLTableColElement>(`col[data-column-key="${CSS.escape(column.key)}"]`);
      if (col) col.style.width = `${latestWidth}px`;
      if (table) {
        table.style.width = `${startTableWidth + latestWidth - startWidth}px`;
        table.style.minWidth = table.style.width;
      }
    };
    const finish = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", finish);
      setDocumentResizeState(oldCursor, oldSelection);
      if (latestWidth !== startWidth) setWidths((current) => ({ ...current, [column.key]: latestWidth }));
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", finish);
    window.addEventListener("pointercancel", finish);
  }

  async function exportTable() {
    setExportError(null);
    setExporting(true);
    try {
      const exportColumns = [...fixedColumns, ...visibleColumns];
      const response = await fetch("/api/machete/players/export-table", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          language,
          columns: exportColumns.map(({ key, label }) => ({ key, header: label })),
          rows: displayedPlayers.map((player) => Object.fromEntries(exportColumns.map((column) => [column.key, column.value(player)])))
        })
      });
      if (!response.ok) throw new Error("EXPORT_FAILED");
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = downloadFilename(response.headers.get("content-disposition"));
      anchor.click();
      URL.revokeObjectURL(url);
    } catch {
      setExportError(localizedText(language, "Could not export the table. Please try again.", "Не удалось выгрузить таблицу. Попробуйте ещё раз."));
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="min-w-0">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded border border-slate-200 bg-slate-50 p-2">
        <p className="text-xs text-slate-600"><I18nText en={`${filteredPlayers.length} of ${players.length} players`} ru={`${filteredPlayers.length} из ${players.length} игроков`} /></p>
        <div className="flex flex-wrap items-center gap-2">
          <label className="inline-flex items-center gap-2 whitespace-nowrap rounded border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700">
            <I18nText en="Forecast" ru="Прогноз" />
            <select value={horizon} onChange={(event) => setHorizon(Number(event.target.value) as 3 | 5 | 10)} className="bg-transparent font-bold text-ink outline-none" aria-label={localizedText(language, "Forecast horizon", "Горизонт прогноза")}>
              <option value={3}>{localizedText(language, "3 rounds", "3 тура")}</option>
              <option value={5}>{localizedText(language, "5 rounds", "5 туров")}</option>
              <option value={10}>{localizedText(language, "10 rounds", "10 туров")}</option>
            </select>
          </label>
          <details className="relative">
            <summary className="inline-flex cursor-pointer list-none items-center gap-2 whitespace-nowrap rounded border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 [&::-webkit-details-marker]:hidden"><SlidersHorizontal className="h-4 w-4" /><I18nText en="Advanced filters" ru="Расширенные фильтры" />{activeFilterColumns.length ? ` · ${activeFilterColumns.length}` : ""}</summary>
            <div className="absolute right-0 z-30 mt-2 w-[min(52rem,calc(100vw-2rem))] rounded border border-slate-200 bg-white p-3 shadow-elev">
              <div className="mb-2 flex items-center justify-between"><p className="text-sm font-bold text-ink"><I18nText en="Filter every field" ru="Фильтры по каждому полю" /></p><button type="button" onClick={() => setFilters({})} className="text-xs font-semibold text-rose-700"><I18nText en="Reset" ru="Сбросить" /></button></div>
              <div className="mb-3 rounded border border-slate-200 bg-slate-50 p-2">
                <div className="flex flex-wrap items-center gap-2">
                  <input value={presetName} onChange={(event) => setPresetName(event.target.value)} maxLength={80} placeholder={localizedText(language, "Preset name", "Название пресета")} className="min-w-[12rem] flex-1 rounded border border-slate-200 bg-white px-2 py-1.5 text-xs" />
                  <button type="button" onClick={() => void saveFilterPreset()} disabled={presetPending || !presetName.trim()} className="inline-flex items-center gap-1 rounded border border-emerald-200 bg-white px-2 py-1.5 text-xs font-semibold text-emerald-800 disabled:opacity-50"><Save className="h-3.5 w-3.5" /><I18nText en="Save preset" ru="Сохранить пресет" /></button>
                </div>
                {filterPresets.length > 0 ? <div className="mt-2 flex flex-wrap gap-1.5">{filterPresets.map((preset) => <span key={preset.id} className="inline-flex items-center rounded border border-slate-200 bg-white"><button type="button" disabled={presetPending} onClick={() => setFilters(preset.filters.filters)} className="max-w-[14rem] truncate px-2 py-1 text-xs font-semibold text-slate-700 disabled:opacity-50" title={preset.name}>{preset.name}</button><button type="button" disabled={presetPending} onClick={() => void deleteFilterPreset(preset.id)} className="border-l border-slate-200 p-1 text-rose-700 disabled:opacity-50" aria-label={localizedText(language, `Delete ${preset.name}`, `Удалить ${preset.name}`)}><Trash2 className="h-3.5 w-3.5" /></button></span>)}</div> : <p className="mt-2 text-[11px] text-slate-500"><I18nText en="No personal presets yet." ru="Личных пресетов пока нет." /></p>}
              </div>
              <div className="grid max-h-[60vh] grid-cols-1 gap-2 overflow-y-auto sm:grid-cols-2 lg:grid-cols-3">
                {[...fixedColumns, ...columns].map((column) => {
                  const filter = filters[column.key] ?? emptyFilter;
                  return <fieldset key={column.key} className="rounded border border-slate-200 p-2" title={column.title}><legend className="px-1 text-xs font-semibold text-slate-700">{column.label}</legend>{column.numeric ? <div className="grid grid-cols-2 gap-2"><input inputMode="decimal" value={filter.min} onChange={(event) => updateFilter(column.key, { ...filter, min: event.target.value })} placeholder={localizedText(language, "Min", "От")} className="min-w-0 rounded border border-slate-200 px-2 py-1.5 text-xs" /><input inputMode="decimal" value={filter.max} onChange={(event) => updateFilter(column.key, { ...filter, max: event.target.value })} placeholder={localizedText(language, "Max", "До")} className="min-w-0 rounded border border-slate-200 px-2 py-1.5 text-xs" /></div> : <input value={filter.query} onChange={(event) => updateFilter(column.key, { ...filter, query: event.target.value })} placeholder={localizedText(language, "Contains…", "Содержит…")} className="w-full rounded border border-slate-200 px-2 py-1.5 text-xs" />}</fieldset>;
                })}
              </div>
            </div>
          </details>
          <details className="group relative">
            <summary className="inline-flex cursor-pointer list-none items-center gap-2 whitespace-nowrap rounded border border-sky-300 bg-sky-50 px-3 py-2 text-xs font-bold text-sky-800 shadow-sm hover:bg-sky-100 group-open:border-sky-400 group-open:bg-sky-100 [&::-webkit-details-marker]:hidden"><Columns3 className="h-4 w-4" /><I18nText en="Columns" ru="Столбцы" /> · {visibleColumns.length}</summary>
            <div className="absolute right-0 z-30 mt-2 w-[min(38rem,calc(100vw-2rem))] rounded border border-slate-200 bg-white p-3 shadow-elev">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs text-slate-500"><I18nText en="Player, team, position and price stay fixed. Other columns can be selected and reordered." ru="Игрок, клуб, позиция и цена закреплены. Остальные столбцы можно выбирать и переставлять." /></p>
                <div className="flex shrink-0 gap-1.5">
                  <button type="button" onClick={() => setVisibleKeys(columns.map((column) => column.key))} disabled={visibleKeys.length === columns.length} className="rounded border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40"><I18nText en="Select all" ru="Выбрать все" /></button>
                  <button type="button" onClick={() => setVisibleKeys(defaultColumns.filter((key) => columnsByKey.has(key)))} className="rounded border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"><I18nText en="Reset" ru="Сбросить" /></button>
                </div>
              </div>
              <div className="mb-3 flex flex-wrap gap-1">{visibleColumns.map((column, index) => <span key={column.key} className="inline-flex items-center rounded border border-slate-200"><button type="button" disabled={index === 0} onClick={() => setVisibleKeys((current) => moveKey(current, column.key, -1))} className="p-1 disabled:opacity-30"><ArrowLeft className="h-3 w-3" /></button><span className="px-1 text-xs font-semibold">{column.label}</span><button type="button" disabled={index === visibleColumns.length - 1} onClick={() => setVisibleKeys((current) => moveKey(current, column.key, 1))} className="p-1 disabled:opacity-30"><ArrowRight className="h-3 w-3" /></button></span>)}</div>
              <div className="grid max-h-[50vh] grid-cols-1 gap-1 overflow-y-auto sm:grid-cols-2">{columns.map((column) => <label key={column.key} className="flex items-start gap-2 rounded px-2 py-1.5 text-xs hover:bg-slate-50" title={column.title}><input type="checkbox" checked={visibleKeys.includes(column.key)} onChange={() => setVisibleKeys((current) => current.includes(column.key) ? current.filter((key) => key !== column.key) : [...current, column.key])} /><span>{column.label}</span></label>)}</div>
            </div>
          </details>
          <button type="button" onClick={() => void exportTable()} disabled={exporting || filteredPlayers.length === 0} className="inline-flex items-center gap-2 whitespace-nowrap rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800 disabled:opacity-50"><Download className="h-4 w-4" />{exporting ? <I18nText en="Exporting…" ru="Выгрузка…" /> : <I18nText en="Export table" ru="Выгрузить таблицу" />}</button>
        </div>
      </div>

      {exportError ? <p role="alert" className="mb-3 rounded border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{exportError}</p> : null}

      {compactViewport !== false ? <div className="space-y-2 md:hidden [@media(pointer:coarse)]:!block">{displayedPlayers.map((player) => <article key={player.id} className="rounded border border-slate-200 bg-white p-3"><div className="flex items-start justify-between gap-2"><PlayerNameCell player={player} /><span className="rounded bg-slate-100 px-2 py-1 text-xs font-bold">{player.position ?? "—"}</span></div><div className="mt-1 flex items-center justify-between gap-3 text-xs text-slate-500"><span className="min-w-0 truncate">{machetePlayerTeamDisplayName(player) ?? "—"}</span><span className="shrink-0 font-semibold text-ink"><I18nText en="Price" ru="Цена" />: {displayValue(player.price ?? null)}</span></div>{showStarterStatus ? <div className="mt-2"><StarterCell player={player} controls={starterControls} language={language} /></div> : null}<div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">{visibleColumns.map((column) => <dl key={column.key} className={cn("min-w-0 rounded bg-slate-50 p-2", column.key === "fixtures" && "col-span-2 sm:col-span-3")} title={column.title}><dt className="truncate text-[10px] font-semibold uppercase text-slate-500">{column.label}</dt><dd className="mt-1 min-w-0 text-sm font-bold num-tabular">{column.key === "fixtures" ? (playerFixtureChips(player, horizon).length > 0 ? <FdrRow fixtures={playerFixtureChips(player, horizon)} /> : "—") : displayValue(column.value(player))}</dd></dl>)}</div></article>)}</div> : null}

      {compactViewport !== true ? <div className="hidden overflow-hidden rounded border border-slate-200 bg-white md:block [@media(pointer:coarse)]:!hidden"><div ref={tableContainerRef} className="max-h-[720px] overflow-auto [scrollbar-gutter:stable]"><SortableTable sortRefreshKey={`${visibleKeys.join(",")}:${clientSort?.key ?? ""}:${clientSort?.direction ?? ""}`} className="player-pool-sortable table-fixed divide-y divide-slate-200 text-xs" style={{ width: tableWidth, minWidth: tableWidth }}><colgroup>{fixedColumns.map((column) => <col key={column.key} data-column-key={column.key} style={{ width: widthFor(column) }} />)}{showStarterStatus ? <col style={{ width: 76 }} /> : null}{visibleColumns.map((column) => <col key={column.key} data-column-key={column.key} style={{ width: widthFor(column) }} />)}</colgroup><thead className="sticky top-0 z-10 bg-slate-50 text-left text-[10px] font-semibold uppercase text-slate-500"><tr>{fixedColumns.map((column) => <ResizableHeader key={column.key} column={column} width={widthFor(column)} onResize={startResize} language={language} />)}{showStarterStatus ? <th className="relative px-2 py-2" data-sort-key="isStarter" title={localizedText(language, "Manual starting XI status.", "Ручной статус игрока в стартовом составе.")}><I18nText en="Start" ru="Старт" /></th> : null}{visibleColumns.map((column) => <ResizableHeader key={column.key} column={column} width={widthFor(column)} onResize={startResize} language={language} />)}</tr></thead><tbody className="divide-y divide-slate-100">{displayedPlayers.map((player, index) => <tr key={player.id} className="hover:bg-slate-50">{fixedColumns.map((column) => <FixedCell key={column.key} column={column} player={player} />)}{showStarterStatus ? <td className="px-2 py-2"><StarterCell player={player} controls={starterControls} language={language} /></td> : null}{visibleColumns.map((column) => <MetricCell key={column.key} column={column} player={player} rank={column.key === "fantasyScore" ? xRanks[index] : column.key === "scoringScore" ? fpRanks[index] : column.key === "alternativeScore" ? altRanks[index] : undefined} horizon={horizon} />)}</tr>)}{displayedPlayers.length === 0 ? <tr><td colSpan={fixedColumns.length + visibleColumns.length + (showStarterStatus ? 1 : 0)} className="px-4 py-10 text-center text-slate-500"><I18nText en="No players match the selected filters." ru="Нет игроков под выбранные фильтры." /></td></tr> : null}</tbody></SortableTable></div></div> : null}
    </div>
  );
}

function ResizableHeader({ column, width, onResize, language }: { column: Column; width: number; onResize: (event: ReactPointerEvent<HTMLElement>, column: Column) => void; language: "en" | "ru" }) {
  return <th data-sort-key={column.key} className={cn("relative overflow-hidden px-2 py-2 whitespace-nowrap", column.numeric && "text-right")} title={column.title} style={{ width }}><span className="block truncate pr-3">{column.label}</span><button type="button" data-column-resize-handle="true" aria-label={localizedText(language, `Resize ${column.label}`, `Изменить ширину столбца «${column.label}»`)} onPointerDown={(event) => onResize(event, column)} className="absolute inset-y-0 right-0 w-2 cursor-col-resize border-r border-transparent hover:border-emerald-400" /></th>;
}

function FixedCell({ column, player }: { column: Column; player: MachetePlayerRow }) {
  if (column.key === "player") return <td className="overflow-hidden px-2 py-2 font-medium text-ink" title={column.title}><PlayerNameCell player={player} /></td>;
  return <td className="overflow-hidden px-2 py-2 text-slate-600" title={`${column.title}\n${displayValue(column.value(player))}`}><span className="block truncate">{displayValue(column.value(player))}</span></td>;
}

function MetricCell({ column, player, rank, horizon }: { column: Column; player: MachetePlayerRow; rank?: number | null; horizon: number }) {
  const value = column.value(player);
  const title = `${column.title}\n${column.label}: ${displayValue(value)}`;
  if (column.key === "fixtures") {
    const fixtures = playerFixtureChips(player, horizon);
    return <td className="px-2 py-1" title={column.title}>{fixtures.length > 0 ? <FdrRow fixtures={fixtures} className="min-w-0 gap-0.5" /> : <span className="text-slate-400">—</span>}</td>;
  }
  if (column.key === "form") return <td className="px-2 py-2 text-center" title={title}><SparkLine values={player.recentFp ?? []} width={64} height={20} /></td>;
  if (column.key === "fantasyScore") return <td className="px-1 py-1 text-right" title={title}><ScoreHeatCell value={numberOrNull(value)} rank={rank ?? null} tone="emerald" /></td>;
  if (column.key === "scoringScore") return <td className="px-1 py-1 text-right" title={title}><ScoreHeatCell value={numberOrNull(value)} rank={rank ?? null} tone="sky" /></td>;
  if (column.key === "alternativeScore") return <td className="px-1 py-1 text-right" title={title}><ScoreHeatCell value={numberOrNull(value)} rank={rank ?? null} tone="amber" /></td>;
  return <td className={cn("overflow-hidden px-2 py-2 text-slate-600", column.numeric && "text-right num-tabular")} title={title}><span className="block truncate">{displayValue(value)}</span></td>;
}

function playerNextForecast(player: MachetePlayerRow) {
  if (!player.roundPoints || player.roundPoints.length === 0) return player.predictedFp ?? null;
  return nextFantasyPoints({ predictedFp: player.predictedFp ?? null, roundPoints: player.roundPoints });
}

function playerForecastHorizon(player: MachetePlayerRow, horizon: number) {
  if (!player.roundPoints || player.roundPoints.length < horizon) return null;
  return playerHorizonPoints({ roundPoints: player.roundPoints }, horizon);
}

function playerNextAlternativeForecast(player: MachetePlayerRow) {
  return nextAlternativeFantasyPoints({
    alternativePredictedFp: player.alternativePredictedFp ?? null,
    alternativeRoundPoints: player.alternativeRoundPoints ?? undefined
  });
}

function playerAlternativeForecastHorizon(player: MachetePlayerRow, horizon: number) {
  if (!player.alternativeRoundPoints || player.alternativeRoundPoints.length === 0) return null;
  return playerAlternativeHorizonPoints({
    alternativePredictedFp: player.alternativePredictedFp ?? null,
    alternativeRoundPoints: player.alternativeRoundPoints
  }, horizon);
}

function playerFixtureChips(player: MachetePlayerRow, horizon: number) {
  return fixtureChipPresentations(
    player.fixtures ?? [],
    player.fixtureDifficulties ?? [],
    horizon,
    player.fixtureFullNames
  );
}

function playerFixtureExportValue(player: MachetePlayerRow, horizon: number) {
  const fixtures = playerFixtureChips(player, horizon);
  return fixtures.length > 0 ? fixtures.map((fixture) => fixture.title ?? fixture.label).join(" | ") : null;
}

function macheteColumns(players: MachetePlayerRow[], language: "en" | "ru", horizon: 3 | 5 | 10): Column[] {
  const column = (key: string, en: string, ru: string, titleEn: string, titleRu: string, width: number, numeric: boolean, value: Column["value"]): Column => ({ key, label: localizedText(language, en, ru), title: localizedText(language, titleEn, titleRu), width, numeric, value });
  const base = [
    column("predictedFp", "FP 1R", "ФО 1Т", "Machete fantasy-points forecast for the next round. It uses the same projection as the squad planner, including expected minutes and the next opponent.", "Прогноз фэнтези-очков Machete на следующий тур. Используется тот же расчёт, что в подборе состава: с ожидаемыми минутами и следующим соперником.", 76, true, playerNextForecast),
    column("forecastHorizonFp", `FP ${horizon}R`, `ФО ${horizon}Т`, `Sum of the Machete round forecasts for the next ${horizon} rounds. Double rounds are already combined inside their round.`, `Сумма прогнозов Machete на следующие ${horizon} туров. Матчи двойного тура уже объединены внутри соответствующего тура.`, 82, true, (p) => playerForecastHorizon(p, horizon)),
    column("alternativePredictedFp", "Alt 1R", "Альт 1Т", "Alternative-formula fantasy-points forecast for the next round, using the same future fixture and expected-minutes data as the squad planner.", "Прогноз фэнтези-очков по альтернативной формуле на следующий тур: с тем же будущим соперником и ожидаемыми минутами, что в подборе состава.", 78, true, playerNextAlternativeForecast),
    column("alternativeForecastHorizon", `Alt ${horizon}R`, `Альт ${horizon}Т`, `Sum of the alternative-formula forecasts for the next ${horizon} rounds. Missing projections remain empty rather than becoming zero.`, `Сумма прогнозов по альтернативной формуле на следующие ${horizon} туров. Отсутствующий прогноз остаётся пустым и не превращается в ноль.`, 86, true, (p) => playerAlternativeForecastHorizon(p, horizon)),
    column("fixtures", `Opp ${horizon}R`, `Соп. ${horizon}Т`, `Upcoming opponents for the next ${horizon} rounds. H means home, A means away; colour shows fixture difficulty.`, `Соперники на следующие ${horizon} туров. H — дома, A — в гостях; цвет показывает сложность матча.`, 320, false, (p) => playerFixtureExportValue(p, horizon)),
    column("fantasyScore", "xFP", "xFP", "Machete expected fantasy points for the selected statistics window.", "Ожидаемые фэнтези-очки Machete по выбранному окну статистики.", 76, true, (p) => p.fantasyScore),
    column("scoringScore", "FP", "ФО", "Fantasy points recalculated from actual events in the selected window.", "Фэнтези-очки, пересчитанные по фактическим событиям выбранного окна.", 72, true, (p) => p.scoringScore ?? null),
    column("alternativeScore", "Alt", "Альт", "Alternative scoring formula result for the selected window.", "Результат альтернативной формулы по выбранному окну.", 72, true, (p) => p.alternativeScore ?? null),
    column("expectedMinutes", "Exp min", "Ож. мин", "Expected minutes in the next match; playing-time probabilities are included.", "Ожидаемые минуты в следующем матче с учётом вероятностей игрового времени.", 88, true, (p) => p.expectedMinutes ?? null),
    column("startProbability", "Start %", "Старт %", "Estimated probability of appearing in the starting XI.", "Оценочная вероятность выхода в стартовом составе.", 82, true, (p) => percentage(p.startProbability)),
    column("forecastConfidence", "Confidence %", "Увер. %", "Heuristic forecast confidence: data completeness, sample size and playing-time stability, not a probability of points.", "Эвристика уверенности прогноза: полнота данных, размер выборки и стабильность игрового времени; это не вероятность набрать очки.", 102, true, (p) => percentage(p.forecastConfidence)),
    column("minutesDeviation", "Min dev", "Откл. мин", "Variation of recent playing time; a larger value means less stable minutes.", "Разброс недавнего игрового времени: большее значение означает менее стабильные минуты.", 84, true, (p) => p.minutesDeviation ?? null),
    column("matchesPlayed", "Apps", "Матчи", "Matches with parsed player statistics in the selected window.", "Матчи с разобранной статистикой игрока в выбранном окне.", 72, true, (p) => p.matchesPlayed),
    column("minutesPlayed", "Minutes", "Минуты", "Total minutes in the selected statistics window.", "Суммарные минуты в выбранном окне статистики.", 78, true, (p) => p.minutesPlayed),
    column("goals", "Goals", "Голы", "Goals in the selected statistics window.", "Голы в выбранном окне статистики.", 68, true, (p) => p.goals),
    column("assists", "Assists", "Ассисты", "Assists in the selected statistics window.", "Голевые передачи в выбранном окне статистики.", 72, true, (p) => p.assists),
    column("shotsOnTarget", "SOT", "Уд. в створ", "Shots on target in the selected statistics window.", "Удары в створ в выбранном окне статистики.", 86, true, (p) => p.shotsOnTarget),
    column("keyPasses", "Key passes", "Ключ. пасы", "Key passes in the selected statistics window.", "Ключевые передачи в выбранном окне статистики.", 92, true, (p) => p.keyPasses),
    column("tackles", "Tackles", "Отборы", "Successful tackles in the selected statistics window.", "Успешные отборы в выбранном окне статистики.", 78, true, (p) => p.tackles),
    column("averageRating", "Rating", "Рейтинг", "Average FotMob match rating over matches where it is available.", "Средний рейтинг FotMob по матчам, где он доступен.", 78, true, (p) => p.averageRating),
    column("age", "Age", "Возраст", "Player age from the provider profile.", "Возраст игрока из профиля провайдера.", 64, true, (p) => p.age),
    column("nationality", "Nation", "Страна", "Player nationality from the provider profile.", "Национальность игрока из профиля провайдера.", 110, false, (p) => p.nationality),
    column("leagueName", "League", "Лига", "League used for this player-statistics row.", "Лига, к которой относится строка статистики игрока.", 130, false, (p) => p.leagueName ?? null),
    column("form", "Form", "Форма", "Recent match-by-match fantasy-points trend.", "Динамика фэнтези-очков по последним матчам.", 90, false, () => null)
  ];
  const representedMetricKeys = new Set(["player", "team", "position", "price", ...base.map((item) => normalizeMetricKey(item.key))]);
  const rawKeys = [...new Set(players.flatMap((player) => Object.keys(player.rawMetrics ?? {})))].sort();
  return [...base, ...rawKeys.filter((key) => !representedMetricKeys.has(normalizeMetricKey(key)) && players.some((player) => scalar(player.rawMetrics?.[key]) !== null)).map((key) => {
    const values = players.map((player) => player.rawMetrics?.[key]).filter((value) => value !== null && value !== undefined);
    const numeric = values.length === 0 || values.every((value) => typeof value === "number");
    const label = rawMetricLabel(key, language);
    return column(`raw:${key}`, label, label, `Imported provider metric: ${label}. Aggregated over the selected statistics window.`, `Импортированный показатель провайдера «${label}», агрегированный по выбранному окну статистики.`, 104, numeric, (player) => scalar(player.rawMetrics?.[key]));
  })];
}

function PlayerNameCell({ player }: { player: MachetePlayerRow }) {
  const comparePlayer = macheteComparePlayer(player);
  const data: PlayerHoverCardData = { name: player.name, position: player.position, teamName: player.teamName, teamShortName: player.teamShortName, nationality: player.nationality, age: player.age, matchesPlayed: player.matchesPlayed, minutesPlayed: player.minutesPlayed, goals: player.goals, assists: player.assists, averageRating: player.averageRating, xFp: player.fantasyScore, actualFp: player.scoringScore ?? null, altFp: player.alternativeScore ?? null };
  return <div className="flex min-w-0 items-center gap-1.5"><PlayerComparePickButton player={comparePlayer} /><PlayerWatchlistButton source="machete" player={macheteWatchlistPlayer(player)} /><PlayerCompareDraggable player={comparePlayer} className="min-w-0 flex-1"><PlayerHoverCard player={data} trigger={<span className="block min-w-0 cursor-help"><span className="block truncate border-b border-dashed border-slate-300" title={player.name}>{compactPlayerDisplayName(player.name)}</span>{player.expectedMinutes != null ? <span className="mt-0.5 block truncate text-[10px] font-normal text-slate-500">{Math.round(player.expectedMinutes)} <I18nText en="min" ru="мин" />{player.forecastConfidence != null ? ` · ${Math.round(player.forecastConfidence * 100)}%` : ""}</span> : null}</span>} /></PlayerCompareDraggable></div>;
}

export function machetePlayerTeamDisplayName(player: Pick<MachetePlayerRow, "teamName" | "teamShortName">) { return compactTeamDisplayName({ name: player.teamName, shortName: player.teamShortName }); }
function macheteWatchlistPlayer(player: MachetePlayerRow) { return { id: player.id, name: player.name, position: player.position, teamName: player.teamName, teamShortName: player.teamShortName }; }
function macheteComparePlayer(player: MachetePlayerRow): ComparePlayer { return { id: player.id, name: player.name, position: player.position, teamName: player.teamName, teamShortName: player.teamShortName }; }

function StarterCell({ player, controls, language }: { player: MachetePlayerRow; controls?: { leagueId: string; season: string; teamId: string; canEdit?: boolean; roster: Array<{ position: string | null; isStarter: boolean }> }; language: "en" | "ru" }) {
  const identity = machetePlayerRowIdentity(player.id);
  if (controls?.canEdit && identity) {
    const message = starterLimitMessage(startingXiSelectionBlockReason(controls.roster, player));
    return <MacheteStarterCheckbox leagueId={identity.leagueId} season={identity.season} teamId={identity.teamId} playerId={identity.playerId} defaultChecked={Boolean(player.isStarter)} label={localizedText(language, `In starting XI: ${player.name}`, `В старте: ${player.name}`)} disabledReasonEn={message?.en} disabledReasonRu={message?.ru} />;
  }
  return <span className={cn("inline-flex rounded border px-2 py-0.5 text-[10px] font-semibold", player.isStarter ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-slate-200 bg-slate-50 text-slate-500")}><I18nText en={player.isStarter ? "Start" : "Bench"} ru={player.isStarter ? "Старт" : "Запас"} /></span>;
}

function starterLimitMessage(code: StartingXiLimitCode | null) {
  if (code === "STARTING_XI_GOALKEEPER_LIMIT") return { en: "The starting XI already has a goalkeeper.", ru: "В старте уже есть вратарь." };
  if (code === "STARTING_XI_OUTFIELD_LIMIT") return { en: "The starting XI already has 10 outfield players.", ru: "В старте уже 10 полевых игроков." };
  if (code) return { en: "The starting XI already has 11 players.", ru: "В старте уже 11 игроков." };
  return null;
}

function machetePlayerRowIdentity(rowId: string) { if (rowId.startsWith("combined:")) return null; const [leagueId, season, teamId, playerId] = rowId.split(":"); return leagueId && season && teamId && playerId ? { leagueId, season, teamId, playerId } : null; }
function percentage(value: number | null | undefined) { return value == null ? null : Math.round(value * 1000) / 10; }
function numberOrNull(value: string | number | null) { return typeof value === "number" ? value : null; }
function scalar(value: unknown): string | number | null { return typeof value === "number" && Number.isFinite(value) ? value : typeof value === "string" ? value : null; }
function displayValue(value: string | number | null) { return value == null || value === "" ? "—" : typeof value === "number" ? formatNumber(value, Number.isInteger(value) ? 0 : 2) : value; }
function filterIsActive(filter: ValueFilter | undefined, numeric: boolean) { if (!filter) return false; return numeric ? Boolean(filter.min.trim() || filter.max.trim()) : Boolean(filter.query.trim()); }
function valueMatches(value: string | number | null, filter: ValueFilter, numeric: boolean) { if (!filterIsActive(filter, numeric)) return true; if (numeric) { if (typeof value !== "number") return false; const min = Number(filter.min.replace(",", ".")); const max = Number(filter.max.replace(",", ".")); return (!filter.min.trim() || value >= min) && (!filter.max.trim() || value <= max); } return String(value ?? "").toLocaleLowerCase().includes(filter.query.trim().toLocaleLowerCase()); }
function compareColumnValues(left: string | number | null, right: string | number | null, direction: "asc" | "desc") {
  const emptyDifference = Number(left == null || left === "") - Number(right == null || right === "");
  if (emptyDifference !== 0) return emptyDifference;
  const difference = typeof left === "number" && typeof right === "number"
    ? left - right
    : String(left ?? "").localeCompare(String(right ?? ""), undefined, { numeric: true, sensitivity: "base" });
  return direction === "asc" ? difference : -difference;
}
function moveKey(keys: string[], key: string, direction: -1 | 1) { const index = keys.indexOf(key); const target = index + direction; if (index < 0 || target < 0 || target >= keys.length) return keys; const next = [...keys]; [next[index], next[target]] = [next[target], next[index]]; return next; }
function normalizeMetricKey(key: string) { return key.replace(/[^a-z0-9]/gi, "").toLocaleLowerCase(); }
function rawMetricLabel(key: string, language: "en" | "ru") {
  const english = key.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
  if (language === "en") return english;
  const russianLabels: Record<string, string> = {
    appearances_60: "Матчи 60+ минут",
    full_matches: "Полные матчи",
    clean_sheets: "Сухие матчи",
    goals_conceded: "Пропущенные голы",
    yellow_cards: "Жёлтые карточки",
    red_cards: "Красные карточки",
    xg: "xG",
    xa: "xA",
    saves: "Сейвы",
    penalty_saves: "Сейвы пенальти",
    recoveries: "Возвраты мяча",
    penalties_conceded: "Привезённые пенальти",
    missed_penalties: "Незабитые пенальти",
    own_goals: "Автоголы",
    shots_against_per_90: "Удары против / 90",
    save_rate_percent: "% сейвов",
    goals_per_90: "Голы / 90",
    assists_per_90: "Ассисты / 90",
    recoveries_per_90: "Возвраты / 90",
    goals_conceded_per_90: "Пропущенные / 90",
    yellow_cards_per_90: "Жёлтые / 90",
    red_cards_per_90: "Красные / 90",
    fantasy_assists: "Фэнтези-ассисты"
  };
  return russianLabels[key] ?? english;
}
function downloadFilename(contentDisposition: string | null) { const match = contentDisposition?.match(/filename="?([^";]+)"?/i); return match?.[1] ?? "machete-players.xlsx"; }
function setDocumentResizeState(cursor: string, userSelect: string) { document.body.style.cursor = cursor; document.body.style.userSelect = userSelect; }

type PlayerTableSavedView = { id: string; name: string; updatedAt: string; filters: unknown };

async function loadPlayerTableSavedViews(source: string, signal?: AbortSignal): Promise<PlayerTableSavedView[] | null> {
  try {
    const response = await fetch(`/api/user/saved-views?${new URLSearchParams({ source })}`, { cache: "no-store", signal });
    if (!response.ok) return null;
    const payload = await response.json() as { views?: unknown };
    return Array.isArray(payload.views) ? payload.views.filter(isPlayerTableSavedView) : null;
  } catch (error) {
    return (error as Error).name === "AbortError" ? null : null;
  }
}

async function savePlayerTableSettings(settings: MachetePlayerTableSettings) {
  return savePlayerTableView(machetePlayerTableSettingsSource, "Table preferences", "machete-table:preferences", settings);
}

async function savePlayerTableFilterPreset(name: string, filters: Record<string, ValueFilter>) {
  const href = `machete-table-filter:${encodeURIComponent(name.toLocaleLowerCase())}`;
  const views = await savePlayerTableView(machetePlayerTableFiltersSource, name, href, { version: 1, filters });
  return filterPresetsFromViews(views);
}

async function deletePlayerTableFilterPreset(id: string) {
  try {
    const params = new URLSearchParams({ source: machetePlayerTableFiltersSource, id });
    const response = await fetch(`/api/user/saved-views?${params}`, { method: "DELETE" });
    if (!response.ok) return null;
    const payload = await response.json() as { views?: unknown };
    return filterPresetsFromViews(Array.isArray(payload.views) ? payload.views.filter(isPlayerTableSavedView) : null);
  } catch {
    return null;
  }
}

async function savePlayerTableView(source: string, name: string, href: string, filters: unknown): Promise<PlayerTableSavedView[] | null> {
  try {
    const response = await fetch("/api/user/saved-views", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ source, name: name.slice(0, 80), href, filters })
    });
    if (!response.ok) return null;
    const payload = await response.json() as { views?: unknown };
    return Array.isArray(payload.views) ? payload.views.filter(isPlayerTableSavedView) : null;
  } catch {
    return null;
  }
}

function filterPresetsFromViews(views: PlayerTableSavedView[] | null): FilterPreset[] {
  if (!views) return [];
  return views.flatMap((view) => {
    const filters = parseMachetePlayerFilterPresetValue(view.filters);
    return filters ? [{ id: view.id, name: view.name, updatedAt: view.updatedAt, filters }] : [];
  });
}

function isPlayerTableSavedView(value: unknown): value is PlayerTableSavedView {
  if (!value || typeof value !== "object") return false;
  const view = value as Partial<PlayerTableSavedView>;
  return typeof view.id === "string" && typeof view.name === "string" && typeof view.updatedAt === "string" && "filters" in view;
}
