"use client";

import { type ReactNode, useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import type {
  FormulaAdaptationBreakdown,
  FormulaAdaptationBreakdowns,
  FormulaAdaptationForecastKey
} from "@/machete/formula_adaptations";

type Language = "en" | "ru";
type FormulaAdaptationResponse = {
  playerId: string;
  breakdowns: FormulaAdaptationBreakdowns;
};

const requestCache = new Map<string, Promise<FormulaAdaptationResponse>>();
const requestCacheMaximumEntries = 80;

export function formulaAdaptationBreakdownHref(sourceHref: string | undefined, playerId: string) {
  if (!sourceHref) return null;
  const source = new URL(sourceHref, "http://formula-adaptation.local");
  source.pathname = "/api/machete/squads/formula-adaptations";
  source.searchParams.delete("squadId");
  source.searchParams.set("playerId", playerId);
  return `${source.pathname}?${source.searchParams.toString()}`;
}

export function FormulaAdaptationHoverCard({
  playerName,
  playerId,
  columnLabel,
  columnKey,
  sourceHref,
  language,
  detailed,
  children
}: {
  playerName: string;
  playerId: string;
  columnLabel: string;
  columnKey: FormulaAdaptationForecastKey;
  sourceHref?: string;
  language: Language;
  detailed: boolean;
  children: ReactNode;
}) {
  const tooltipId = useId();
  const triggerRef = useRef<HTMLSpanElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);
  const [open, setOpen] = useState(false);
  const [responseState, setResponseState] = useState<{ href: string; response: FormulaAdaptationResponse } | null>(null);
  const [failedHref, setFailedHref] = useState<string | null>(null);
  const [position, setPosition] = useState({ left: 8, top: 8 });
  const requestHref = formulaAdaptationBreakdownHref(sourceHref, playerId);
  const response = responseState?.href === requestHref ? responseState.response : null;
  const failed = requestHref ? failedHref === requestHref : true;

  const cancelClose = useCallback(() => {
    if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    closeTimerRef.current = null;
  }, []);

  const load = useCallback(() => {
    if (!requestHref) {
      return;
    }
    if (response) return;
    setFailedHref(null);
    let request = requestCache.get(requestHref);
    if (!request) {
      request = fetch(requestHref, {
        cache: "no-store",
        headers: { Accept: "application/json" }
      }).then(async (result) => {
        const payload = await result.json().catch(() => ({})) as Partial<FormulaAdaptationResponse>;
        if (!result.ok || !payload.breakdowns || typeof payload.playerId !== "string") {
          throw new Error("FORMULA_ADAPTATION_BREAKDOWN_LOAD_FAILED");
        }
        return payload as FormulaAdaptationResponse;
      });
      if (requestCache.size >= requestCacheMaximumEntries) {
        const oldest = requestCache.keys().next().value;
        if (oldest) requestCache.delete(oldest);
      }
      requestCache.set(requestHref, request);
      void request.catch(() => requestCache.delete(requestHref!));
    }
    void request.then((payload) => {
      if (!mountedRef.current) return;
      setResponseState({ href: requestHref, response: payload });
    }).catch(() => {
      if (!mountedRef.current) return;
      setFailedHref(requestHref);
    });
  }, [requestHref, response]);

  const show = useCallback(() => {
    cancelClose();
    setOpen(true);
    load();
  }, [cancelClose, load]);

  const scheduleClose = useCallback(() => {
    cancelClose();
    closeTimerRef.current = setTimeout(() => setOpen(false), 120);
  }, [cancelClose]);

  const updatePosition = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const triggerRect = trigger.getBoundingClientRect();
    const panelWidth = panelRef.current?.offsetWidth ?? Math.min(880, window.innerWidth - 16);
    const panelHeight = panelRef.current?.offsetHeight ?? Math.min(620, window.innerHeight - 16);
    const gutter = 8;
    const gap = 6;
    const maxLeft = Math.max(gutter, window.innerWidth - panelWidth - gutter);
    const centeredLeft = triggerRect.left + triggerRect.width / 2 - panelWidth / 2;
    const left = Math.min(Math.max(centeredLeft, gutter), maxLeft);
    const below = triggerRect.bottom + gap;
    const above = triggerRect.top - panelHeight - gap;
    const top = below + panelHeight <= window.innerHeight - gutter
      ? below
      : Math.max(gutter, above);
    setPosition({ left, top });
  }, []);

  useLayoutEffect(() => {
    if (open) updatePosition();
  }, [detailed, failed, open, response, updatePosition]);

  useEffect(() => {
    if (!open) return;
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [open, updatePosition]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      cancelClose();
    };
  }, [cancelClose]);

  const breakdown = response?.breakdowns[columnKey] ?? null;
  const ariaLabel = language === "ru"
    ? `${playerName}, ${columnLabel}. Наведите или сфокусируйте, чтобы увидеть ${detailed ? "подробный" : "короткий"} расчёт.`
    : `${playerName}, ${columnLabel}. Hover or focus for the ${detailed ? "detailed" : "short"} calculation.`;

  return (
    <span
      ref={triggerRef}
      className="inline-flex cursor-help rounded-sm underline decoration-dotted underline-offset-2 outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
      tabIndex={0}
      aria-label={ariaLabel}
      aria-describedby={open ? tooltipId : undefined}
      data-player-id={playerId}
      onMouseEnter={show}
      onMouseLeave={scheduleClose}
      onFocus={show}
      onBlur={scheduleClose}
      onKeyDown={(event) => {
        if (event.key === "Escape") setOpen(false);
      }}
    >
      {children}
      {open && typeof document !== "undefined" ? createPortal(
        <div
          ref={panelRef}
           id={tooltipId}
           role="tooltip"
           data-testid="formula-adaptation-tooltip"
           data-tooltip-detail={detailed ? "detailed" : "short"}
           className={`fixed z-[100] max-h-[min(78vh,720px)] ${detailed ? "w-[min(880px,calc(100vw-16px))]" : "w-[min(440px,calc(100vw-16px))]"} overflow-auto rounded-lg border border-slate-300 bg-white p-4 text-left text-xs normal-case leading-5 text-slate-700 shadow-2xl`}
           style={{ left: position.left, top: position.top }}
          onMouseEnter={cancelClose}
          onMouseLeave={scheduleClose}
        >
          <FormulaAdaptationBreakdownContent
            playerName={playerName}
            columnLabel={columnLabel}
            breakdown={breakdown}
             loading={!response && !failed}
             failed={failed}
             language={language}
             detailed={detailed}
           />
        </div>,
        document.body
      ) : null}
    </span>
  );
}

