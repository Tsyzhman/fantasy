"use client";

import { type ReactNode, useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import type { FantasyPlayerProjectionDetails } from "@/machete/squad-player-dto";

type ProjectionKind = "primary" | "alternative";
type ProjectionDetailRequestEntry = {
  expiresAt: number;
  promise: Promise<FantasyPlayerProjectionDetails>;
  bytes: number;
};

const detailRequestCache = new Map<string, ProjectionDetailRequestEntry>();
const detailRequestCacheMaximumEntries = 80;
const detailRequestCacheMaximumBytes = 2 * 1024 * 1024;
const detailRequestCacheTtlMs = 5 * 60_000;
let detailRequestCacheBytes = 0;

export function projectionFormulaDetailsHref(sourceHref: string | undefined, playerId: string, provider?: string) {
  if (!sourceHref) return null;
  const source = new URL(sourceHref, "http://projection-details.local");
  source.pathname = "/api/machete/squads/projection-details";
  source.searchParams.delete("squadId");
  source.searchParams.set("playerId", playerId);
  if (provider) source.searchParams.set("provider", provider);
  return `${source.pathname}?${source.searchParams.toString()}`;
}

export function ProjectionFormulaHoverCard({
  playerName,
  playerId,
  kind,
  sourceHref,
  provider,
  language,
  detailed,
  children
}: {
  playerName: string;
  playerId: string;
  kind: ProjectionKind;
  sourceHref?: string;
  provider?: string;
  language: "en" | "ru";
  detailed: boolean;
  children: ReactNode;
}) {
  const tooltipId = useId();
  const triggerRef = useRef<HTMLSpanElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);
  const [open, setOpen] = useState(false);
  const [responseState, setResponseState] = useState<{ href: string; details: FantasyPlayerProjectionDetails } | null>(null);
  const [failedHref, setFailedHref] = useState<string | null>(null);
  const [position, setPosition] = useState({ left: 8, top: 8 });
  const requestHref = projectionFormulaDetailsHref(sourceHref, playerId, provider);
  const details = responseState?.href === requestHref ? responseState.details : null;
  const failed = requestHref ? failedHref === requestHref : true;
  const panelMaximumWidth = detailed ? 640 : 280;

  const cancelClose = useCallback(() => {
    if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    closeTimerRef.current = null;
  }, []);

  const load = useCallback(() => {
    if (!requestHref || details) return;
    setFailedHref(null);
    const request = cachedProjectionDetailsRequest(requestHref);
    void request.then((payload) => {
      if (mountedRef.current) setResponseState({ href: requestHref, details: payload });
    }).catch(() => {
      if (mountedRef.current) setFailedHref(requestHref);
    });
  }, [details, requestHref]);

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
    const panelWidth = panelRef.current?.offsetWidth ?? Math.min(panelMaximumWidth, window.innerWidth - 16);
    const panelHeight = panelRef.current?.offsetHeight ?? Math.min(560, window.innerHeight - 16);
    const gutter = 8;
    const gap = 6;
    const left = Math.min(
      Math.max(triggerRect.left + triggerRect.width / 2 - panelWidth / 2, gutter),
      Math.max(gutter, window.innerWidth - panelWidth - gutter)
    );
    const below = triggerRect.bottom + gap;
    const top = below + panelHeight <= window.innerHeight - gutter
      ? below
      : Math.max(gutter, triggerRect.top - panelHeight - gap);
    setPosition({ left, top });
  }, [panelMaximumWidth]);

  useLayoutEffect(() => {
    if (open) updatePosition();
  }, [details, detailed, failed, open, updatePosition]);

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

  const formula = kind === "primary" ? details?.projectionFormula : details?.alternativeProjectionFormula;
  const components = kind === "primary" ? details?.projectionComponents : details?.alternativeProjectionComponents;
  const fixtureInputs = kind === "primary" ? details?.projectedFixtureComponents : details?.alternativeProjectedFixtureComponents;
  const label = kind === "primary"
    ? language === "ru" ? "Основной прогноз" : "Primary forecast"
    : language === "ru" ? "Альтернативный прогноз" : "Alternative forecast";

  return (
    <span
      ref={triggerRef}
      className="inline-flex cursor-help rounded-sm underline decoration-dotted underline-offset-2 outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
      tabIndex={0}
      aria-label={`${playerName}: ${label}`}
      aria-describedby={open ? tooltipId : undefined}
      onPointerEnter={show}
      onPointerLeave={scheduleClose}
      onFocus={show}
      onBlur={scheduleClose}
    >
      {children}
      {open && typeof document !== "undefined" ? createPortal(
        <div
          ref={panelRef}
          id={tooltipId}
          role="tooltip"
          onPointerEnter={cancelClose}
          onPointerLeave={scheduleClose}
          className={`fixed z-[90] ${detailed ? "max-h-[min(70vh,560px)] w-[min(640px,calc(100vw-16px))] p-4" : "max-h-[min(70vh,420px)] w-[min(280px,calc(100vw-16px))] p-2"} overflow-auto rounded border border-slate-200 bg-white text-left text-xs normal-case tracking-normal text-slate-700 shadow-elev`}
          style={position}
        >
          {detailed ? <p className="font-bold text-ink">{playerName} · {label}</p> : null}
          {!requestHref || failed ? (
            <p className={detailed ? "mt-2 text-rose-700" : "text-rose-700"}>{language === "ru" ? "Не удалось загрузить подробный расчёт." : "Could not load the detailed calculation."}</p>
          ) : !details ? (
            <p className={detailed ? "mt-2 text-slate-500" : "text-slate-500"}>{language === "ru" ? "Загружаем расчёт…" : "Loading calculation…"}</p>
          ) : (
            <ProjectionDetailsBody
              language={language}
              detailed={detailed}
              formula={formula ?? null}
              components={components ?? null}
              fixtureInputs={fixtureInputs ?? null}
            />
          )}
        </div>,
        document.body
      ) : null}
    </span>
  );
}

