"use client";
import { type UiLanguage, fantasyForecastTitle, minuteHistoryProvenanceLines, forecastEfficiencyTitle, foontasyForecastTitle, playerPrimaryNextForecastTitle, playerPrimaryHorizonForecastTitle, alternativePlayerForecastTitle, alternativePlayerHorizonForecastTitle, playerPoolColumnTitles, localizeForecastNote } from "./planner-explanations";

/** @spec spec://modules/machete/FEAT-001-global-ranking-strategy#contracts */
import { ColumnResizeHandle } from "./ColumnResizeHandle";
/** @spec spec://modules/machete/FEAT-004-rotation-risk#scenarios */
import { currentRotationRisk, rotationRiskDescription } from "@/machete/rotation-risk";
import { ArrowLeft, ArrowRight, Bookmark, Check, Columns3, Lock, Plus, Save, Search, SlidersHorizontal, Trash2 } from "lucide-react";
import { type PointerEvent as ReactPointerEvent, type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { I18nText } from "@/components/i18n-text";
import { localizedText } from "@/components/localized-option";
import { fixtureChipPresentations } from "@/components/machete/fantasy-squad-ui";
import { ProjectionFormulaHoverCard } from "@/components/machete/ProjectionFormulaHoverCard";
import { SortableTable, type SortDirection } from "@/components/sortable-table";
import { FdrRow } from "@/components/ui/fdr-pill";
import { compactPriceHeaderThreshold, responsivePriceHeaderLabel } from "@/components/machete/responsive-price-label";
import { formatAlternativeScore, formatNumber, formatScore } from "@/lib/format";
import { cn } from "@/lib/cn";
import { compactPlayerDisplayName } from "@/lib/players/display-name";
import { fantasyPlayerMatchesNameQuery } from "@/machete/player-identity";
import { compareFantasyPositions, isFantasyPositionSortKey } from "@/lib/players/fantasy-position-order";
import { nextAlternativeFantasyPoints, nextFantasyPoints, playerAlternativeHorizonPoints, playerHorizonPoints, type FantasyPlannerPlayer, type FantasyPositionGroup, type FantasySquadSelection } from "@/machete/squad_logic";
import { forecastPointsPerPrice } from "@/machete/fantasy-value-efficiency";
import type { SquadFilterPreset } from "@/machete/squad-filter-presets";
import { defaultSquadTableColumns, emptySquadTableValueFilter, moveSquadTableColumn, type SquadTableValueFilter } from "@/machete/squad-table-columns";

export type PlayerPoolTableProps = {
  players: FantasyPlannerPlayer[];
  horizon: number;
  language: UiLanguage;
  provider?: string;
  projectionDetailsSourceHref?: string;
  detailedFormulaTooltips: boolean;
  addBlockReason: (player: FantasyPlannerPlayer) => string | null;
  selectionsByPlayerId: Map<string, FantasySquadSelection>;
  onAdd: (player: FantasyPlannerPlayer) => void;
  onRemove: (playerId: string) => void;
  replacementSource?: FantasyPlannerPlayer | null;
};

export type PlayerPoolOptionalColumn = {
  key: string;
  label: string;
  title: string;
  numeric: boolean;
  width: number;
};

export type PlayerPoolAdvancedFilterColumn = Pick<PlayerPoolOptionalColumn, "key" | "label" | "title" | "numeric">;

export const playerPoolFixedColumnWidths = {
  player: 190,
  team: 110,
  position: 64,
  price: 72,
  action: 40
} as const;

export const minimumPlayerPoolColumnWidth = 40;

export const maximumPlayerPoolColumnWidth = 640;

export function PlayerPoolFilterPresets({ presets, selectedId, pending, language, onApply, onSave, onDelete }: {
  presets: SquadFilterPreset[];
  selectedId: string | null;
  pending: boolean;
  language: UiLanguage;
  onApply: (preset: SquadFilterPreset) => void;
  onSave: (name: string) => Promise<boolean>;
  onDelete: (id: string) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [saved, setSaved] = useState(false);

  async function handleSave() {
    const normalizedName = name.trim().slice(0, 60);
    if (!normalizedName) return;
    if (!await onSave(normalizedName)) return;
    setName("");
    setSaved(true);
    window.setTimeout(() => setSaved(false), 1200);
  }

  return (
    <details className="relative open:z-50">
      <summary className="inline-flex min-h-11 cursor-pointer list-none items-center gap-2 whitespace-nowrap rounded border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 [&::-webkit-details-marker]:hidden">
        <Bookmark className="h-4 w-4" />
        <I18nText en="Presets" ru="Пресеты" />
        {presets.length > 0 ? <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] leading-none text-slate-600">{presets.length}</span> : null}
      </summary>
      <div className="absolute right-0 z-40 mt-2 w-[min(24rem,calc(100vw-2rem))] rounded border border-slate-200 bg-white p-3 shadow-elev">
        <p className="text-sm font-bold text-ink"><I18nText en="Personal filter presets" ru="Личные пресеты фильтров" /></p>
        <p className="mt-1 text-xs text-slate-500">
          <I18nText en="Available in every tournament in your account." ru="Доступны во всех турнирах вашего аккаунта." />
        </p>
        <div className="mt-3 flex gap-2">
          <input
            value={name}
            maxLength={60}
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void handleSave(); } }}
            placeholder={localizedText(language, "Preset name", "Название пресета")}
            aria-label={localizedText(language, "Filter preset name", "Название пресета фильтров")}
            className="min-w-0 flex-1 rounded border border-slate-200 px-3 py-2 text-sm"
          />
          <button type="button" onClick={() => void handleSave()} disabled={pending || !name.trim()} className="ui-button ui-button-primary text-xs disabled:opacity-55">
            {saved ? <Check className="h-4 w-4" /> : <Save className="h-4 w-4" />}
            <I18nText en="Save" ru="Сохранить" />
          </button>
        </div>
        <div className="mt-3 max-h-64 space-y-1 overflow-y-auto">
          {presets.map((preset) => (
            <div key={preset.id} className={cn("flex items-center gap-2 rounded border px-2 py-1.5", selectedId === preset.id ? "border-sky-200 bg-sky-50" : "border-slate-100")}>
              <button type="button" onClick={() => onApply(preset)} disabled={pending} className="min-w-0 flex-1 truncate text-left text-sm font-semibold text-ink disabled:opacity-50">
                {preset.name}
              </button>
              <button type="button" onClick={() => void onDelete(preset.id)} disabled={pending} aria-label={localizedText(language, `Delete ${preset.name}`, `Удалить ${preset.name}`)} className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded text-rose-700 hover:bg-rose-50 disabled:opacity-50">
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
          {presets.length === 0 ? <p className="rounded bg-slate-50 px-3 py-3 text-center text-xs text-slate-500"><I18nText en="No presets yet." ru="Пресетов пока нет." /></p> : null}
        </div>
      </div>
    </details>
  );
}

export function PlayerPoolAdvancedFilterMenu({ columns, filters, activeCount, language, onChange, onReset }: {
  columns: PlayerPoolAdvancedFilterColumn[];
  filters: Record<string, SquadTableValueFilter>;
  activeCount: number;
  language: UiLanguage;
  onChange: (key: string, filter: SquadTableValueFilter) => void;
  onReset: () => void;
}) {
  return (
    <details className="relative open:z-50">
      <summary className="inline-flex min-h-11 cursor-pointer list-none items-center gap-2 whitespace-nowrap rounded border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 [&::-webkit-details-marker]:hidden">
        <SlidersHorizontal className="h-4 w-4" />
        <I18nText en="Advanced filters" ru="Расширенные фильтры" />
        {activeCount > 0 ? <span className="rounded-full bg-sky-700 px-1.5 py-0.5 text-[10px] leading-none text-white">{activeCount}</span> : null}
      </summary>
      <div className="absolute right-0 z-40 mt-2 w-[min(54rem,calc(100vw-2rem))] rounded border border-slate-200 bg-white p-4 shadow-elev">
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-3">
          <div>
            <p className="text-sm font-bold text-ink"><I18nText en="Filter every table field" ru="Фильтры по каждому полю таблицы" /></p>
            <p className="text-xs text-slate-500"><I18nText en="Numeric fields use a minimum/maximum range; text fields search by a contained fragment." ru="Для чисел задаётся диапазон от/до, для текста — содержащийся фрагмент." /></p>
          </div>
          <button type="button" onClick={onReset} disabled={activeCount === 0} className="shrink-0 rounded border border-slate-200 px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40"><I18nText en="Reset" ru="Сбросить" /></button>
        </div>
        <div className="mt-3 grid max-h-[60vh] grid-cols-1 gap-2 overflow-y-auto pr-1 sm:grid-cols-2 lg:grid-cols-3">
          {columns.map((column) => {
            const filter = filters[column.key] ?? emptySquadTableValueFilter;
            return (
              <fieldset key={column.key} className="min-w-0 rounded border border-slate-200 p-2" title={column.title}>
                <legend className="max-w-full truncate px-1 text-[11px] font-semibold text-slate-700">{column.label}</legend>
                {column.numeric ? (
                  <div className="grid grid-cols-2 gap-1.5">
                    <input type="number" inputMode="decimal" step="any" value={filter.minimum} onChange={(event) => onChange(column.key, { ...filter, minimum: event.target.value })} placeholder={localizedText(language, "Min", "От")} aria-label={`${column.label}: ${localizedText(language, "minimum", "от")}`} className="min-w-0 rounded border border-slate-200 px-2 py-1.5 text-xs" />
                    <input type="number" inputMode="decimal" step="any" value={filter.maximum} onChange={(event) => onChange(column.key, { ...filter, maximum: event.target.value })} placeholder={localizedText(language, "Max", "До")} aria-label={`${column.label}: ${localizedText(language, "maximum", "до")}`} className="min-w-0 rounded border border-slate-200 px-2 py-1.5 text-xs" />
                  </div>
                ) : (
                  <input type="text" value={filter.query} onChange={(event) => onChange(column.key, { ...filter, query: event.target.value })} placeholder={localizedText(language, "Contains…", "Содержит…")} aria-label={`${column.label}: ${localizedText(language, "contains", "содержит")}`} className="w-full min-w-0 rounded border border-slate-200 px-2 py-1.5 text-xs" />
                )}
              </fieldset>
            );
          })}
        </div>
      </div>
    </details>
  );
}

export function normalizedPlayerPoolNameQuery(value: string) {
  return value.trim().toLowerCase();
}

export function filterPlayerPoolByNameQuery(players: FantasyPlannerPlayer[], query: string) {
  const normalizedQuery = normalizedPlayerPoolNameQuery(query);
  if (!normalizedQuery) return players;
  return players.filter((player) => fantasyPlayerMatchesNameQuery(player.name, player.fotmobName, normalizedQuery));
}

export function PlayerPoolNameSearch({ language, value, onChange }: {
  language: UiLanguage;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="relative min-w-0">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={localizedText(language, "Name", "Имя")}
        aria-label={localizedText(language, "Search by player name", "Поиск по имени игрока")}
        className="min-h-12 w-full rounded border border-slate-200 py-2 pl-9 pr-3 text-xs [@media(pointer:coarse)]:text-base"
      />
    </label>
  );
}

export function CustomizablePlayerPoolTable({
  initialVisibleColumns,
  initialColumnWidths,
  onVisibleColumnsChange,
  toolbar,
  availableColumns,
  ...props
}: PlayerPoolTableProps & { availableColumns: PlayerPoolOptionalColumn[]; initialVisibleColumns: string[]; initialColumnWidths: Record<string, number>; onVisibleColumnsChange: (columns: string[]) => void; toolbar: ReactNode }) {
  const { players, horizon, language } = props;
  const columns = availableColumns;
  const [visibleColumnKeys, setVisibleColumnKeys] = useState(initialVisibleColumns);
  const [columnWidths, setColumnWidths] = useState(initialColumnWidths);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [compactViewport, setCompactViewport] = useState<boolean | null>(null);
  const [playerSort, setPlayerSort] = useState<{ key: string; direction: SortDirection } | null>(null);
  const preferencesMounted = useRef(false);
  const tableContainerRef = useRef<HTMLDivElement>(null);
  const columnsByKey = useMemo(() => new Map(columns.map((column) => [column.key, column])), [columns]);
  const visibleColumns = visibleColumnKeys
    .map((key) => columnsByKey.get(key))
    .filter((column): column is PlayerPoolOptionalColumn => Boolean(column));
  const fixedColumnTitles = playerPoolFixedColumnTitles(language, props.provider);
  const widthFor = (key: string, fallback: number) => columnWidths[key] ?? fallback;
  const tableWidth = widthFor("action", playerPoolFixedColumnWidths.action)
    + widthFor("player", playerPoolFixedColumnWidths.player)
    + widthFor("team", playerPoolFixedColumnWidths.team)
    + widthFor("position", playerPoolFixedColumnWidths.position)
    + widthFor("price", playerPoolFixedColumnWidths.price)
    + visibleColumns.reduce((total, column) => total + widthFor(column.key, column.width), 0);
  const sortedPlayers = sortPlayerPoolRows(players, playerSort, horizon);
  const playerOrderKey = sortedPlayers.map((player) => player.playerId).join(",");
  const desktopRows = useFixedVirtualRows(sortedPlayers, tableContainerRef, compactViewport === false, 44, 10, playerOrderKey);

  useEffect(() => {
    onVisibleColumnsChange(visibleColumnKeys);
  }, [onVisibleColumnsChange, visibleColumnKeys]);

  useEffect(() => {
    const media = window.matchMedia("(max-width: 1279px), (pointer: coarse)");
    const update = () => setCompactViewport(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    if (!preferencesMounted.current) {
      preferencesMounted.current = true;
      return;
    }
    setSaveState("saving");
    const controller = new AbortController();
    const timeout = window.setTimeout(() => {
      void fetch("/api/user/squad-table-columns", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ columns: visibleColumnKeys, widths: columnWidths }),
        signal: controller.signal
      }).then((response) => {
        if (!response.ok) throw new Error("COLUMN_PREFERENCES_SAVE_FAILED");
        setSaveState("saved");
      }).catch((error) => {
        if ((error as Error).name !== "AbortError") setSaveState("error");
      });
    }, 400);
    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [columnWidths, visibleColumnKeys]);

  function toggleColumn(key: string) {
    setVisibleColumnKeys((current) => current.includes(key) ? current.filter((item) => item !== key) : [...current, key]);
  }

  function moveVisibleColumn(key: string, direction: -1 | 1) {
    setVisibleColumnKeys((current) => moveSquadTableColumn(current, key, direction));
  }

  function startColumnResize(event: ReactPointerEvent<HTMLElement>, key: string, fallbackWidth: number) {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const startX = event.clientX;
    const startWidth = widthFor(key, fallbackWidth);
    const startTableWidth = tableWidth;
    let latestWidth = startWidth;
    const previousCursor = document.body.style.cursor;
    const previousSelection = document.body.style.userSelect;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    const move = (pointerEvent: PointerEvent) => {
      const nextWidth = Math.round(Math.min(maximumPlayerPoolColumnWidth, Math.max(minimumPlayerPoolColumnWidth, startWidth + pointerEvent.clientX - startX)));
      if (nextWidth === latestWidth) return;
      latestWidth = nextWidth;
      const escapedKey = CSS.escape(key);
      const table = tableContainerRef.current?.querySelector<HTMLTableElement>("table");
      const column = table?.querySelector<HTMLTableColElement>(`col[data-column-key="${escapedKey}"]`);
      const header = table?.querySelector<HTMLTableCellElement>(`th[data-column-key="${escapedKey}"]`);
      if (column) column.style.width = `${nextWidth}px`;
      if (header) header.style.width = `${nextWidth}px`;
      if (key === "price") {
        const priceLabel = header?.querySelector<HTMLElement>("[data-price-header-label]");
        if (priceLabel) priceLabel.textContent = nextWidth < compactPriceHeaderThreshold ? "$" : priceLabel.dataset.fullPriceLabel ?? "Price";
      }
      if (table) {
        const nextTableWidth = startTableWidth + nextWidth - startWidth;
        table.style.width = `${nextTableWidth}px`;
        table.style.minWidth = `${nextTableWidth}px`;
      }
    };
    const finish = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", finish);
      document.body.style.cursor = previousCursor;
      document.body.style.userSelect = previousSelection;
      if (latestWidth !== startWidth) {
        setColumnWidths((current) => current[key] === latestWidth ? current : { ...current, [key]: latestWidth });
      }
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", finish);
    window.addEventListener("pointercancel", finish);
  }

  function resetColumnWidth(key: string) {
    setColumnWidths((current) => {
      if (!(key in current)) return current;
      const next = { ...current };
      delete next[key];
      return next;
    });
  }

  return (
    <div className="contents">
      <div className="mb-3 flex min-w-0 flex-wrap items-start gap-2 xl:flex-nowrap">
        <div className="grid min-w-0 flex-[1_1_34rem] grid-cols-2 gap-2 lg:grid-cols-5">
          {toolbar}
        </div>
        <details className="relative shrink-0 open:z-50" onKeyDown={event => {
          if (event.key === "Escape") {
            event.currentTarget.open = false;
            event.currentTarget.querySelector("summary")?.focus();
          }
        }}>
          <summary className="inline-flex cursor-pointer list-none items-center gap-2 whitespace-nowrap rounded border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 [&::-webkit-details-marker]:hidden">
            <Columns3 className="h-4 w-4" />
            <I18nText en="Columns" ru="Столбцы" />
            <span className="text-slate-400">{visibleColumns.length}</span>
          </summary>
          <div className="fixed inset-x-4 top-16 z-50 max-h-[calc(100dvh-5rem)] overflow-y-auto rounded border border-slate-200 bg-white p-4 shadow-elev xl:absolute xl:inset-x-auto xl:right-0 xl:top-auto xl:mt-2 xl:max-h-[75vh] xl:w-[min(42rem,calc(100vw-2rem))]">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
              <div>
                <p className="text-sm font-bold text-ink"><I18nText en="Player table columns" ru="Столбцы таблицы игроков" /></p>
                <p className="text-xs text-slate-500"><I18nText en="Player, club, position, price, and the squad action are always the five leftmost columns." ru="Игрок, клуб, позиция, цена и кнопка состава — всегда первые пять столбцов слева." /></p>
                <p className="mt-1 text-[11px] text-slate-500"><I18nText en="Drag a header's right edge to change its width; double-click the edge to reset it." ru="Тяните правую границу заголовка, чтобы изменить ширину; двойной клик по границе сбрасывает её." /></p>
              </div>
              <span className={cn("text-xs font-semibold", saveState === "error" ? "text-rose-700" : "text-slate-500")}>
                {saveState === "saving" ? <I18nText en="Saving…" ru="Сохраняем…" /> : null}
                {saveState === "saved" ? <I18nText en="Saved" ru="Сохранено" /> : null}
                {saveState === "error" ? <I18nText en="Not saved" ru="Не сохранено" /> : null}
              </span>
              <button type="button" className="rounded border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50" onClick={event => {
                const details = event.currentTarget.closest("details");
                if (details) {
                  details.open = false;
                  details.querySelector("summary")?.focus();
                }
              }}><I18nText en="Close" ru="Закрыть" /></button>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" onClick={() => setVisibleColumnKeys(columns.map((column) => column.key))} className="rounded border border-slate-200 px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"><I18nText en="Select all" ru="Выбрать все" /></button>
              <button type="button" onClick={() => setVisibleColumnKeys([...defaultSquadTableColumns])} className="rounded border border-slate-200 px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"><I18nText en="Reset" ru="Сбросить" /></button>
              <button type="button" onClick={() => setColumnWidths({})} className="rounded border border-slate-200 px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"><I18nText en="Reset widths" ru="Сбросить ширину" /></button>
              <button type="button" onClick={() => setVisibleColumnKeys([])} className="rounded border border-slate-200 px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"><I18nText en="Hide optional" ru="Скрыть дополнительные" /></button>
            </div>
            {visibleColumns.length > 0 ? (
              <div className="mt-3 rounded border border-slate-200 bg-slate-50 p-3">
                <p className="text-xs font-semibold text-slate-700"><I18nText en="Visible column order" ru="Порядок видимых столбцов" /></p>
                <p className="mt-0.5 text-[11px] text-slate-500"><I18nText en="Move optional columns left or right. The first five columns stay fixed." ru="Перемещайте дополнительные столбцы влево или вправо. Первые пять столбцов закреплены." /></p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {visibleColumns.map((column, index) => (
                    <span key={column.key} className="inline-flex items-center overflow-hidden rounded border border-slate-200 bg-white text-xs text-slate-700 shadow-sm">
                      <button type="button" disabled={index === 0} onClick={() => moveVisibleColumn(column.key, -1)} className="inline-flex h-7 w-7 items-center justify-center border-r border-slate-200 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-30" aria-label={localizedText(language, `Move ${column.label} left`, `Переместить ${column.label} влево`)}><ArrowLeft className="h-3.5 w-3.5" /></button>
                      <span className="px-2 font-semibold">{column.label}</span>
                      <button type="button" disabled={index === visibleColumns.length - 1} onClick={() => moveVisibleColumn(column.key, 1)} className="inline-flex h-7 w-7 items-center justify-center border-l border-slate-200 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-30" aria-label={localizedText(language, `Move ${column.label} right`, `Переместить ${column.label} вправо`)}><ArrowRight className="h-3.5 w-3.5" /></button>
                    </span>
                  ))}
                </div>
              </div>
            ) : null}
            <div className="mt-3 grid max-h-[55vh] grid-cols-1 gap-1 overflow-y-auto pr-1 sm:grid-cols-2 lg:grid-cols-3">
              {columns.map((column) => (
                <label key={column.key} className="flex items-start gap-2 rounded px-2 py-1.5 text-xs text-slate-700 hover:bg-slate-50" title={column.title}>
                  <input type="checkbox" checked={visibleColumnKeys.includes(column.key)} onChange={() => toggleColumn(column.key)} className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300" />
                  <span>{column.label}</span>
                </label>
              ))}
            </div>
          </div>
        </details>
      </div>

      {compactViewport === null ? (
        <div className="col-span-full h-24 animate-pulse rounded border border-slate-200 bg-slate-50" aria-hidden="true" />
      ) : null}

      {compactViewport === true ? <div className="col-span-full">
        <PlayerPoolMobileList key={props.replacementSource?.playerId ?? "browse"} {...props} players={sortedPlayers} columns={visibleColumns} />
      </div> : null}

      {compactViewport === false ? <div className="col-span-full min-w-0 max-w-full overflow-hidden rounded border border-slate-200 bg-white" data-testid="player-pool-table">
        <div ref={tableContainerRef} className="relative max-h-[720px] w-full max-w-full overflow-auto [scrollbar-gutter:stable] 2xl:max-h-[min(78vh,880px)] 3xl:max-h-[min(84vh,1040px)]">
          <SortableTable
            sortRefreshKey={`${horizon}:${visibleColumnKeys.join(",")}`}
            managedClientSort
            clientSort={playerSort}
            onClientSortChange={setPlayerSort}
            className="player-pool-sortable table-fixed divide-y divide-slate-200 text-xs"
            style={{ minWidth: `${tableWidth}px`, width: `${tableWidth}px` }}
          >
            <colgroup>
              <col data-column-key="player" style={{ width: widthFor("player", playerPoolFixedColumnWidths.player) }} />
              <col data-column-key="team" style={{ width: widthFor("team", playerPoolFixedColumnWidths.team) }} />
              <col data-column-key="position" style={{ width: widthFor("position", playerPoolFixedColumnWidths.position) }} />
              <col data-column-key="price" style={{ width: widthFor("price", playerPoolFixedColumnWidths.price) }} />
              <col data-column-key="action" style={{ width: widthFor("action", playerPoolFixedColumnWidths.action) }} />
              {visibleColumns.map((column) => <col key={column.key} data-column-key={column.key} style={{ width: widthFor(column.key, column.width) }} />)}
            </colgroup>
            <thead className="sticky top-0 z-10 whitespace-nowrap bg-slate-50 text-left text-[10px] font-semibold uppercase text-slate-500">
              <tr>
                <th data-sort-key="player" data-sort-default-direction="asc" className="sticky left-0 z-20 overflow-hidden border-r border-slate-200 bg-slate-50 px-2 py-2" title={fixedColumnTitles.player} style={{ width: widthFor("player", playerPoolFixedColumnWidths.player) }}><PlayerPoolHeaderLabel label={localizedText(language, "Player", "Игрок")} /><ColumnResizeHandle label={localizedText(language, "player", "игрока")} language={language} width={widthFor("player", playerPoolFixedColumnWidths.player)} onWidthChange={(width) => setColumnWidths(current => ({ ...current, ["player"]: width }))} onPointerDown={(event) => startColumnResize(event, "player", playerPoolFixedColumnWidths.player)} onDoubleClick={() => resetColumnWidth("player")} /></th>
                <th data-sort-key="team" data-sort-default-direction="asc" className="relative overflow-hidden px-2 py-2" title={fixedColumnTitles.team} style={{ width: widthFor("team", playerPoolFixedColumnWidths.team) }}><PlayerPoolHeaderLabel label={localizedText(language, "Team", "Клуб")} /><ColumnResizeHandle label={localizedText(language, "team", "клуба")} language={language} width={widthFor("team", playerPoolFixedColumnWidths.team)} onWidthChange={(width) => setColumnWidths(current => ({ ...current, ["team"]: width }))} onPointerDown={(event) => startColumnResize(event, "team", playerPoolFixedColumnWidths.team)} onDoubleClick={() => resetColumnWidth("team")} /></th>
                <th data-sort-key="position" data-sort-default-direction="asc" className="relative overflow-hidden px-1 py-2" title={fixedColumnTitles.position} style={{ width: widthFor("position", playerPoolFixedColumnWidths.position) }}><PlayerPoolHeaderLabel label={localizedText(language, "Pos", "Поз.")} /><ColumnResizeHandle label={localizedText(language, "position", "позиции")} language={language} width={widthFor("position", playerPoolFixedColumnWidths.position)} onWidthChange={(width) => setColumnWidths(current => ({ ...current, ["position"]: width }))} onPointerDown={(event) => startColumnResize(event, "position", playerPoolFixedColumnWidths.position)} onDoubleClick={() => resetColumnWidth("position")} /></th>
                <th data-sort-key="price" data-sort-default-direction="desc" data-column-key="price" aria-label={localizedText(language, "Price", "Цена")} className="relative overflow-hidden px-1 py-2 text-right" title={fixedColumnTitles.price} style={{ width: widthFor("price", playerPoolFixedColumnWidths.price) }}><PlayerPoolHeaderLabel label={responsivePriceHeaderLabel(widthFor("price", playerPoolFixedColumnWidths.price), language)} numeric priceLabel fullLabel={localizedText(language, "Price", "Цена")} /><ColumnResizeHandle label={localizedText(language, "price", "цены")} language={language} width={widthFor("price", playerPoolFixedColumnWidths.price)} onWidthChange={(width) => setColumnWidths(current => ({ ...current, ["price"]: width }))} onPointerDown={(event) => startColumnResize(event, "price", playerPoolFixedColumnWidths.price)} onDoubleClick={() => resetColumnWidth("price")} /></th>
                <th data-sort-disabled="true" className="relative overflow-hidden px-1 py-2 text-center" style={{ width: widthFor("action", playerPoolFixedColumnWidths.action) }} title={localizedText(language, "Add the player to the squad or remove a selected player. Disabled means a budget, position, or club limit would be exceeded.", "Добавить игрока в состав или убрать выбранного. Неактивная кнопка означает превышение бюджета, лимита позиции или клуба.")}><span aria-hidden="true">+</span><span className="sr-only"><I18nText en="Add or remove" ru="Добавить или убрать" /></span><ColumnResizeHandle label={localizedText(language, "squad action", "кнопки состава")} language={language} width={widthFor("action", playerPoolFixedColumnWidths.action)} onWidthChange={(width) => setColumnWidths(current => ({ ...current, ["action"]: width }))} onPointerDown={(event) => startColumnResize(event, "action", playerPoolFixedColumnWidths.action)} onDoubleClick={() => resetColumnWidth("action")} /></th>
                {visibleColumns.map((column) => (
                  <th key={column.key} data-sort-key={column.key} data-sort-default-direction={column.numeric ? "desc" : "asc"} data-sort-disabled={column.key === "fixtures" ? "true" : undefined} className={cn("relative overflow-hidden px-1 py-2", column.numeric && "text-center")} title={column.title} style={{ width: widthFor(column.key, column.width) }}><PlayerPoolHeaderLabel label={column.label} numeric={column.numeric} /><ColumnResizeHandle label={column.label} language={language} width={widthFor(column.key, column.width)} onWidthChange={(width) => setColumnWidths(current => ({ ...current, [column.key]: width }))} onPointerDown={(event) => startColumnResize(event, column.key, column.width)} onDoubleClick={() => resetColumnWidth(column.key)} /></th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {desktopRows.paddingBefore > 0 ? <tr aria-hidden="true"><td colSpan={5 + visibleColumns.length} className="p-0" style={{ height: desktopRows.paddingBefore }} /></tr> : null}
              {desktopRows.items.map(({ item: player }) => <CustomPlayerPoolRow key={player.playerId} player={player} columns={visibleColumns} {...props} />)}
              {desktopRows.paddingAfter > 0 ? <tr aria-hidden="true"><td colSpan={5 + visibleColumns.length} className="p-0" style={{ height: desktopRows.paddingAfter }} /></tr> : null}
              {players.length === 0 ? <tr><td colSpan={5 + visibleColumns.length} className="px-4 py-10 text-center text-sm text-slate-500"><I18nText en="No players match the selected filters." ru="Нет игроков под выбранные фильтры." /></td></tr> : null}
            </tbody>
          </SortableTable>
        </div>
      </div> : null}
      <div className="col-span-full mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
        <span>{players.length} {localizedText(language, "players", "игроков")}</span>
      </div>
    </div>
  );
}

export function PlayerPoolHeaderLabel({ label, numeric = false, priceLabel = false, fullLabel }: { label: string; numeric?: boolean; priceLabel?: boolean; fullLabel?: string }) {
  return (
    <span className={cn("block min-w-0 truncate pr-4 leading-4", numeric && "text-center")}>
      <span className="whitespace-nowrap" data-price-header-label={priceLabel ? "true" : undefined} data-full-price-label={priceLabel ? fullLabel : undefined}>{label}</span>
    </span>
  );
}

export function playerPoolFixedColumnTitles(language: UiLanguage, provider = "SPORTS_RU") {
  const isFpl = provider === "FPL";
  const providerLabel = isFpl ? "FPL" : "Sports.ru";
  return {
    player: localizedText(
      language,
      `${providerLabel} fantasy display name. The second line shows expected minutes and the confidence heuristic. Confidence is not a probability that the forecast will be correct: 55% comes from sample size (full at 5 matches), 30% from minute stability, and 15% from the share of matches with a known starting-XI flag.`,
      `Имя игрока в формате фэнтези ${providerLabel}. Во второй строке показаны ожидаемые минуты и эвристика уверенности. Уверенность — не вероятность точности прогноза: 55% дают полнота выборки (максимум при 5 матчах), 30% — стабильность минут, 15% — доля матчей с известной отметкой выхода в старте.`
    ),
    team: localizedText(language, "The player's current club in the selected league and season.", "Текущий клуб игрока в выбранной лиге и сезоне."),
    position: localizedText(language, "Fantasy position used for formation limits: goalkeeper, defender, midfielder, or forward.", "Фэнтези-позиция, по которой применяются лимиты состава: вратарь, защитник, полузащитник или нападающий."),
    price: localizedText(language, `Current ${providerLabel} fantasy price. A tilde means the price is estimated because no verified ${providerLabel} value is available.`, `Текущая цена в фэнтези ${providerLabel}. Тильда означает оценочную цену: подтверждённой цены ${providerLabel} для игрока нет.`)
  };
}

export function CustomPlayerPoolRow({ player, columns, horizon, language, provider, projectionDetailsSourceHref, detailedFormulaTooltips, addBlockReason, selectionsByPlayerId, onAdd, onRemove }: Omit<PlayerPoolTableProps, "players"> & { player: FantasyPlannerPlayer; columns: PlayerPoolOptionalColumn[] }) {
  const reason = addBlockReason(player);
  const isSelected = selectionsByPlayerId.has(player.playerId);
  const disabled = !isSelected && reason !== null;
  const localizedReason = reason ? localizeAddBlockReason(reason, language) : null;
  const muted = disabled;
  const addLabel = disabled
    ? localizedText(language, `Cannot add ${player.name}: ${localizedReason ?? reason ?? ""}`, `Нельзя добавить ${player.name}: ${localizedReason ?? reason ?? ""}`)
    : localizedText(language, `Add ${player.name}`, `Добавить ${player.name}`);
  const removeLabel = localizedText(language, `Remove ${player.name}`, `Удалить ${player.name}`);
  const playerMetadata = [
    player.expectedMinutes !== null && player.expectedMinutes !== undefined
      ? `${Math.round(player.expectedMinutes)} ${localizedText(language, "min", "мин")}`
      : null,
    player.forecastConfidence !== null && player.forecastConfidence !== undefined
      ? `${Math.round(player.forecastConfidence * 100)}%`
      : null
  ].filter((value): value is string => value !== null).join(" · ");
  const fixedColumnTitles = playerPoolFixedColumnTitles(language, provider);
  const isVerifiedPrice = player.priceSource === "SPORTS_RU" || player.priceSource === "FPL";
  const priceProviderLabel = provider === "FPL" ? "FPL" : "Sports.ru";
  const teamDisplayName = fantasyPlayerTeamDisplayName(player);
  const fullTeamName = player.teamName.trim() || teamDisplayName;
  const teamCellTitle = `${player.name} · ${localizedText(language, "club", "клуб")}: ${teamDisplayName}\n${localizedText(language, "Full club name", "Полное название клуба")}: ${fullTeamName}\n${fixedColumnTitles.team}`;

  return (
    <tr
      className={cn("group h-11", isSelected ? "bg-emerald-50 text-slate-700" : disabled ? "bg-slate-50 text-slate-500" : "hover:bg-slate-50")}
    >
      <td className={cn("sticky left-0 z-[5] overflow-hidden border-r border-slate-200 px-2 py-1.5", isSelected ? "bg-emerald-50" : disabled ? "bg-slate-50" : "bg-white group-hover:bg-slate-50")} title={`${player.name}\n${fixedColumnTitles.player}\n${localizedText(language, `Forecast inputs: ${player.expectedMinutes == null ? "—" : `${formatNumber(player.expectedMinutes, 0)} min`}; confidence ${player.forecastConfidence == null ? "—" : `${formatNumber(player.forecastConfidence * 100, 0)}%`}.`, `Входы прогноза: ${player.expectedMinutes == null ? "—" : `${formatNumber(player.expectedMinutes, 0)} мин`}; уверенность ${player.forecastConfidence == null ? "—" : `${formatNumber(player.forecastConfidence * 100, 0)}%`}.`)}`}>
        <span className={cn("block truncate font-semibold", muted ? "text-slate-500" : "text-ink")}>{compactPlayerDisplayName(player.name)}</span>
        {playerMetadata ? <span className="block truncate text-[10px] text-slate-500">{playerMetadata}</span> : null}
      </td>
      <td className="overflow-hidden px-2 py-1.5 text-slate-600" title={teamCellTitle}><span className="block truncate">{teamDisplayName}</span></td>
      <td className="overflow-hidden px-1 py-1.5" title={`${player.name} · ${localizedText(language, "position", "позиция")}: ${player.positionGroup}\n${fixedColumnTitles.position}`}><span className={cn("inline-block max-w-full truncate rounded px-1 py-0.5 text-[10px] font-bold", muted ? "border border-slate-300 bg-slate-200 text-slate-700" : positionPillClass(player.positionGroup))}>{player.positionGroup}</span></td>
      <td data-sort-value={player.price} className={cn("overflow-hidden whitespace-nowrap px-1 py-1.5 text-right font-semibold", muted ? "text-slate-600" : "text-ink")} title={`${player.name} · ${localizedText(language, "price", "цена")}: ${formatNumber(player.price, 1)}\n${localizedText(language, `Source: ${isVerifiedPrice ? `verified ${priceProviderLabel} fantasy price` : `estimate; no verified ${priceProviderLabel} mapping`}.`, `Источник: ${isVerifiedPrice ? `подтверждённая цена фэнтези ${priceProviderLabel}` : `оценка; подтверждённого сопоставления ${priceProviderLabel} нет`}.`)}`}>{player.priceSource === "ESTIMATED" ? "~" : ""}{formatNumber(player.price, 1)}</td>
      <td className="px-1 py-1.5 text-center">
        {isSelected ? (
          <button type="button" onClick={() => onRemove(player.playerId)} aria-label={removeLabel} className="inline-flex h-7 w-7 items-center justify-center rounded border border-rose-200 bg-white text-rose-700 hover:bg-rose-50"><Trash2 className="h-4 w-4" /></button>
        ) : disabled ? (
          <span role="button" aria-disabled="true" tabIndex={0} aria-label={addLabel} title={localizedReason ?? undefined} className="inline-flex h-7 w-7 items-center justify-center rounded border border-slate-200 bg-slate-100 text-slate-400"><Lock className="h-4 w-4" /></span>
        ) : (
          <button type="button" onClick={() => onAdd(player)} aria-label={addLabel} className="inline-flex h-7 w-7 items-center justify-center rounded border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"><Plus className="h-4 w-4" /></button>
        )}
      </td>
      {columns.map((column) => customPlayerPoolCell(column, player, horizon, language, muted, projectionDetailsSourceHref, detailedFormulaTooltips, provider ?? "SPORTS_RU"))}
    </tr>
  );
}

export function playerPoolOptionalColumns(players: FantasyPlannerPlayer[], horizon: number, language: UiLanguage, provider = "SPORTS_RU"): PlayerPoolOptionalColumn[] {
  const priceProviderLabel = provider === "FPL" ? "FPL" : "Sports.ru";
  const column = (key: string, en: string, ru: string, titleEn = en, titleRu = ru, numeric = true, width = 72): PlayerPoolOptionalColumn => ({
    key,
    label: localizedText(language, en, ru),
    title: localizedText(language, titleEn, titleRu),
    numeric,
    width
  });
  const standard = [
    column("nextFp", "FP", "ФО", "Expected fantasy points in the next provider round. Every fixture is calculated with its own opponent inputs and the active scoring formula, then double-round results are summed.", "Ожидаемые фэнтези-очки в следующем туре провайдера. Каждый матч рассчитывается со своими входами соперника и активной формулой начисления, затем результаты двойного тура складываются.", true, 64),
    column("nextFpPerPrice", "FP/price", "ФО/цена", `Primary next-round expected fantasy points divided by the current ${priceProviderLabel} price. Higher means more forecast points per one price unit.`, `Основные ожидаемые ФО на следующий тур, делённые на текущую цену ${priceProviderLabel}. Чем выше значение, тем больше прогнозных очков на одну единицу стоимости.`, true, 78),
    column("horizonFp", `${horizon}R FP`, `${horizon}Т ФО`, `Sum of independently calculated primary forecasts for the next ${horizon} rounds; the current-round value is not simply multiplied.`, `Сумма отдельно рассчитанных основных прогнозов на следующие ${horizon} туров; значение текущего тура не умножается механически.`),
    column("foontasy", "FFO", "FFO", "Foontasy's external forecast for the current round, matched strictly through the Sports.ru player identifier. Foontasy does not publish a multi-round forecast; missing data is shown as a dash.", "Внешний прогноз Foontasy на текущий тур, сопоставленный строго через идентификатор игрока Sports.ru. Foontasy не публикует прогноз на несколько туров; отсутствие данных показывается прочерком."),
    column("foontasyPerPrice", "FFO/price", "ФФО/цена", `Foontasy current-round forecast divided by the current ${priceProviderLabel} price. Higher means more FFO per one price unit.`, `Прогноз Foontasy на текущий тур, делённый на текущую цену ${priceProviderLabel}. Чем выше значение, тем больше ФФО на одну единицу стоимости.`, true, 82),
    column("modelHorizon", `${horizon}R FFO`, `${horizon}Т ФФО`, `Our reproducible Foontasy-style forecast for the selected ${horizon}-round horizon. Every fixture is calculated separately from expected minutes, smoothed player rates, and fresh odds, xG form, or goals fallback. It is our model, not Foontasy's external forecast.`, `Наш воспроизводимый прогноз в стиле Foontasy на выбранный горизонт ${horizon} туров. Каждый матч считается отдельно по ожидаемым минутам, сглаженным показателям игрока и свежим коэффициентам, xG-форме или голам. Это наша модель, а не внешний прогноз Foontasy.`),
    column("alternative", "Alt", "Альт", "Alternative forecast for the next provider round. Each fixture is calculated independently with the user's personal Alt formula, then double-round results are summed.", "Альтернативный прогноз на следующий тур провайдера. Каждый матч отдельно рассчитывается по личной формуле Alt пользователя, затем результаты двойного тура складываются."),
    column("alternativePerPrice", "Alt/price", "Альт/цена", `Alternative next-round expected fantasy points divided by the current ${priceProviderLabel} price. Higher means more Alt points per one price unit.`, `Альтернативные ожидаемые ФО на следующий тур, делённые на текущую цену ${priceProviderLabel}. Чем выше значение, тем больше Альт-очков на одну единицу стоимости.`, true, 82),
    column("alternativeHorizon", `Alt ${horizon}R`, `Альт ${horizon}Т`, `Sum of independently calculated personal Alt forecasts for the next ${horizon} rounds.`, `Сумма отдельно рассчитанных личных прогнозов Alt на следующие ${horizon} туров.`),
    column("fixtures", "Fixtures", "Матчи", "The next opponents in the selected horizon. Chip colour represents fixture difficulty; hover a chip for the full opponent name and home/away context.", "Следующие соперники на выбранном горизонте. Цвет плашки показывает сложность матча; при наведении доступны полное имя соперника и поле дома/в гостях.", false, 230),
    column("age", "Age", "Возраст", "Player age from the current FotMob profile.", "Возраст игрока из текущего профиля FotMob."),
    column("nationality", "Nationality", "Гражданство", "Player nationality from FotMob metadata.", "Гражданство игрока из метаданных FotMob.", false, 120),
    column("rosterStarter", "XI flag", "Старт", "The club's current starting-XI flag edited on the team page. This is a shared roster marker, not the model's start probability.", "Текущая отметка стартовых 11 клуба, установленная на странице команды. Это общий признак состава, а не вероятность старта модели.", false),
    column("rotationRisk", "RR %", "RR %", "Rotation risk from 50/20/10/5 known lineups and rest. Baseline, not a calibrated probability.", "Риск ротации по 50/20/10/5 известным составам и отдыху. Baseline, не откалиброванная вероятность."),
    column("expectedMinutes", "Exp min", "Ож. мин", "Expected playing time in the next match, from 0 to 90 minutes. It scales all per-90 event rates; 80 or more minutes count as a full fantasy match.", "Ожидаемое игровое время в следующем матче от 0 до 90 минут. Им масштабируются все показатели per 90; 80 минут и больше считаются полным фэнтези-матчем."),
    column("startProbability", "Appearance %", "Выход %", "Model probability that the player appears on the pitch in the next fixture. This stored forecast field is not a starting-XI probability.", "Вероятность модели, что игрок появится на поле в следующем матче. Это сохранённое поле прогноза не является вероятностью выхода в стартовом составе."),
    column("sixtyProbability", "60 min %", "60 мин %", "Estimated probability of reaching 60 minutes. It controls the fantasy threshold for the higher appearance score and is not assumed to be 100% for every attacker.", "Оценка вероятности провести не менее 60 минут. Она управляет порогом повышенных очков за участие и не считается автоматически равной 100% для всех атакующих игроков."),
    column("fullMatchProbability", "Full %", "Фулл %", "Estimated probability of a full fantasy match. In the forecast pipeline, 80 expected minutes already count as full time to absorb normal prediction error.", "Оценка вероятности полного фэнтези-матча. В прогнозном пайплайне 80 ожидаемых минут уже считаются полным матчем с учётом обычной погрешности модели."),
    column("forecastConfidence", "Confidence", "Уверенность", "Data-reliability heuristic, not forecast accuracy: 55% sample completeness (reaches maximum at 5 matches) + 30% minute stability (standard deviation, worst at 45+ minutes) + 15% completeness of known starting-XI flags.", "Эвристика надёжности данных, а не точность прогноза: 55% — полнота выборки (максимум при 5 матчах), 30% — стабильность минут (по стандартному отклонению, минимум при 45+ минутах), 15% — полнота известных отметок выхода в старте."),
    column("valueScore", "FP/price", "ФО/цена", "Next-round primary expected fantasy points divided by the player's current price; a relative value indicator, not a separate forecast.", "Основной прогноз ФО на следующий тур, делённый на текущую цену игрока; показатель относительной выгодности, а не отдельный прогноз."),
    column("recentFp", "Recent FP", "Недавние ФО", "Average actual fantasy points over up to the last 5 stored matches in the selected history scope.", "Средние фактические фэнтези-очки максимум за 5 последних сохранённых матчей в выбранном историческом диапазоне."),
    column("projectedGoals", "Exp goals", "Ож. голы", "Expected goals allocated to the player across the next provider round. Double-round fixtures are projected independently and summed.", "Ожидаемые голы игрока за следующий тур провайдера. Матчи двойного тура прогнозируются отдельно и складываются."),
    column("projectedAssists", "Exp assists", "Ож. ассисты", "Expected assists across the next provider round after each fixture's minute scaling and team-event allocation.", "Ожидаемые ассисты за следующий тур провайдера после отдельного учёта минут и распределения командных событий в каждом матче."),
    column("projectedRecoveries", "Exp rec.", "Ож. возвраты", "Expected recoveries across the next provider round; used only where the scoring model rewards them.", "Ожидаемые возвраты мяча за следующий тур провайдера; используются только если активная формула начисляет за них очки."),
    column("projectedSaves", "Exp saves", "Ож. сейвы", "Expected goalkeeper saves across the next provider round, calculated separately for each opponent.", "Ожидаемые сейвы вратаря за следующий тур провайдера, рассчитанные отдельно для каждого соперника."),
    column("projectedCleanSheets", "Exp CS", "Ож. сухарь", "Expected clean-sheet contribution across the next provider round, calculated separately for every fixture.", "Ожидаемый вклад сухих матчей за следующий тур провайдера, рассчитанный отдельно для каждого матча."),
    column("projectedGoalsConceded", "Exp GC", "Ож. пропущ.", "Expected goals conceded while the player is on the pitch across the next provider round. Both primary FP and default Alt apply their penalty independently in every fixture.", "Ожидаемые пропущенные голы за следующий тур провайдера. Основное ФО и стандартный Альт применяют штраф отдельно в каждом матче."),
    column("projectedYellowCards", "Exp YC", "Ож. ЖК", "Expected yellow cards across the next provider round, calculated from each fixture's minute exposure.", "Ожидаемые жёлтые карточки за следующий тур провайдера с отдельным учётом минут каждого матча."),
    column("projectedRedCards", "Exp RC", "Ож. КК", "Expected red cards across the next provider round, calculated from each fixture's minute exposure.", "Ожидаемые красные карточки за следующий тур провайдера с отдельным учётом минут каждого матча."),
    column("baltikaXg", "W xG", "W xG", "Total Wyscout xG from the imported Baltika workbook for the selected sample; shown only when that source is available.", "Суммарный xG Wyscout из загруженного файла «Балтики» для выбранной выборки; показывается только при наличии этого источника."),
    column("baltikaXa", "W xA", "W xA", "Total Wyscout xA from the imported Baltika workbook for the selected sample; shown only when that source is available.", "Суммарный xA Wyscout из загруженного файла «Балтики» для выбранной выборки; показывается только при наличии этого источника."),
    column("baltikaMatches", "W matches", "W матчи", "Number of matches represented in the imported Wyscout aggregate.", "Количество матчей, вошедших в загруженный агрегат Wyscout.")
  ];
  const ignoredAliases = new Set([
    "observed_rounds",
    "tackles",
    "possession_recoveries",
    "conceded_goals",
    "clean_sheet",
    "average_rating_10_sample_size",
    "previous_club_fallback_matches",
    "previous_club_penalty_factor"
  ]);
  const statKeys = [...new Set(players.flatMap((player) => Object.keys(player.historicalStats ?? {})))]
    .filter((key) => !ignoredAliases.has(key))
    .sort((left, right) => historicalStatRank(left) - historicalStatRank(right) || left.localeCompare(right));
  return [...standard, ...statKeys.map((key) => column(`stat:${key}`, historicalStatLabel(key, language), historicalStatLabel(key, language), historicalStatTitle(key, language), historicalStatTitle(key, language)))];
}

export function playerPoolAdvancedFilterColumns(players: FantasyPlannerPlayer[], horizon: number, language: UiLanguage, provider = "SPORTS_RU"): PlayerPoolAdvancedFilterColumn[] {
  const fixedTitles = playerPoolFixedColumnTitles(language, provider);
  return [
    { key: "player", label: localizedText(language, "Player", "Игрок"), title: fixedTitles.player, numeric: false },
    { key: "team", label: localizedText(language, "Club", "Клуб"), title: fixedTitles.team, numeric: false },
    { key: "position", label: localizedText(language, "Position", "Позиция"), title: fixedTitles.position, numeric: false },
    { key: "price", label: localizedText(language, "Price", "Цена"), title: fixedTitles.price, numeric: true },
    ...playerPoolOptionalColumns(players, horizon, language, provider)
  ];
}

export function historicalStatTitle(key: string, language: UiLanguage) {
  if (key === "average_rating") {
    return localizedText(
      language,
      "Average FotMob rating over the player's latest 10 matches in the selected club/all-matches scope. Other historical metrics keep the selected period filter.",
      "Средний рейтинг FotMob за последние 10 матчей игрока в выбранном контексте «клубы/все матчи». Остальные исторические показатели сохраняют выбранный фильтр периода."
    );
  }
  const normalized = key.replace(/_/g, " ");
  const per90 = key.includes("per_90");
  return localizedText(
    language,
    `Historical metric “${normalized}” for the history scope selected above. ${per90 ? "Per-90 values are normalized by actual played minutes and are not used unscaled when forecast minutes are below 90." : "Totals and averages use only the matches included by the current club/all-matches and window filters."}`,
    `Исторический показатель «${normalized}» для выбранной выше исторической выборки. ${per90 ? "Значения per 90 нормализованы по фактически сыгранным минутам и не применяются без масштабирования, если прогноз минут меньше 90." : "Суммы и средние учитывают только матчи, попавшие под текущие фильтры «клубы/все матчи» и периода."}`
  );
}

export function customPlayerPoolCell(
  column: PlayerPoolOptionalColumn,
  player: FantasyPlannerPlayer,
  horizon: number,
  language: UiLanguage,
  muted: boolean,
  projectionDetailsSourceHref: string | undefined,
  detailedFormulaTooltips: boolean,
  provider: string
) {
  if (column.key === "fixtures") {
    const chips = fixtureChipPresentations(player.fixtures, player.fixtureDifficulties ?? [], horizon, player.fixtureFullNames).slice(0, 5);
    const fixtureTitle = chips.length > 0
      ? [
          localizedText(language, `${player.name}: next fixtures`, `${player.name}: ближайшие матчи`),
          ...chips.map((chip, index) => `${index + 1}. ${chip.title ?? chip.label}`)
        ].join("\n")
      : localizedText(language, `${player.name}: no fixture in the selected horizon.`, `${player.name}: в выбранном горизонте матчей нет.`);
    return (
      <td key={column.key} className="overflow-hidden px-1 py-1.5 text-[11px] text-slate-500" title={fixtureTitle}>
        {chips.length > 0 ? <FdrRow fixtures={chips} className="min-w-0 flex-nowrap gap-0.5" /> : <I18nText en="No fixture" ru="Нет матча" />}
      </td>
    );
  }

  const rawValue = customPlayerPoolColumnValue(column.key, player, horizon);
  const display = customPlayerPoolColumnDisplay(column.key, rawValue, language);
  const tone = column.key === "nextFp" || column.key === "nextFpPerPrice" ? "text-emerald-700"
    : column.key === "horizonFp" ? "text-sky-700"
      : column.key === "foontasy" || column.key === "foontasyPerPrice" ? "text-cyan-700"
        : column.key.startsWith("alt") ? "text-amber-700"
          : "text-slate-700";
  const cellTitle = playerPoolValueCellTitle(column, player, horizon, language, rawValue);
  const projectionKind: "primary" | "alternative" | null = column.key === "nextFp"
    ? "primary"
    : column.key === "alternative" ? "alternative" : null;
  return (
    <td key={column.key} data-sort-value={rawValue ?? ""} className={cn("overflow-hidden text-ellipsis whitespace-nowrap px-1 py-1.5", column.numeric && "text-center num-tabular", muted ? "text-slate-500" : tone)} title={projectionKind ? undefined : cellTitle}>
      {projectionKind ? (
        <ProjectionFormulaHoverCard
          playerId={player.playerId}
          playerName={player.name}
          kind={projectionKind}
          sourceHref={projectionDetailsSourceHref}
          provider={provider}
          language={language}
          detailed={detailedFormulaTooltips}
        >
          {display}
        </ProjectionFormulaHoverCard>
      ) : display}
    </td>
  );
}

export function playerPoolValueCellTitle(column: PlayerPoolOptionalColumn, player: FantasyPlannerPlayer, horizon: number, language: UiLanguage, rawValue: string | number | null) {
  if (column.key === "rotationRisk") return rotationRiskDescription(player.rotationRisk, language);
  const numericValue = typeof rawValue === "number" && Number.isFinite(rawValue) ? rawValue : null;
  if (column.key === "nextFp") return playerPrimaryNextForecastTitle(player, language, numericValue);
  if (column.key === "nextFpPerPrice") return forecastEfficiencyTitle(player, language, "FP", nextFantasyPoints(player), numericValue);
  if (column.key === "horizonFp") return playerPrimaryHorizonForecastTitle(player, language, numericValue, horizon);
  if (column.key === "foontasy") return foontasyForecastTitle(player, language, 1);
  if (column.key === "foontasyPerPrice") return forecastEfficiencyTitle(player, language, "FFO", player.foontasyPoints ?? null, numericValue);
  if (column.key === "alternative") return alternativePlayerForecastTitle(player, language);
  if (column.key === "alternativePerPrice") return forecastEfficiencyTitle(player, language, "Alt", nextAlternativeFantasyPoints(player), numericValue);
  if (column.key === "alternativeHorizon") return alternativePlayerHorizonForecastTitle(player, language, horizon);
  return playerPoolMetricValueTitle(column, player, language, rawValue);
}

export function playerPoolMetricValueTitle(column: PlayerPoolOptionalColumn, player: FantasyPlannerPlayer, language: UiLanguage, rawValue: string | number | null) {
  const display = customPlayerPoolColumnDisplay(column.key, rawValue, language);
  const stats = player.historicalStats ?? {};
  const matches = finiteMetric(stats.matches_played);
  const minutes = finiteMetric(stats.minutes_played);
  const sample = localizedText(
    language,
    `History sample: ${matches === null ? "unknown number of" : formatNumber(matches, 0)} stat rows${minutes === null ? "" : `, ${formatNumber(minutes, 0)} played minutes`} under the selected club/all-matches and period filters.`,
    `Историческая выборка: ${matches === null ? "число строк статистики неизвестно" : `${formatNumber(matches, 0)} строк статистики`}${minutes === null ? "" : `, ${formatNumber(minutes, 0)} сыгранных минут`} с учётом выбранных фильтров «клубы/все матчи» и периода.`
  );
  const lines = [`${player.name} · ${column.label}: ${display}`, column.title];

  if (rawValue === null || rawValue === undefined) {
    lines.push(localizedText(language, "No value was produced for this player and source.", "Для этого игрока источник не вернул значение."));
    if (column.key === "modelHorizon") {
      const status = horizonModelStatus(player, column.label);
      lines.push(localizedText(language, `Source: Machete Foontasy-style model${status ? `; status ${status}` : ""}.`, `Источник: Foontasy-style модель Machete${status ? `; статус ${status}` : ""}.`));
    } else if (column.key.startsWith("projected")) {
      lines.push(localizedText(language, "The next-fixture component pipeline did not return this event input.", "Компонентный прогноз следующего матча не вернул этот событийный вход."));
    } else if (column.key.startsWith("stat:")) {
      lines.push(sample);
      lines.push(localizedText(language, "FotMob has no finite aggregate for this metric in the selected history sample.", "В выбранной исторической выборке FotMob нет конечного агрегата этой метрики."));
    } else if (column.key.startsWith("baltika")) {
      lines.push(localizedText(language, "The imported Wyscout workbook has no matched value for this player.", "В загруженной книге Wyscout нет сопоставленного значения для этого игрока."));
    }
    return lines.join("\n");
  }

  if (column.key === "modelHorizon") {
    const status = horizonModelStatus(player, column.label);
    lines.push(localizedText(language, "Source: Machete Foontasy-style model; every future fixture is calculated separately.", "Источник: собственная Foontasy-style модель Machete; каждый будущий матч считается отдельно."));
    if (status) lines.push(localizedText(language, `Calculation status: ${status}.`, `Статус расчёта: ${status}.`));
    if (player.modelForecastCalculatedAt) lines.push(localizedText(language, `Calculated: ${player.modelForecastCalculatedAt}.`, `Рассчитано: ${player.modelForecastCalculatedAt}.`));
  } else if (column.key === "expectedMinutes") {
    lines.push(localizedText(language, `Model input for the next fixture: ${display} minutes. Exposure ratio: ${display}/90 = ${formatNumber(Number(rawValue) / 90, 3)}. The component model also balances goals, assists, saves and recoveries against team totals, so this ratio is not a universal direct multiplier.`, `Вход модели на следующий матч: ${display} минут. Доля игрового времени: ${display}/90 = ${formatNumber(Number(rawValue) / 90, 3)}. Компонентная модель дополнительно распределяет голы, ассисты, сейвы и возвраты относительно командных итогов, поэтому эта доля не является универсальным прямым множителем.`));
    lines.push(...minuteHistoryProvenanceLines(player.projectedFixtureComponents, language));
  } else if (column.key === "startProbability") {
    lines.push(player.projectedFixtureComponents
      ? localizedText(language, `Component-model probability of appearing on the pitch in the next fixture: ${display}. It is not a starting-XI probability.`, `Вероятность компонентной модели, что игрок появится на поле в следующем матче: ${display}. Это не вероятность выхода в стартовом составе.`)
      : localizedText(language, `Fallback value from history: share of starts among matches with a known XI flag: ${display}. A next-fixture appearance probability was not available.`, `Резервное значение из истории: доля стартов среди матчей с известной отметкой XI: ${display}. Прогноз вероятности появления в следующем матче недоступен.`));
    lines.push(sample);
  } else if (column.key === "sixtyProbability" || column.key === "fullMatchProbability") {
    const countKey = column.key === "sixtyProbability" ? "appearances_60" : "full_matches";
    const count = finiteMetric(stats[countKey]);
    if (count !== null && matches !== null && matches > 0) {
      lines.push(localizedText(language, `Historical check: ${formatNumber(count, 0)} / ${formatNumber(matches, 0)} = ${formatNumber(count / matches * 100, 1)}%. The displayed value is the next-fixture model estimate.`, `Проверка по истории: ${formatNumber(count, 0)} / ${formatNumber(matches, 0)} = ${formatNumber(count / matches * 100, 1)}%. В ячейке показана оценка модели на следующий матч.`));
    }
    if (column.key === "fullMatchProbability" && player.expectedMinutes !== null && player.expectedMinutes !== undefined) {
      lines.push(localizedText(language, `Full-time rule: expected minutes ${formatNumber(player.expectedMinutes, 1)} ${player.expectedMinutes >= 80 ? "meet" : "do not meet"} the 80-minute threshold.`, `Правило полного матча: ${formatNumber(player.expectedMinutes, 1)} ожидаемых минут ${player.expectedMinutes >= 80 ? "достигают" : "не достигают"} порога 80 минут.`));
    }
    lines.push(sample);
  } else if (column.key === "forecastConfidence") {
    lines.push(localizedText(language, "Heuristic = 55% sample completeness + 30% minute stability + 15% completeness of known XI flags. It measures data reliability, not the probability that the forecast is correct.", "Эвристика = 55% полноты выборки + 30% стабильности минут + 15% полноты известных отметок старта. Это надёжность данных, а не вероятность точности прогноза."));
    lines.push(sample);
    if (matches !== null) lines.push(`55% × min(${formatNumber(matches, 0)}/5, 1) = ${formatNumber(.55 * Math.min(matches / 5, 1) * 100, 1)} ${localizedText(language, "percentage points", "п.п.")}`);
    lines.push(localizedText(language, "Minute deviation and the exact known-XI numerator are not retained in this table row, so those substitutions are not invented.", "Отклонение минут и точный числитель известных отметок XI в этой строке не сохраняются, поэтому их подстановка не выдумывается."));
    appendForecastNotes(lines, player, language);
  } else if (column.key === "valueScore") {
    const next = nextFantasyPoints(player);
    lines.push(next === null || player.price <= 0
      ? localizedText(language, "The ratio cannot be expanded because forecast or price is missing.", "Нельзя разложить отношение: отсутствует прогноз или цена.")
      : `${formatNumber(next, 2)} / ${formatNumber(player.price, 1)} = ${formatNumber(next / player.price, 2)}`);
  } else if (column.key === "recentFp") {
    const values = (player.recentFp ?? []).filter(Number.isFinite);
    const sum = values.reduce((total, value) => total + value, 0);
    lines.push(values.length === 0
      ? localizedText(language, "No stored match scores in the selected sample.", "В выбранной выборке нет сохранённых очков по матчам.")
      : localizedText(language, `Matches: ${values.map((value) => formatNumber(value, 2)).join(" + ")} = ${formatNumber(sum, 2)}; ${formatNumber(sum, 2)} / ${values.length} = ${display}.`, `Матчи: ${values.map((value) => formatNumber(value, 2)).join(" + ")} = ${formatNumber(sum, 2)}; ${formatNumber(sum, 2)} / ${values.length} = ${display}.`));
  } else if (column.key.startsWith("projected")) {
    const fixtureCount = player.roundFixtureCounts?.[0] ?? 0;
    lines.push(fixtureCount > 1
      ? localizedText(language, `Provider-round component: ${fixtureCount} fixtures projected independently and summed; component total: ${display}.`, `Компонент provider-тура: ${fixtureCount} матча рассчитаны отдельно и сложены; итог компонента: ${display}.`)
      : localizedText(language, `Next-fixture component produced by the minute-aware projection. Expected minutes: ${player.expectedMinutes == null ? "—" : formatNumber(player.expectedMinutes, 1)}; component value: ${display}.`, `Компонент прогноза на следующий матч с учётом минут. Ожидаемые минуты: ${player.expectedMinutes == null ? "—" : formatNumber(player.expectedMinutes, 1)}; значение компонента: ${display}.`));
    lines.push(sample);
  } else if (column.key === "baltikaXg" || column.key === "baltikaXa") {
    const sampleSize = player.baltikaMatchesPlayed ?? null;
    lines.push(localizedText(language, `Source: imported Wyscout workbook${player.baltikaTeamName ? ` (${player.baltikaTeamName})` : ""}.`, `Источник: загруженная книга Wyscout${player.baltikaTeamName ? ` (${player.baltikaTeamName})` : ""}.`));
    if (sampleSize && typeof rawValue === "number") lines.push(`${formatNumber(rawValue, 2)} / ${sampleSize} = ${formatNumber(rawValue / sampleSize, 3)} ${localizedText(language, "per match", "за матч")}.`);
  } else if (column.key === "baltikaMatches") {
    lines.push(localizedText(language, `Source: imported Wyscout workbook; ${display} matches are represented in its aggregate.`, `Источник: загруженная книга Wyscout; в агрегат вошло матчей: ${display}.`));
  } else if (column.key.startsWith("stat:")) {
    lines.push(localizedText(language, "Source: FotMob match statistics aggregated only over the selected history scope.", "Источник: статистика матчей FotMob, агрегированная только по выбранной исторической выборке."));
    lines.push(sample);
    appendHistoricalMetricCalculation(lines, column.key.slice(5), Number(rawValue), stats, language);
  } else if (column.key === "age" || column.key === "nationality") {
    lines.push(localizedText(language, "Source: current FotMob player profile.", "Источник: текущий профиль игрока FotMob."));
  } else if (column.key === "rosterStarter") {
    lines.push(localizedText(language, `Shared manually edited club XI flag: ${display}. It is not a model probability.`, `Общая ручная отметка стартовых 11 клуба: ${display}. Это не вероятность модели.`));
  }
  return lines.join("\n");
}

export function finiteMetric(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function horizonModelStatus(player: FantasyPlannerPlayer, label: string) {
  return label.includes("3") ? player.modelT3Status ?? null : player.modelT5Status ?? null;
}

export function appendForecastNotes(lines: string[], player: FantasyPlannerPlayer, language: UiLanguage) {
  if (player.forecastFactors?.length) lines.push(localizedText(language, `Factors: ${player.forecastFactors.join("; ")}`, `Факторы модели: ${player.forecastFactors.map((note) => localizeForecastNote(note, language)).join("; ")}`));
  if (player.forecastRisks?.length) lines.push(localizedText(language, `Risks: ${player.forecastRisks.join("; ")}`, `Риски модели: ${player.forecastRisks.map((note) => localizeForecastNote(note, language)).join("; ")}`));
}

export function appendHistoricalMetricCalculation(lines: string[], key: string, value: number, stats: Record<string, number | null>, language: UiLanguage) {
  const matches = finiteMetric(stats.matches_played);
  const minutes = finiteMetric(stats.minutes_played);
  const countByProbability: Record<string, string> = {
    sixty_minute_probability: "appearances_60",
    full_match_probability: "full_matches"
  };
  if (key === "average_rating") {
    const ratedMatches = finiteMetric(stats.average_rating_10_sample_size);
    lines.push(localizedText(
      language,
      `FotMob rating window: the player's latest 10 matches in the selected club/all-matches scope. Arithmetic mean over ${ratedMatches === null ? "matches with a supplied rating" : `${formatNumber(ratedMatches, 0)} rated matches`}; result ${formatNumber(value, 2)}. Other metrics keep the selected history period.`,
      `Окно рейтинга FotMob: последние 10 матчей игрока в выбранном контексте «клубы/все матчи». Среднее арифметическое по ${ratedMatches === null ? "матчам с доступным рейтингом" : `${formatNumber(ratedMatches, 0)} матчам с рейтингом`}; результат ${formatNumber(value, 2)}. Остальные показатели сохраняют выбранный исторический период.`
    ));
    return;
  }
  if (countByProbability[key] && matches !== null && matches > 0) {
    const numerator = countByProbability[key] === "matches_played" ? matches : finiteMetric(stats[countByProbability[key]]);
    if (numerator !== null) lines.push(`${formatNumber(numerator, 0)} / ${formatNumber(matches, 0)} = ${formatNumber(value * 100, 1)}%`);
    return;
  }
  if (key === "appearance_probability") {
    lines.push(localizedText(language, "The appearance numerator is not retained in this row, so the displayed probability is not reconstructed with a false matches/matches fraction.", "Числитель выходов на поле в этой строке не сохраняется, поэтому показатель не раскладывается через ложную дробь «матчи/матчи»."));
    return;
  }
  const per90Match = key.match(/^(.*?)(?:_per_90|_per90)(?:_(l1|l5|l10|365))?$/);
  if (per90Match && minutes !== null && minutes > 0) {
    const totalKey = per90Match[2] ? `${per90Match[1]}_${per90Match[2]}` : per90Match[1];
    const total = finiteMetric(stats[totalKey]);
    if (total !== null) lines.push(`${formatNumber(total, 2)} × 90 / ${formatNumber(minutes, 0)} = ${formatNumber(value, 3)}`);
    return;
  }
  const additiveMetrics = /^(goals|assists|xg|xa|xgot|shots|shots_on_target|key_passes|chances_created|tackles_won|interceptions|clearances|duels_won|aerials_won|recoveries|saves|goals_conceded|clean_sheets|yellow_cards|red_cards|touches_in_opposition_box|fouls_won|penalties_won)$/;
  if (matches !== null && matches > 0 && additiveMetrics.test(key)) {
    lines.push(localizedText(language, `Aggregate: ${formatNumber(value, 2)} across ${formatNumber(matches, 0)} stat rows (${formatNumber(value / matches, 3)} per row).`, `Агрегат: ${formatNumber(value, 2)} по ${formatNumber(matches, 0)} строкам статистики (${formatNumber(value / matches, 3)} на строку).`));
  } else if (key === "average_rating") {
    lines.push(localizedText(language, "Arithmetic mean over matches where FotMob supplied a rating. The rated-match count is not retained here, so the denominator is not replaced with all stat rows.", "Среднее арифметическое по матчам, где FotMob отдал рейтинг. Число матчей с рейтингом здесь не сохраняется, поэтому знаменатель не подменяется всеми строками статистики."));
  }
}

export function playerPoolFilterValue(key: string, player: FantasyPlannerPlayer, horizon: number) {
  if (key === "player") return player.name;
  if (key === "team") return `${player.teamName} ${fantasyPlayerTeamDisplayName(player)}`;
  if (key === "position") return player.positionGroup;
  if (key === "price") return player.price;
  return customPlayerPoolColumnValue(key, player, horizon);
}

export function sortPlayerPoolRows(
  players: FantasyPlannerPlayer[],
  sort: { key: string; direction: SortDirection } | null,
  horizon: number
) {
  if (!sort) return players;
  return players
    .map((player, index) => ({ player, index, value: playerPoolFilterValue(sort.key, player, horizon) }))
    .sort((left, right) => {
      const compared = isFantasyPositionSortKey(sort.key)
        ? compareFantasyPositions(String(left.value ?? ""), String(right.value ?? ""), sort.direction)
        : comparePlayerPoolValues(left.value, right.value, sort.direction);
      return compared || left.index - right.index;
    })
    .map(({ player }) => player);
}

export function comparePlayerPoolValues(
  left: string | number | null,
  right: string | number | null,
  direction: SortDirection
) {
  if (left === null && right === null) return 0;
  if (left === null) return 1;
  if (right === null) return -1;
  const result = typeof left === "number" && typeof right === "number"
    ? left - right
    : String(left).localeCompare(String(right), undefined, { numeric: true, sensitivity: "base" });
  return direction === "asc" ? result : -result;
}

export function useFixedVirtualRows<T>(
  items: T[],
  containerRef: { current: HTMLDivElement | null },
  enabled: boolean,
  rowHeight: number,
  overscan: number,
  resetKey: string
) {
  const [range, setRange] = useState({ start: 0, end: 0 });

  useEffect(() => {
    const container = containerRef.current;
    if (!enabled || !container) return;
    const update = () => {
      const start = Math.max(0, Math.floor(container.scrollTop / rowHeight) - overscan);
      const visibleRows = Math.ceil(Math.max(container.clientHeight, rowHeight) / rowHeight);
      const end = Math.min(items.length, start + visibleRows + overscan * 2);
      setRange((current) => current.start === start && current.end === end ? current : { start, end });
    };
    update();
    container.addEventListener("scroll", update, { passive: true });
    const resizeObserver = new ResizeObserver(update);
    resizeObserver.observe(container);
    return () => {
      container.removeEventListener("scroll", update);
      resizeObserver.disconnect();
    };
  }, [containerRef, enabled, items.length, overscan, rowHeight]);

  useEffect(() => {
    const container = containerRef.current;
    if (!enabled || !container) return;
    container.scrollTop = 0;
    const visibleRows = Math.ceil(Math.max(container.clientHeight, rowHeight) / rowHeight);
    setRange({ start: 0, end: Math.min(items.length, visibleRows + overscan * 2) });
  }, [containerRef, enabled, items.length, overscan, resetKey, rowHeight]);

  if (!enabled) return { items: [] as Array<{ item: T; index: number }>, paddingBefore: 0, paddingAfter: 0 };
  const start = Math.min(range.start, items.length);
  const fallbackEnd = Math.min(items.length, Math.ceil(720 / rowHeight) + overscan * 2);
  const end = Math.max(start, Math.min(range.end || fallbackEnd, items.length));
  return {
    items: items.slice(start, end).map((item, offset) => ({ item, index: start + offset })),
    paddingBefore: start * rowHeight,
    paddingAfter: Math.max(0, (items.length - end) * rowHeight)
  };
}

export function customPlayerPoolColumnValue(key: string, player: FantasyPlannerPlayer, horizon: number): string | number | null {
  const projected = player.projectedFixtureComponents ?? player.projectionListMetrics;
  if (key.startsWith("stat:")) return player.historicalStats?.[key.slice(5)] ?? null;
  switch (key) {
    case "nextFp": return nextFantasyPoints(player);
    case "nextFpPerPrice": return forecastPointsPerPrice(nextFantasyPoints(player), player.price);
    case "horizonFp": return playerHorizonPoints(player, horizon);
    case "foontasy": return player.foontasyPoints ?? null;
    case "foontasyPerPrice": return forecastPointsPerPrice(player.foontasyPoints, player.price);
    case "modelHorizon": return horizon === 3 ? player.modelT3Points ?? null : player.modelT5Points ?? null;
    case "alternative": return nextAlternativeFantasyPoints(player);
    case "alternativePerPrice": return forecastPointsPerPrice(nextAlternativeFantasyPoints(player), player.price);
    case "alternativeHorizon": return playerAlternativeHorizonPoints(player, horizon);
    case "fixtures": return [...(player.fixtureFullNames ?? []), ...(player.fixtures ?? [])].join(" ");
    case "age": return player.age ?? null;
    case "nationality": return player.nationality ?? null;
    case "rosterStarter": return player.isStarter ? 1 : 0;
    case "expectedMinutes": return player.expectedMinutes ?? null;
    case "rotationRisk": return currentRotationRisk(player.rotationRisk);
    case "startProbability": return player.startProbability ?? null;
    case "sixtyProbability": return projected?.sixtyMinutesProbability ?? null;
    case "fullMatchProbability": return projected?.fullMatchProbability ?? null;
    case "forecastConfidence": return player.forecastConfidence ?? null;
    case "valueScore": return player.valueScore;
    case "recentFp": return average(player.recentFp ?? []);
    case "projectedGoals": return projected?.expectedGoals ?? null;
    case "projectedAssists": return projected?.expectedAssists ?? null;
    case "projectedRecoveries": return projected?.expectedRecoveries ?? null;
    case "projectedSaves": return projected?.expectedSaves ?? null;
    case "projectedCleanSheets": return projected?.expectedCleanSheets ?? null;
    case "projectedGoalsConceded": return projected?.expectedGoalsConceded ?? null;
    case "projectedYellowCards": return projected?.expectedYellowCards ?? null;
    case "projectedRedCards": return projected?.expectedRedCards ?? null;
    case "baltikaXg": return player.baltikaXg ?? null;
    case "baltikaXa": return player.baltikaXa ?? null;
    case "baltikaMatches": return player.baltikaMatchesPlayed ?? null;
    default: return null;
  }
}

export function customPlayerPoolColumnDisplay(key: string, value: string | number | null, language: UiLanguage) {
  if (value === null || value === undefined) return "—";
  if (typeof value === "string") return value;
  if (key.endsWith("PerPrice")) return formatNumber(value, 3);
  if (key === "rosterStarter") return value ? localizedText(language, "Yes", "Да") : localizedText(language, "No", "Нет");
  if (["rotationRisk", "startProbability", "sixtyProbability", "fullMatchProbability", "forecastConfidence"].includes(key) || /(?:appearance|sixty|full_match)_(?:probability|rate)/.test(key)) {
    return `${formatNumber(value * 100, 0)}%`;
  }
  if (key === "age" || key === "expectedMinutes" || key === "baltikaMatches" || /^stat:(?:matches|minutes|appearances|full_matches|goals|assists|shots|saves|cards)/.test(key)) return formatNumber(value, 0);
  return formatNumber(value, 2);
}

export function historicalStatLabel(key: string, language: UiLanguage) {
  const ru: Record<string, string> = {
    matches_played: "Матчи", minutes_played: "Минуты", appearance_probability: "Выход %", sixty_minute_probability: "60 мин %", full_match_probability: "Полный матч %",
    appearances_60: "Матчи 60+", full_matches: "Полные матчи", goals: "Голы", assists: "Ассисты", xg: "xG", xa: "xA", xgot: "xGOT", shots: "Удары",
    shots_on_target: "Удары в створ", key_passes: "Ключевые передачи", chances_created: "Созданные моменты", tackles_won: "Отборы", interceptions: "Перехваты",
    clearances: "Выносы", duels_won: "Выигранные дуэли", aerials_won: "Верховые дуэли", recoveries: "Возвраты", saves: "Сейвы", goals_conceded: "Пропущенные",
    clean_sheets: "Сухие матчи", yellow_cards: "ЖК", red_cards: "КК", average_rating: "Рейтинг", touches_in_opposition_box: "Касания в штрафной",
    fouls_won: "Заработанные фолы", penalties_won: "Заработанные пенальти"
  };
  if (language === "ru" && ru[key]) return ru[key];
  return key.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function historicalStatRank(key: string) {
  const order = ["matches_played", "minutes_played", "appearance_probability", "sixty_minute_probability", "full_match_probability", "goals", "assists", "xg", "xa", "xgot", "shots", "shots_on_target", "key_passes", "chances_created", "tackles_won", "interceptions", "clearances", "duels_won", "aerials_won", "recoveries", "touches_in_opposition_box", "fouls_won", "penalties_won", "saves", "goals_conceded", "clean_sheets", "yellow_cards", "red_cards", "average_rating"];
  const index = order.indexOf(key);
  return index === -1 ? order.length : index;
}

export function average(values: number[]) {
  return values.length > 0 ? values.reduce((total, value) => total + value, 0) / values.length : null;
}

export function PlayerPoolTable({
  players,
  horizon,
  language,
  addBlockReason,
  selectionsByPlayerId,
  onAdd,
  onRemove
}: {
  players: FantasyPlannerPlayer[];
  horizon: number;
  language: UiLanguage;
  addBlockReason: (player: FantasyPlannerPlayer) => string | null;
  selectionsByPlayerId: Map<string, FantasySquadSelection>;
  onAdd: (player: FantasyPlannerPlayer) => void;
  onRemove: (playerId: string) => void;
}) {
  const columnTitles = playerPoolColumnTitles(language, horizon);
  return (
    <>
      <PlayerPoolMobileList
        players={players}
        horizon={horizon}
        language={language}
        addBlockReason={addBlockReason}
        selectionsByPlayerId={selectionsByPlayerId}
        onAdd={onAdd}
        onRemove={onRemove}
      />
      <div className="hidden min-w-0 max-w-full overflow-hidden rounded border border-slate-200 bg-white md:block [@media(pointer:coarse)]:!hidden" data-testid="player-pool-table">
        <div className="relative min-w-0 max-h-[720px] w-full max-w-full overflow-x-hidden overflow-y-auto [scrollbar-gutter:stable] 2xl:max-h-[min(78vh,880px)] 3xl:max-h-[min(84vh,1040px)]">
        <SortableTable sortRefreshKey={horizon} className="w-full min-w-0 table-fixed divide-y divide-slate-200 text-xs">
          <colgroup>
            <col className="w-[15%]" />
            <col className="w-[7%]" />
            <col className="w-[7%]" />
            <col className="w-[5%]" />
            <col className="w-[7%]" />
            <col className="w-[7%]" />
            <col className="w-[7%]" />
            <col className="w-[7%]" />
            <col className="w-[7%]" />
            <col className="w-[7%]" />
            <col className="w-[19%]" />
            <col className="w-[5%]" />
          </colgroup>
          <thead className="sticky top-0 z-10 whitespace-nowrap bg-slate-50 text-left text-[10px] font-semibold uppercase text-slate-500">
            <tr>
              <th className="overflow-hidden px-2 py-2" title={columnTitles.player}><I18nText en="Player" ru="Игрок" /></th>
              <th className="overflow-hidden px-2 py-2" title={columnTitles.team}><I18nText en="Team" ru="Клуб" /></th>
              <th className="overflow-hidden px-1 py-2" title={columnTitles.position}><I18nText en="Pos" ru="Поз." /></th>
              <th className="overflow-hidden px-1 py-2 text-right" title={columnTitles.price}><I18nText en="Price" ru="Цена" /></th>
              <th className="overflow-hidden px-1 py-2 text-right" title={columnTitles.next}><I18nText en="FP" ru="ФО" /></th>
              <th className="overflow-hidden px-1 py-2 text-right" title={columnTitles.horizon}><I18nText en={`${horizon}R FP`} ru={`${horizon}Т` + " ФО"} /></th>
              <th className="overflow-hidden px-1 py-2 text-right" title={columnTitles.foontasyNext}>FFO</th>
              <th className="overflow-hidden px-1 py-2 text-right" title={columnTitles.alternative}><I18nText en="ALT" ru="Альт" /></th>
              <th className="overflow-hidden px-1 py-2 text-right" title={columnTitles.alternativeFive}><I18nText en={`Alt ${horizon}R`} ru={`Альт ${horizon}Т`} /></th>
              <th data-sort-disabled="true" className="overflow-hidden px-2 py-2" title={columnTitles.fixtures}><I18nText en="Fixtures" ru="Матчи" /></th>
              <th data-sort-disabled="true" className="overflow-hidden pl-2 pr-3 py-2 text-center" title={columnTitles.action}>
                <span aria-hidden="true">+</span>
                <span className="sr-only"><I18nText en="Add or remove" ru="Добавить или убрать" /></span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {players.map((player) => {
              const reason = addBlockReason(player);
              const isSelected = selectionsByPlayerId.has(player.playerId);
              const disabled = !isSelected && reason !== null;
              const localizedReason = reason ? localizeAddBlockReason(reason, language) : null;
              const fixtureChips = fixtureChipPresentations(player.fixtures, player.fixtureDifficulties ?? [], horizon, player.fixtureFullNames);
              const visibleFixtureChips = fixtureChips.slice(0, 5);
              const hiddenFixtureCount = Math.max(0, fixtureChips.length - visibleFixtureChips.length);
              const hiddenFixtureLabels = fixtureChips.slice(visibleFixtureChips.length).map((chip) => chip.title ?? chip.label).join(", ");
              const fixtures = player.fixtures.slice(0, horizon).filter(Boolean).join(" / ");
              const teamDisplayName = fantasyPlayerTeamDisplayName(player);
              const rowClassName = isSelected
                ? "bg-emerald-50 text-slate-700"
                : disabled
                  ? "bg-slate-50 text-slate-500"
                  : "hover:bg-slate-50";
              const muted = disabled;
              const addLabel = disabled
                ? localizedText(language, `Cannot add ${player.name}: ${localizedReason ?? reason ?? ""}`, `Нельзя добавить ${player.name}: ${localizedReason ?? reason ?? ""}`)
                : localizedText(language, `Add ${player.name}`, `Добавить ${player.name}`);
              const removeLabel = localizedText(language, `Remove ${player.name}`, `Удалить ${player.name}`);
              const forecastTitle = fantasyForecastTitle(player, language);
              const nextRoundForecast = nextFantasyPoints(player);
              const nextAlternativeForecast = nextAlternativeFantasyPoints(player);
              const primaryHorizonForecast = playerHorizonPoints(player, horizon);
              const alternativeHorizonForecast = playerAlternativeHorizonPoints(player, horizon);
              const nextPrimaryForecastTitle = playerPrimaryNextForecastTitle(player, language, nextRoundForecast);
              const horizonPrimaryForecastTitle = playerPrimaryHorizonForecastTitle(player, language, primaryHorizonForecast, horizon);
              const foontasyNextForecast = player.foontasyPoints ?? null;
              const playerMetadata = [
                player.expectedMinutes !== null && player.expectedMinutes !== undefined
                  ? `${Math.round(player.expectedMinutes)}${language === "ru" ? "м" : "m"}`
                  : null,
                player.forecastConfidence !== null && player.forecastConfidence !== undefined
                  ? `${Math.round(player.forecastConfidence * 100)}%`
                  : null
              ].filter((value): value is string => value !== null).join(" · ");

              return (
                <tr key={player.playerId} className={rowClassName}>
                  <td className="px-2 py-1.5">
                    <span className={`block truncate font-semibold ${muted ? "text-slate-500" : "text-ink"}`} title={forecastTitle}>{compactPlayerDisplayName(player.name)}</span>
                    {playerMetadata ? <span className="block truncate text-[10px] text-slate-600" title={forecastTitle}>{playerMetadata}</span> : null}
                  </td>
                  <td className="overflow-hidden px-1 py-1.5 text-slate-600">
                    <span className="block truncate" title={player.teamName}>{teamDisplayName}</span>
                  </td>
                  <td className="overflow-hidden px-1 py-1.5">
                    <span className={`inline-block max-w-full truncate rounded px-1 py-0.5 text-[10px] font-bold ${muted ? "border border-slate-300 bg-slate-200 text-slate-700" : positionPillClass(player.positionGroup)}`}>{player.positionGroup}</span>
                  </td>
                  <td
                    data-sort-value={player.price}
                    className={`overflow-hidden whitespace-nowrap px-1 py-1.5 text-right font-semibold ${muted ? "text-slate-600" : "text-ink"}`}
                    title={player.priceSource === "ESTIMATED" ? localizedText(language, "Estimated price", "Оценочная цена") : undefined}
                  >
                    {player.priceSource === "ESTIMATED" ? "~" : ""}{formatNumber(player.price, 1)}
                  </td>
                  <td
                    data-sort-value={nextRoundForecast}
                    className={`overflow-hidden whitespace-nowrap px-1 py-1.5 text-right text-[11px] font-semibold ${muted ? "text-slate-600" : "text-emerald-700"}`}
                    title={nextPrimaryForecastTitle}
                  >
                    {formatScore(nextRoundForecast)}
                  </td>
                  <td
                    data-sort-value={primaryHorizonForecast}
                    className={`overflow-hidden whitespace-nowrap px-1 py-1.5 text-right text-[11px] font-semibold ${muted ? "text-slate-600" : "text-sky-700"}`}
                    title={horizonPrimaryForecastTitle}
                  >
                    {formatScore(primaryHorizonForecast)}
                  </td>
                  <td
                    data-sort-value={foontasyNextForecast ?? 0}
                    className={`overflow-hidden whitespace-nowrap px-1 py-1.5 text-right text-[11px] font-semibold ${muted ? "text-slate-600" : "text-cyan-700"}`}
                    title={foontasyForecastTitle(player, language, 1)}
                  >
                    {foontasyNextForecast === null ? "—" : formatNumber(foontasyNextForecast, 1)}
                  </td>
                  <td
                    data-sort-value={nextAlternativeForecast ?? 0}
                    className={`overflow-hidden whitespace-nowrap px-1 py-1.5 text-right text-[11px] font-semibold ${muted ? "text-slate-600" : "text-amber-700"}`}
                    title={alternativePlayerForecastTitle(player, language)}
                  >
                    {formatAlternativeScore(nextAlternativeForecast)}
                  </td>
                  <td
                    data-sort-value={alternativeHorizonForecast ?? 0}
                    className={`overflow-hidden whitespace-nowrap px-1 py-1.5 text-right text-[11px] font-semibold ${muted ? "text-slate-600" : "text-purple-700"}`}
                    title={alternativePlayerHorizonForecastTitle(player, language, horizon)}
                  >
                    {formatAlternativeScore(alternativeHorizonForecast)}
                  </td>
                  <td className="overflow-hidden px-2 py-1.5 text-[11px] text-slate-500">
                    {visibleFixtureChips.length > 0 ? (
                      <div className="flex min-w-0 items-center gap-1 overflow-hidden" title={fixtures}>
                        <FdrRow fixtures={visibleFixtureChips} className="min-w-0 flex-nowrap gap-0.5 overflow-hidden" />
                        {hiddenFixtureCount > 0 ? (
                          <span
                            className="inline-flex h-[18px] shrink-0 items-center rounded bg-slate-200 px-1 text-[10px] font-bold text-slate-700"
                            aria-label={localizedText(language, `${hiddenFixtureCount} more fixtures: ${hiddenFixtureLabels}`, `Ещё матчей: ${hiddenFixtureCount}. ${hiddenFixtureLabels}`)}
                            title={hiddenFixtureLabels}
                          >
                            +{hiddenFixtureCount}
                          </span>
                        ) : null}
                      </div>
                    ) : (
                      <span className="block truncate" title={fixtures}><I18nText en="No fixture loaded" ru="Матч не загружен" /></span>
                    )}
                  </td>
                  <td className="overflow-hidden pl-1 pr-3 py-1.5 text-center">
                    {isSelected ? (
                      <button type="button" onClick={() => onRemove(player.playerId)} aria-label={removeLabel} className="inline-flex h-7 w-7 items-center justify-center rounded border border-rose-200 bg-white text-rose-700 hover:bg-rose-50">
                        <Trash2 className="h-4 w-4" />
                        <span className="sr-only">{removeLabel}</span>
                      </button>
                    ) : disabled ? (
                      <span
                        role="button"
                        aria-disabled="true"
                        aria-label={addLabel}
                        tabIndex={0}
                        title={localizedReason ?? undefined}
                        className="inline-flex h-7 w-7 items-center justify-center rounded border border-slate-200 bg-slate-100 text-slate-400"
                      >
                        <Lock className="h-4 w-4" />
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => onAdd(player)}
                        className="inline-flex h-7 w-7 items-center justify-center rounded border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                        aria-label={addLabel}
                      >
                        <Plus className="h-4 w-4" />
                        <span className="sr-only">{addLabel}</span>
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
            {players.length === 0 ? (
              <tr>
                <td colSpan={11} className="px-4 py-10 text-center text-sm text-slate-500">
                  <I18nText en="No players match the selected filters." ru="Нет игроков под выбранные фильтры." />
                </td>
              </tr>
            ) : null}
          </tbody>
          </SortableTable>
        </div>
      </div>
    </>
  );
}

export function PlayerPoolMobileList({
  players,
  horizon,
  language,
  addBlockReason,
  selectionsByPlayerId,
  onAdd,
  onRemove,
  replacementSource,
  columns
}: {
  players: FantasyPlannerPlayer[];
  horizon: number;
  language: UiLanguage;
  addBlockReason: (player: FantasyPlannerPlayer) => string | null;
  selectionsByPlayerId: Map<string, FantasySquadSelection>;
  onAdd: (player: FantasyPlannerPlayer) => void;
  onRemove: (playerId: string) => void;
  replacementSource?: FantasyPlannerPlayer | null;
  columns?: PlayerPoolOptionalColumn[];
}) {
  const pageSize = 18;
  const [visibleCount, setVisibleCount] = useState(pageSize);
  const visiblePlayers = players.slice(0, visibleCount);

  return (
    <div data-testid="player-pool-mobile">
      <div className="grid gap-2 md:grid-cols-2">
      {visiblePlayers.map((player) => {
        const reason = addBlockReason(player);
        const isSelected = selectionsByPlayerId.has(player.playerId);
        const disabled = !isSelected && reason !== null;
        const localizedReason = reason ? localizeAddBlockReason(reason, language) : null;
        const fixtureChips = fixtureChipPresentations(player.fixtures, player.fixtureDifficulties ?? [], horizon, player.fixtureFullNames);
        const addLabel = disabled
          ? localizedText(language, `Cannot add ${player.name}: ${localizedReason ?? reason ?? ""}`, `Нельзя добавить ${player.name}: ${localizedReason ?? reason ?? ""}`)
          : replacementSource
            ? localizedText(language, `Replace ${replacementSource.name} with ${player.name}`, `Заменить ${replacementSource.name} на ${player.name}`)
            : localizedText(language, `Add ${player.name}`, `Добавить ${player.name}`);
        const removeLabel = localizedText(language, `Remove ${player.name}`, `Убрать ${player.name}`);

        return (
          <article
            key={player.playerId}
            className={cn(
              "overflow-hidden rounded border p-3",
              isSelected
                ? "border-emerald-200 bg-emerald-50"
                : disabled
                  ? "border-slate-200 bg-slate-50 text-slate-500"
                  : "border-slate-200 bg-white"
            )}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 items-start gap-2.5">
                <SquadPlayerPhoto player={player} large />
                <div className="min-w-0">
                <div className="flex min-w-0 items-center gap-2">
                  <h4 className="truncate text-sm font-bold text-ink">{compactPlayerDisplayName(player.name)}</h4>
                  <span className={cn("shrink-0 rounded px-2 py-0.5 text-[10px] font-bold", disabled ? "bg-slate-200 text-slate-600" : positionPillClass(player.positionGroup))}>
                    {player.positionGroup}
                  </span>
                </div>
                <p className="mt-0.5 truncate text-xs text-slate-500">{fantasyPlayerTeamDisplayName(player)}</p>
                {player.expectedMinutes !== null && player.expectedMinutes !== undefined ? (
                  <p className="mt-0.5 text-[11px] text-slate-500">
                    {Math.round(player.expectedMinutes)} <I18nText en="min" ru="мин" />
                  </p>
                ) : null}
                </div>
              </div>
              {isSelected && !replacementSource ? (
                <button type="button" onClick={() => onRemove(player.playerId)} aria-label={removeLabel} className="inline-flex min-h-12 shrink-0 items-center justify-center gap-1.5 rounded border border-rose-200 bg-white px-3 text-sm font-semibold text-rose-700 hover:bg-rose-50">
                  <Trash2 className="h-4 w-4" />
                  <I18nText en="Remove" ru="Убрать" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => onAdd(player)}
                  disabled={disabled}
                  aria-label={addLabel}
                  className="inline-flex min-h-12 shrink-0 items-center justify-center gap-1.5 rounded border border-emerald-200 bg-emerald-50 px-3 text-sm font-semibold text-emerald-700 hover:bg-emerald-100 disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400"
                >
                  {disabled ? <Lock className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                  {replacementSource ? <I18nText en="Replace" ru="Заменить" /> : <I18nText en="Add" ru="Добавить" />}
                </button>
              )}
            </div>

            <MobilePlayerAnalytics player={player} horizon={horizon} language={language} columns={columns ?? playerPoolOptionalColumns(players, horizon, language)} />

            <dl className="mt-2 grid grid-cols-4 divide-x divide-slate-200 rounded bg-white/80 px-1 py-2 text-center">
              <div className="min-w-0 px-1">
                <dt className="text-[10px] font-semibold uppercase text-slate-500"><I18nText en="Next" ru="След." /></dt>
                <dd className="truncate text-sm font-bold text-emerald-700 num-tabular">{formatScore(nextFantasyPoints(player))}</dd>
              </div>
              <div className="min-w-0 px-1">
                <dt className="text-[10px] font-semibold uppercase text-slate-500">{horizon}R</dt>
                <dd className="truncate text-sm font-bold text-sky-700 num-tabular">{formatScore(playerHorizonPoints(player, horizon))}</dd>
              </div>
              <div className="min-w-0 px-1">
                <dt className="text-[10px] font-semibold uppercase text-slate-500"><I18nText en="Price" ru="Цена" /></dt>
                <dd className="truncate text-sm font-bold text-ink num-tabular">{player.priceSource === "ESTIMATED" ? "~" : ""}{formatNumber(player.price, 1)}</dd>
              </div>
              <div className="min-w-0 px-1">
                <dt className="text-[10px] font-semibold uppercase text-slate-500">Alt</dt>
                <dd className="truncate text-sm font-bold text-amber-700 num-tabular">{formatAlternativeScore(nextAlternativeFantasyPoints(player))}</dd>
              </div>
            </dl>

            <div className="mt-2 flex min-w-0 items-center justify-between gap-2 overflow-hidden">
              <div className="min-w-0 overflow-hidden">
                {fixtureChips.length > 0 ? <FdrRow fixtures={fixtureChips} /> : <span className="text-[11px] text-slate-500"><I18nText en="No fixture loaded" ru="Матч не загружен" /></span>}
              </div>
              <span className="shrink-0 text-[11px] font-semibold text-violet-700 num-tabular">
                <I18nText en="Alt 5R" ru="Альт 5Т" /> {formatAlternativeScore(playerAlternativeHorizonPoints(player, 5))}
              </span>
            </div>

            {disabled ? (
              <p className="mt-2 flex items-center gap-1 text-[11px] font-semibold text-rose-700">
                <Lock className="h-3 w-3 shrink-0" />
                <span className="truncate">{localizedReason}</span>
              </p>
            ) : null}
          </article>
        );
      })}
      </div>
      {visibleCount < players.length ? (
        <button
          type="button"
          onClick={() => setVisibleCount((current) => Math.min(players.length, current + pageSize))}
          className="mt-3 inline-flex min-h-12 w-full items-center justify-center rounded border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50"
        >
          <I18nText en={`Show more (${players.length - visibleCount})`} ru={`Показать ещё (${players.length - visibleCount})`} />
        </button>
      ) : null}
      {players.length === 0 ? <p className="rounded border border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
        <I18nText en="No players match the selected filters." ru="Нет игроков под выбранные фильтры." />
      </p> : null}
    </div>
  );
}

export function MobilePlayerAnalytics({ player, columns, horizon, language }: { player: FantasyPlannerPlayer; columns: PlayerPoolOptionalColumn[]; horizon: number; language: UiLanguage }) {
  const [open, setOpen] = useState(false);
  const confidence = player.forecastConfidence;
  const metrics = [...new Map([...columns, ...playerPoolOptionalColumns([], horizon, language).filter(column => column.key === "forecastConfidence")].map(column => [column.key, column])).values()];
  return <details className="mt-2 border-t border-slate-200 pt-2" onToggle={event => setOpen(event.currentTarget.open)}>
    <summary className="min-h-11 cursor-pointer text-xs font-semibold text-slate-700">
      <I18nText en="Analytics · Data quality" ru="Аналитика · Качество данных" /> {confidence == null ? "—" : `${Math.round(confidence * 100)}%`}
    </summary>
    {open ? <div className="grid gap-1" data-testid="mobile-player-analytics">
      {metrics.map(column => {
        const value = customPlayerPoolColumnValue(column.key, player, horizon);
        return <details key={column.key} className="rounded bg-white p-2">
          <summary className="flex min-h-11 cursor-pointer items-center justify-between gap-3 text-xs">
            <span>{column.label}</span><strong>{customPlayerPoolColumnDisplay(column.key, value, language)}</strong>
          </summary>
          <p className="whitespace-pre-wrap break-words text-[11px] leading-5 text-slate-600">{playerPoolValueCellTitle(column, player, horizon, language, value)}</p>
        </details>;
      })}
    </div> : null}
  </details>;
}

export function SquadPlayerPhoto({ player, large = false, contactSheet = false }: { player: FantasyPlannerPlayer; large?: boolean; contactSheet?: boolean }) {
  const [failed, setFailed] = useState(false);
  if (!player.photoUrl || failed) {
    return (
      <div aria-hidden="true" className={contactSheet ? "squad-contact-card__photo squad-contact-card__photo--fallback" : cn("flex shrink-0 items-center justify-center rounded-full bg-slate-200 font-black text-slate-500 ring-1 ring-white", large ? "h-12 w-12 text-sm" : "mx-auto mt-0.5 h-7 w-7 text-[9px]")}>
        {player.name.trim().slice(0, 1).toUpperCase()}
      </div>
    );
  }

  return (
    <img
      src={player.photoUrl}
      alt=""
      loading="lazy"
      decoding="async"
      draggable={false}
      onError={() => setFailed(true)}
      className={contactSheet ? "squad-contact-card__photo" : cn("shrink-0 rounded-full bg-slate-100 object-cover object-top ring-1 ring-white", large ? "h-12 w-12" : "mx-auto mt-0.5 h-7 w-7")}
    />
  );
}

export function localizeAddBlockReason(reason: string, language: UiLanguage) {
  if (reason === "Already in squad") return localizedText(language, reason, "Уже в составе");
  if (reason === "Squad is full") return localizedText(language, reason, "Состав заполнен");
  if (reason === "Budget limit") return localizedText(language, reason, "Лимит бюджета");

  const positionLimit = reason.match(/^(GK|DEF|MID|FWD|UNK) limit reached$/);
  if (positionLimit) return localizedText(language, reason, `Лимит ${positionLimit[1]} достигнут`);

  const teamLimit = reason.match(/^(.+) limit reached$/);
  if (teamLimit) return localizedText(language, reason, `Лимит команды ${teamLimit[1]} достигнут`);

  return reason;
}

export function fantasyPlayerTeamDisplayName(player: FantasyPlannerPlayer) {
  return player.teamShortName?.trim() || player.teamName;
}

export function positionPillClass(position: FantasyPositionGroup) {
  const base = "border border-black/10 text-white shadow-sm";
  if (position === "GK") return `${base} bg-violet-700`;
  if (position === "DEF") return `${base} bg-blue-700`;
  if (position === "MID") return `${base} bg-emerald-700`;
  if (position === "FWD") return `${base} bg-rose-700`;
  return `${base} bg-slate-700`;
}
