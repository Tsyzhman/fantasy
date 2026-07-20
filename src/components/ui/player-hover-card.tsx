"use client";

import type { ReactNode } from "react";
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

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
  const tooltipId = useId();
  const triggerRef = useRef<HTMLSpanElement>(null);
  const panelRef = useRef<HTMLSpanElement>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ left: 8, top: 8 });

  const cancelClose = useCallback(() => {
    if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    closeTimerRef.current = null;
  }, []);

  const show = useCallback(() => {
    cancelClose();
    setOpen(true);
  }, [cancelClose]);

  const scheduleClose = useCallback(() => {
    cancelClose();
    closeTimerRef.current = setTimeout(() => setOpen(false), 90);
  }, [cancelClose]);

  const updatePosition = useCallback(() => {
    const triggerElement = triggerRef.current;
    if (!triggerElement) return;

    const triggerRect = triggerElement.getBoundingClientRect();
    const panelWidth = panelRef.current?.offsetWidth ?? 280;
    const panelHeight = panelRef.current?.offsetHeight ?? 260;
    const gutter = 8;
    const gap = 6;
    const maxLeft = Math.max(gutter, window.innerWidth - panelWidth - gutter);
    const left = Math.min(Math.max(triggerRect.left, gutter), maxLeft);
    const below = triggerRect.bottom + gap;
    const above = triggerRect.top - panelHeight - gap;
    const top = below + panelHeight <= window.innerHeight - gutter
      ? below
      : Math.max(gutter, above);

    setPosition({ left, top });
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    updatePosition();
  }, [open, updatePosition]);

  useEffect(() => {
    if (!open) return;
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [open, updatePosition]);

  useEffect(() => () => cancelClose(), [cancelClose]);

  return (
    <span
      ref={triggerRef}
      className={cn("hover-card-trigger", className)}
      tabIndex={0}
      aria-describedby={open ? tooltipId : undefined}
      onMouseEnter={show}
      onMouseLeave={scheduleClose}
      onFocus={show}
      onBlur={scheduleClose}
    >
      {trigger}
      {open && typeof document !== "undefined" ? createPortal(
        <span
          ref={panelRef}
          id={tooltipId}
          className="hover-card-panel"
          role="tooltip"
          style={{ left: position.left, top: position.top }}
          onMouseEnter={cancelClose}
          onMouseLeave={scheduleClose}
        >
          <PlayerHoverCardContent player={player} />
        </span>,
        document.body
      ) : null}
    </span>
  );
}

export function PlayerHoverCardContent({ player }: { player: PlayerHoverCardData }) {
  return (
    <>
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
          <ScoreBlock tone="amber" label="vFP" value={player.altFp ?? 0} />
        </div>

        {player.fixtures && player.fixtures.length > 0 ? (
          <div className="mt-2">
            <span className="block text-[10px] font-semibold uppercase tracking-wide text-slate-500">
              <I18nText en="Next fixtures" ru="Ближайшие матчи" />
            </span>
            <FdrRow className="mt-1" fixtures={player.fixtures.slice(0, 6)} />
          </div>
        ) : null}
    </>
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