export function ProjectionDetailsBody({
  language,
  detailed,
  formula,
  components,
  fixtureInputs
}: {
  language: "en" | "ru";
  detailed: boolean;
  formula: NonNullable<FantasyPlayerProjectionDetails["projectionFormula"]> | null;
  components: NonNullable<FantasyPlayerProjectionDetails["projectionComponents"]> | null;
  fixtureInputs: NonNullable<FantasyPlayerProjectionDetails["projectedFixtureComponents"]> | null;
}) {
  const terms = formula?.terms ?? [];
  const total = formula?.total ?? (typeof components?.total === "number" ? components.total : null);
  if (!detailed) {
    return (
      <div className="space-y-1 font-mono text-[11px] leading-4">
        <p className="font-semibold text-ink">{language === "ru" ? "Итого" : "Total"}: {formatProjectionValue(total)}</p>
        {terms.map((term, index) => (
          <p key={`${term.fixtureLabel ?? "round"}:${index}`} className="break-all">
            {term.fixtureLabel ? `[${term.fixtureLabel}] ` : ""}{term.sign < 0 ? "−" : "+"} {term.resolvedExpression} = {formatProjectionValue(term.value)}
          </p>
        ))}
      </div>
    );
  }
  return (
    <div className="mt-3 space-y-3">
      {formula ? (
        <div>
          <p><span className="font-semibold">{language === "ru" ? "Формула" : "Formula"}:</span> <code className="break-all">{formula.formula}</code></p>
          <p className="mt-1 font-semibold text-emerald-700">{language === "ru" ? "Итого" : "Total"}: {formatProjectionValue(formula.total)}</p>
          <div className="mt-2 space-y-1 font-mono text-[11px]">
            {terms.map((term, index) => (
              <p key={`${term.fixtureLabel ?? "round"}:${index}`} className="break-all">
                {term.fixtureLabel ? `[${term.fixtureLabel}] ` : ""}{term.sign < 0 ? "−" : "+"} {term.resolvedExpression} = {formatProjectionValue(term.value)}
              </p>
            ))}
          </div>
        </div>
      ) : <p className="text-slate-500">{language === "ru" ? "Формула для этого прогноза не сохранена." : "No formula was stored for this forecast."}</p>}
      {components ? (
        <DetailGrid title={language === "ru" ? "Компоненты ФО" : "Fantasy-point components"} values={components} />
      ) : null}
      {fixtureInputs ? (
        <DetailGrid title={language === "ru" ? "Входы ближайшего матча" : "Nearest-fixture inputs"} values={fixtureInputs} />
      ) : null}
    </div>
  );
}

function DetailGrid({ title, values }: { title: string; values: Record<string, unknown> }) {
  const rows = Object.entries(values).filter(([, value]) => typeof value === "number" || typeof value === "boolean" || typeof value === "string");
  return (
    <div>
      <p className="font-semibold text-ink">{title}</p>
      <dl className="mt-1 grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1">
        {rows.map(([key, value]) => (
          <div key={key} className="contents">
            <dt className="truncate text-slate-500" title={key}>{key}</dt>
            <dd className="text-right font-mono">{typeof value === "number" ? formatProjectionValue(value) : String(value)}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function cachedProjectionDetailsRequest(href: string) {
  const now = Date.now();
  const cached = detailRequestCache.get(href);
  if (cached && cached.expiresAt <= now) deleteDetailRequest(href);
  const fresh = detailRequestCache.get(href);
  if (fresh) {
    detailRequestCache.delete(href);
    detailRequestCache.set(href, fresh);
    return fresh.promise;
  }

  let entry: ProjectionDetailRequestEntry;
  const promise = fetch(href, {
    cache: "no-store",
    headers: { Accept: "application/json" }
  }).then(async (result) => {
    const payload = await result.json().catch(() => ({})) as Partial<FantasyPlayerProjectionDetails>;
    if (!result.ok || typeof payload.playerId !== "string") throw new Error("PROJECTION_DETAILS_LOAD_FAILED");
    if (detailRequestCache.get(href) === entry) {
      entry.bytes = new TextEncoder().encode(JSON.stringify(payload)).byteLength;
      detailRequestCacheBytes += entry.bytes;
      trimDetailRequestCache();
    }
    return payload as FantasyPlayerProjectionDetails;
  });
  entry = { expiresAt: now + detailRequestCacheTtlMs, promise, bytes: 0 };
  detailRequestCache.set(href, entry);
  void promise.catch(() => {
    if (detailRequestCache.get(href) === entry) deleteDetailRequest(href);
  });
  trimDetailRequestCache();
  return promise;
}

function trimDetailRequestCache() {
  while (detailRequestCache.size > detailRequestCacheMaximumEntries || detailRequestCacheBytes > detailRequestCacheMaximumBytes) {
    const oldest = detailRequestCache.keys().next().value;
    if (!oldest) return;
    deleteDetailRequest(oldest);
  }
}

function deleteDetailRequest(href: string) {
  const entry = detailRequestCache.get(href);
  if (!entry) return;
  detailRequestCache.delete(href);
  detailRequestCacheBytes = Math.max(0, detailRequestCacheBytes - entry.bytes);
}

function formatProjectionValue(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value)
    ? value.toLocaleString(undefined, { maximumFractionDigits: 3 })
    : "—";
}