export function FormulaAdaptationBreakdownContent({
  playerName,
  columnLabel,
  breakdown,
  loading,
  failed,
  language,
  detailed
}: {
  playerName: string;
  columnLabel: string;
  breakdown: FormulaAdaptationBreakdown | null;
  loading: boolean;
  failed: boolean;
  language: Language;
  detailed: boolean;
}) {
  if (loading) {
    return <p role="status">{language === "ru" ? `Загружаю ${detailed ? "подробный" : "короткий"} расчёт…` : `Loading the ${detailed ? "detailed" : "short"} calculation…`}</p>;
  }
  if (failed) {
    return <p role="alert" className="text-rose-700">{language === "ru" ? "Не удалось загрузить детали расчёта." : "Could not load the calculation details."}</p>;
  }
  if (!breakdown) {
    return <p>{language === "ru" ? "Для этого значения детализация отсутствует." : "No breakdown is available for this value."}</p>;
  }

  const baseLabel = breakdown.baseName === "fo_current" ? "FO" : "Alt";
  const profileLabel = breakdown.profile === "position"
    ? (language === "ru" ? "калибровка позиции" : "position calibration")
    : breakdown.profile === "jointAll"
      ? "Joint all"
      : "Joint accepted";

  const calculationSummary = (
    <>
      <div className="sticky -top-4 z-10 -mx-4 -mt-4 border-b border-slate-200 bg-white px-4 py-3">
        <p className="text-sm font-bold text-ink">{playerName} · {columnLabel}</p>
        <p className="text-[11px] text-slate-500">{baseLabel} · {profileLabel} · {breakdown.position}</p>
      </div>

      <div className="mt-3 rounded border border-slate-200 bg-slate-50 p-3 font-mono text-[11px] num-tabular">
        <p>{baseLabel} = {detailNumber(breakdown.baseValue)}</p>
        <p>
          {detailNumber(breakdown.intercept)} + {detailNumber(breakdown.numericContributionTotal)} + {detailNumber(breakdown.categoricalContributionTotal)}
          {" = "}{detailNumber(breakdown.rawPrediction)}
        </p>
        <p>
          clamp[{detailNumber(breakdown.predictionClamp[0])}; {detailNumber(breakdown.predictionClamp[1])}]
          {" → "}{detailNumber(breakdown.clampedPrediction)}
        </p>
        {breakdown.minuteGuard ? (
          <p>
            {language === "ru" ? "минутный порог" : "minute guard"}
            {" min(1; "}{detailNullableNumber(breakdown.minuteGuard.expectedMinutes)}
            {" / "}{detailNumber(breakdown.minuteGuard.starterFloorMinutes)}
            {") = "}{detailNumber(breakdown.minuteGuard.factor)}
            {"; "}{detailNumber(breakdown.minuteGuard.beforeGuard)}
            {" × "}{detailNumber(breakdown.minuteGuard.factor)}
            {" = "}{detailNumber(breakdown.minuteAdjustedPrediction)}
            {" → "}<strong>{detailNumber(breakdown.roundedPrediction)}</strong>
          </p>
        ) : (
          <p>
            {detailNumber(breakdown.minuteAdjustedPrediction)}
            {" → "}<strong>{detailNumber(breakdown.roundedPrediction)}</strong>
          </p>
        )}
      </div>
    </>
  );

  if (!detailed) {
    return (
      <>
        {calculationSummary}
        <p className="mt-2 text-[11px] text-slate-500">
          {language === "ru"
            ? `${breakdown.numericTerms.length} числовых + ${breakdown.categoricalTerms.length} категориальных признаков · выборка ${breakdown.trainingSamples} · погода исключена.`
            : `${breakdown.numericTerms.length} numeric + ${breakdown.categoricalTerms.length} categorical features · sample ${breakdown.trainingSamples} · weather excluded.`}
        </p>
        <p className="mt-2 rounded bg-sky-50 px-2 py-1.5 text-[11px] text-sky-800">
          {language === "ru"
            ? "Включите «Подробные подсказки» справа от фильтра цены, чтобы увидеть каждый коэффициент."
            : "Enable “Detailed tooltips” beside the price filter to see every coefficient."}
        </p>
      </>
    );
  }

  const numericTerms = [...breakdown.numericTerms].sort(compareContribution);
  const categoricalTerms = [...breakdown.categoricalTerms].sort(compareContribution);

  return (
    <>
      {calculationSummary}

      <p className="mt-2 text-[11px] text-slate-500">
        {language === "ru"
          ? `Обучающая выборка этой позиции: ${breakdown.trainingSamples} наблюдений. Погода исключена. Все строки ниже входят в сумму; порядок — по модулю вклада.`
          : `Position training sample: ${breakdown.trainingSamples} observations. Weather is excluded. Every row below is included in the sum; rows are ordered by absolute contribution.`}
      </p>

      <h3 className="mt-4 font-bold text-ink">
        {language === "ru" ? `Числовые слагаемые (${numericTerms.length})` : `Numeric terms (${numericTerms.length})`}
      </h3>
      <div className="mt-1 overflow-x-auto rounded border border-slate-200">
        <table className="min-w-full border-collapse text-[10px] leading-4 num-tabular">
          <thead className="bg-slate-50 text-slate-500">
            <tr>
              <th className="px-2 py-1 text-left">{language === "ru" ? "Признак" : "Feature"}</th>
              <th className="px-2 py-1 text-right">{language === "ru" ? "Значение" : "Value"}</th>
              <th className="px-2 py-1 text-right">{language === "ru" ? "Медиана" : "Median"}</th>
              <th className="px-2 py-1 text-right">{language === "ru" ? "Коэфф." : "Coef."}</th>
              <th className="px-2 py-1 text-right">{language === "ru" ? "Вклад значения" : "Value effect"}</th>
              <th className="px-2 py-1 text-right">{language === "ru" ? "Пропуск" : "Missing"}</th>
              <th className="px-2 py-1 text-right">{language === "ru" ? "Итого" : "Total"}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 font-mono">
            {numericTerms.map((term) => (
              <tr key={term.name}>
                <td className="max-w-72 break-all px-2 py-1 font-sans text-slate-700" title={term.name}>{term.name}</td>
                <td className="whitespace-nowrap px-2 py-1 text-right" title={term.rawValue === null ? (language === "ru" ? "Нет live-значения: использована медиана обучения." : "No live value: the training median was used.") : undefined}>
                  {detailNumber(term.usedValue)}
                  {term.valueSource === "trained_median" ? <span className="ml-1 text-amber-700">median</span> : null}
                </td>
                <td className="whitespace-nowrap px-2 py-1 text-right text-slate-500">{detailNumber(term.trainedMedian)}</td>
                <td className="whitespace-nowrap px-2 py-1 text-right">{detailNumber(term.coefficient)}</td>
                <td className="whitespace-nowrap px-2 py-1 text-right">{signedNumber(term.valueContribution)}</td>
                <td className="whitespace-nowrap px-2 py-1 text-right" title={term.missingCoefficient === null ? undefined : `missing coef ${detailNumber(term.missingCoefficient)}`}>
                  {signedNumber(term.missingContribution)}
                </td>
                <td className="whitespace-nowrap px-2 py-1 text-right font-bold">{signedNumber(term.totalContribution)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h3 className="mt-4 font-bold text-ink">
        {language === "ru" ? `Категориальные слагаемые (${categoricalTerms.length})` : `Categorical terms (${categoricalTerms.length})`}
      </h3>
      <div className="mt-1 overflow-x-auto rounded border border-slate-200">
        <table className="min-w-full border-collapse text-[10px] leading-4 num-tabular">
          <thead className="bg-slate-50 text-slate-500">
            <tr>
              <th className="px-2 py-1 text-left">{language === "ru" ? "Признак" : "Feature"}</th>
              <th className="px-2 py-1 text-left">{language === "ru" ? "Категория" : "Category"}</th>
              <th className="px-2 py-1 text-left">{language === "ru" ? "Источник" : "Source"}</th>
              <th className="px-2 py-1 text-right">{language === "ru" ? "Вклад" : "Effect"}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 font-mono">
            {categoricalTerms.map((term) => (
              <tr key={term.name}>
                <td className="max-w-72 break-all px-2 py-1 font-sans text-slate-700">{term.name}</td>
                <td className="max-w-60 break-all px-2 py-1">{term.category}</td>
                <td className="whitespace-nowrap px-2 py-1">{term.coefficientSource}</td>
                <td className="whitespace-nowrap px-2 py-1 text-right font-bold">{signedNumber(term.contribution)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-3 text-[10px] text-slate-500">
        {language === "ru"
          ? `Версия ${breakdown.version}. Для пропущенного числового признака модель использует обучающую медиану и, если обучен, отдельный коэффициент факта пропуска. Это не выдуманное live-значение.`
          : `Version ${breakdown.version}. A missing numeric feature uses its training median plus a separately trained missingness coefficient when available; it is not an invented live value.`}
      </p>
    </>
  );
}

function compareContribution(
  left: { contribution?: number; totalContribution?: number },
  right: { contribution?: number; totalContribution?: number }
) {
  const leftValue = left.totalContribution ?? left.contribution ?? 0;
  const rightValue = right.totalContribution ?? right.contribution ?? 0;
  return Math.abs(rightValue) - Math.abs(leftValue);
}

function detailNumber(value: number) {
  if (!Number.isFinite(value)) return "—";
  if (value !== 0 && Math.abs(value) < 0.000001) return value.toExponential(3);
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 6,
    useGrouping: false
  }).format(value);
}

function detailNullableNumber(value: number | null) {
  return value === null ? "—" : detailNumber(value);
}

function signedNumber(value: number) {
  const formatted = detailNumber(value);
  return value > 0 ? `+${formatted}` : formatted;
}
