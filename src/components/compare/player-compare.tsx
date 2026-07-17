"use client";

import Link from "next/link";
import { ArrowRight, Check, Columns2, Plus, Trash2, X } from "lucide-react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type KeyboardEvent,
  type ReactNode
} from "react";

import { I18nText } from "@/components/i18n-text";
import { localizedText, useLanguage } from "@/components/localized-option";
import { cn } from "@/lib/cn";
import { compactTeamDisplayName } from "@/lib/teams/display";

export type CompareSource = "machete" | "baltika";

export type ComparePlayer = {
  id: string;
  name: string;
  position?: string | null;
  teamName?: string | null;
  teamShortName?: string | null;
};

type CompareContextValue = {
  source: CompareSource;
  players: ComparePlayer[];
  isOpen: boolean;
  setOpen: (open: boolean) => void;
  add: (player: ComparePlayer) => void;
  remove: (id: string) => void;
  clear: () => void;
};

const CompareContext = createContext<CompareContextValue | null>(null);
const MAX_PLAYERS = 4;
const DND_MIME = "application/x-player-compare";

function storageKey(source: CompareSource) {
  return `player-compare:${source}`;
}

export function PlayerCompareProvider({
  source,
  children
}: {
  source: CompareSource;
  children: ReactNode;
}) {
  const [players, setPlayers] = useState<ComparePlayer[]>([]);
  const [isOpen, setOpen] = useState(false);
  const hydrated = useRef(false);

  useEffect(() => {
    hydrated.current = false;
    const timeout = window.setTimeout(() => {
      try {
        const raw = sessionStorage.getItem(storageKey(source));
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) setPlayers(parsed.slice(0, MAX_PLAYERS));
        }
      } catch {
        // ignore
      }
      hydrated.current = true;
    }, 0);

    return () => window.clearTimeout(timeout);
  }, [source]);

  useEffect(() => {
    if (!hydrated.current) return;
    try {
      sessionStorage.setItem(storageKey(source), JSON.stringify(players));
    } catch {
      // ignore
    }
  }, [source, players]);

  const add = useCallback((player: ComparePlayer) => {
    setPlayers((prev) => {
      if (prev.some((existing) => existing.id === player.id)) return prev;
      if (prev.length >= MAX_PLAYERS) return prev;
      return [...prev, player];
    });
  }, []);

  const remove = useCallback((id: string) => {
    setPlayers((prev) => prev.filter((player) => player.id !== id));
  }, []);

  const clear = useCallback(() => setPlayers([]), []);

  const value = useMemo(
    () => ({ source, players, isOpen, setOpen, add, remove, clear }),
    [source, players, isOpen, add, remove, clear]
  );

  return <CompareContext.Provider value={value}>{children}</CompareContext.Provider>;
}

function useCompareContext() {
  const ctx = useContext(CompareContext);
  if (!ctx) throw new Error("usePlayerCompare must be used inside PlayerCompareProvider");
  return ctx;
}

export function PlayerCompareToggle({ className }: { className?: string }) {
  const language = useLanguage();
  const { players, isOpen, setOpen } = useCompareContext();
  const count = players.length;
  const label = isOpen
    ? localizedText(language, "Hide comparison panel", "Скрыть панель сравнения")
    : localizedText(language, "Compare players", "Сравнить игроков");

  return (
    <button
      type="button"
      onClick={() => setOpen(!isOpen)}
      aria-expanded={isOpen}
      aria-controls="player-compare-dock"
      aria-label={label}
      className={cn(
        "inline-flex items-center gap-1.5 rounded border px-3 py-1.5 text-xs font-semibold uppercase tracking-wide transition",
        isOpen
          ? "border-brand-500 bg-brand-50 text-brand-700"
          : "border-slate-300 bg-white text-slate-600 hover:border-brand-400 hover:text-brand-600",
        className
      )}
    >
      <Columns2 className="h-3.5 w-3.5" />
      <span><I18nText en="Compare" ru="Сравнить" /></span>
      {count > 0 ? (
        <span className="ml-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-brand-500 px-1 text-[10px] font-bold text-white">
          {count}
        </span>
      ) : null}
    </button>
  );
}

export function PlayerComparePickButton({
  player,
  className
}: {
  player: ComparePlayer;
  className?: string;
}) {
  const language = useLanguage();
  const ctx = useContext(CompareContext);
  if (!ctx) return null;
  const compare = ctx;

  const isSelected = compare.players.some((existing) => existing.id === player.id);
  const isFull = !isSelected && compare.players.length >= MAX_PLAYERS;
  const label = isSelected
    ? localizedText(language, `Remove ${player.name} from comparison`, `Убрать ${player.name} из сравнения`)
    : isFull
      ? localizedText(language, `Comparison is full (${MAX_PLAYERS} players)`, `В сравнении уже ${MAX_PLAYERS} игрока`)
      : localizedText(language, `Add ${player.name} to comparison`, `Добавить ${player.name} в сравнение`);

  function handleClick() {
    if (isSelected) {
      compare.remove(player.id);
      return;
    }
    if (isFull) return;
    compare.add(player);
    compare.setOpen(true);
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={isFull}
      aria-label={label}
      aria-pressed={isSelected}
      className={cn(
        "inline-flex h-6 w-6 shrink-0 items-center justify-center rounded border text-xs transition",
        isSelected
          ? "border-brand-500 bg-brand-50 text-brand-700"
          : "border-slate-200 bg-white text-slate-500 hover:border-brand-400 hover:text-brand-600",
        isFull ? "cursor-not-allowed opacity-45 hover:border-slate-200 hover:text-slate-500" : "",
        className
      )}
    >
      {isSelected ? <Check className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
      <span className="sr-only">{label}</span>
    </button>
  );
}

export function PlayerCompareDock() {
  const { players, isOpen, add, remove, clear, source } = useCompareContext();
  const [dragOver, setDragOver] = useState(false);

  if (!isOpen) return null;

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragOver(false);
    const raw = event.dataTransfer.getData(DND_MIME);
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw) as ComparePlayer;
      if (parsed?.id && parsed?.name) add(parsed);
    } catch {
      // ignore
    }
  };

  const handleDragOver = (event: DragEvent<HTMLDivElement>) => {
    if (event.dataTransfer.types.includes(DND_MIME)) {
      event.preventDefault();
      setDragOver(true);
      event.dataTransfer.dropEffect = "copy";
    }
  };

  const handleDragLeave = () => setDragOver(false);

  const slots: Array<ComparePlayer | null> = Array.from({ length: MAX_PLAYERS }, (_, index) => players[index] ?? null);
  const compareDisabled = players.length < 2;
  const compareHref = compareDisabled
    ? "#"
    : `/compare?source=${source}&ids=${encodeURIComponent(players.map((p) => p.id).join(","))}`;

  return (
    <div
      id="player-compare-dock"
      className="mt-3 rounded border border-dashed border-brand-300 bg-brand-50/50 p-3 shadow-soft"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-brand-700">
          <I18nText en={`Pick 2-${MAX_PLAYERS} players`} ru={`Выберите 2-${MAX_PLAYERS} игроков`} />
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={compareHref}
            aria-disabled={compareDisabled}
            onClick={(event) => {
              if (compareDisabled) event.preventDefault();
            }}
            className={cn(
              "inline-flex items-center gap-1 rounded px-3 py-1.5 text-xs font-semibold uppercase tracking-wide transition",
              compareDisabled
                ? "cursor-not-allowed bg-slate-200 text-slate-400"
                : "bg-brand-600 text-white hover:bg-brand-700"
            )}
          >
            <span><I18nText en="Compare" ru="Сравнить" /></span>
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
          <button
            type="button"
            onClick={clear}
            disabled={players.length === 0}
            className="inline-flex items-center gap-1 rounded border border-slate-300 bg-white px-2 py-1.5 text-xs font-semibold text-slate-500 transition hover:border-slate-400 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Trash2 className="h-3.5 w-3.5" />
            <span><I18nText en="Clear" ru="Очистить" /></span>
          </button>
        </div>
      </div>
      <div
        className={cn(
          "mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4",
          dragOver ? "ring-2 ring-brand-400 ring-offset-2 ring-offset-white" : ""
        )}
      >
        {slots.map((player, index) => (
          <CompareSlot key={index} player={player} index={index} onRemove={remove} />
        ))}
      </div>
    </div>
  );
}

function CompareSlot({
  player,
  index,
  onRemove
}: {
  player: ComparePlayer | null;
  index: number;
  onRemove: (id: string) => void;
}) {
  const language = useLanguage();
  if (!player) {
    return (
      <div className="flex h-14 items-center justify-center rounded border border-dashed border-slate-300 bg-white/60 text-[11px] uppercase tracking-wide text-slate-400">
        <I18nText en={`Slot ${index + 1}`} ru={`Слот ${index + 1}`} />
      </div>
    );
  }
  return (
    <div className="flex h-14 items-center justify-between rounded border border-brand-300 bg-white px-2 py-1 text-xs shadow-sm">
      <div className="min-w-0 flex-1">
        <div className="truncate font-semibold text-ink" title={player.name}>
          {player.name}
        </div>
        <div className="truncate text-[11px] text-slate-500" title={player.teamName ?? undefined}>
          {[player.position, compactTeamDisplayName({ name: player.teamName, shortName: player.teamShortName })].filter(Boolean).join(" / ") || "-"}
        </div>
      </div>
      <button
        type="button"
        onClick={() => onRemove(player.id)}
        aria-label={localizedText(language, `Remove ${player.name} from comparison`, `Убрать ${player.name} из сравнения`)}
        className="ml-1 flex h-5 w-5 items-center justify-center rounded-full text-slate-400 hover:bg-rose-50 hover:text-rose-600"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

export function PlayerCompareDraggable({
  player,
  children,
  className
}: {
  player: ComparePlayer;
  children: ReactNode;
  className?: string;
}) {
  const language = useLanguage();
  const ctx = useContext(CompareContext);

  const handleDragStart = (event: DragEvent<HTMLSpanElement>) => {
    event.dataTransfer.setData(DND_MIME, JSON.stringify(player));
    event.dataTransfer.effectAllowed = "copy";
  };

  const handleDoubleClick = () => {
    ctx?.add(player);
    ctx?.setOpen(true);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLSpanElement>) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    handleDoubleClick();
  };

  return (
    <span
      role="button"
      tabIndex={0}
      draggable
      onDragStart={handleDragStart}
      onDoubleClick={handleDoubleClick}
      onKeyDown={handleKeyDown}
      aria-label={localizedText(language, `Add ${player.name} to comparison`, `Добавить ${player.name} в сравнение`)}
      className={cn("inline-flex cursor-grab items-center outline-none focus-visible:ring-2 focus-visible:ring-brand-400 active:cursor-grabbing", className)}
    >
      {children}
    </span>
  );
}
