"use client";

import { Star, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";

import { I18nText } from "@/components/i18n-text";
import { localizedText, useLanguage } from "@/components/localized-option";
import { cn } from "@/lib/cn";
import { compactPlayerDisplayName } from "@/lib/players/display-name";
import { compactTeamDisplayName } from "@/lib/teams/display";

type WatchlistSource = "machete" | "baltika";

type WatchlistPlayer = {
  id: string;
  name: string;
  teamName?: string | null;
  teamShortName?: string | null;
  position?: string | null;
  savedAt: string;
  updatedAt?: string;
};

type WatchlistPlayerInput = Omit<WatchlistPlayer, "savedAt" | "updatedAt">;

type WatchlistState = {
  players: WatchlistPlayer[];
  accountBacked: boolean;
  syncStarted: boolean;
  syncing: boolean;
};

const maxWatchlistPlayers = 32;
const watchlistChangeEvent = "fantasy-player-watchlist-change";
const watchlistStates = new Map<WatchlistSource, WatchlistState>();

export function PlayerWatchlistButton({
  source,
  player,
  className
}: {
  source: WatchlistSource;
  player: WatchlistPlayerInput;
  className?: string;
}) {
  const language = useLanguage();
  const [isWatched, setIsWatched] = useState(false);

  useEffect(() => subscribeToWatchlist(source, () => setIsWatched(readWatchlist(source).some((item) => item.id === player.id))), [player.id, source]);

  const label = isWatched
    ? localizedText(language, "Remove from watchlist", "Убрать из избранного")
    : localizedText(language, "Add to watchlist", "Добавить в избранное");

  return (
    <button
      type="button"
      onClick={() => {
        void toggleWatchlistPlayer(source, player);
      }}
      aria-pressed={isWatched}
      aria-label={label}
      className={cn(
        "inline-flex h-6 w-6 shrink-0 items-center justify-center rounded border text-xs transition",
        isWatched
          ? "border-amber-400 bg-amber-50 text-amber-600"
          : "border-slate-200 bg-white text-slate-500 hover:border-amber-300 hover:text-amber-600",
        className
      )}
    >
      <Star className={cn("h-3.5 w-3.5", isWatched && "fill-current")} />
    </button>
  );
}

export function PlayerWatchlistPanel({ source }: { source: WatchlistSource }) {
  const language = useLanguage();
  const [open, setOpen] = useState(false);
  const [players, setPlayers] = useState<WatchlistPlayer[]>([]);

  useEffect(() => subscribeToWatchlist(source, () => setPlayers(readWatchlist(source))), [source]);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        aria-label={localizedText(language, "Open watchlist", "Открыть избранное")}
        className="inline-flex items-center justify-center gap-2 rounded border border-slate-200 bg-white px-3 py-2 font-semibold text-slate-700 hover:bg-slate-50"
      >
        <Star className="h-4 w-4" />
        <span>
          <I18nText en="Watchlist" ru="Избранное" />
        </span>
        {players.length > 0 ? <span className="rounded-full bg-slate-100 px-1.5 text-[11px] text-slate-500">{players.length}</span> : null}
      </button>

      {open ? (
        <div className="absolute right-0 z-30 mt-2 w-[min(92vw,22rem)] rounded border border-slate-200 bg-white p-3 text-sm shadow-xl">
          <div className="max-h-72 space-y-1 overflow-y-auto">
            {players.map((player) => (
              <div key={player.id} className="flex items-center gap-2 rounded border border-slate-100 px-2 py-1.5">
                <div className="min-w-0 flex-1">
                  <span className="block truncate font-semibold text-ink" title={player.name}>{compactPlayerDisplayName(player.name)}</span>
                  <span className="block truncate text-xs text-slate-500" title={player.teamName ?? undefined}>
                    {[player.position, compactTeamDisplayName({ name: player.teamName, shortName: player.teamShortName })].filter(Boolean).join(" / ")}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    void removeWatchlistPlayer(source, player.id);
                  }}
                  aria-label={localizedText(language, "Remove watched player", "Удалить игрока из избранного")}
                  className="inline-flex h-8 w-8 items-center justify-center rounded text-rose-700 hover:bg-rose-50"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
            {players.length === 0 ? (
              <p className="rounded bg-slate-50 px-3 py-3 text-center text-sm text-slate-500">
                <I18nText en="No watched players yet." ru="В избранном пока нет игроков." />
              </p>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function subscribeToWatchlist(source: WatchlistSource, callback: () => void) {
  const sync = () => callback();
  const handle = window.setTimeout(() => {
    sync();
    ensureAccountWatchlistSync(source);
  }, 0);
  window.addEventListener("storage", sync);
  window.addEventListener(watchlistChangeEvent, sync);
  return () => {
    window.clearTimeout(handle);
    window.removeEventListener("storage", sync);
    window.removeEventListener(watchlistChangeEvent, sync);
  };
}

function readWatchlist(source: WatchlistSource) {
  return getWatchlistState(source).players;
}

async function toggleWatchlistPlayer(source: WatchlistSource, player: WatchlistPlayerInput) {
  const state = getWatchlistState(source);
  const exists = state.players.some((item) => item.id === player.id);

  if (state.accountBacked) {
    const accountPlayers = exists ? await deleteAccountWatchlistPlayer(source, player.id) : await saveAccountWatchlistPlayer(source, player);
    if (accountPlayers) {
      setWatchlistState(source, accountPlayers, true);
      return;
    }
    setWatchlistState(source, state.players, false);
  }

  const currentPlayers = getWatchlistState(source).players;
  const stillExists = currentPlayers.some((item) => item.id === player.id);
  const nextPlayers = stillExists
    ? currentPlayers.filter((item) => item.id !== player.id)
    : [{ ...player, savedAt: new Date().toISOString() }, ...currentPlayers.filter((item) => item.id !== player.id)].slice(0, maxWatchlistPlayers);
  setWatchlistState(source, nextPlayers, false);
}

async function removeWatchlistPlayer(source: WatchlistSource, playerId: string) {
  const state = getWatchlistState(source);

  if (state.accountBacked) {
    const accountPlayers = await deleteAccountWatchlistPlayer(source, playerId);
    if (accountPlayers) {
      setWatchlistState(source, accountPlayers, true);
      return;
    }
    setWatchlistState(source, state.players, false);
  }

  setWatchlistState(
    source,
    getWatchlistState(source).players.filter((player) => player.id !== playerId),
    false
  );
}

function ensureAccountWatchlistSync(source: WatchlistSource) {
  const state = getWatchlistState(source);
  if (state.syncStarted || state.syncing) return;
  state.syncStarted = true;
  void syncAccountWatchlist(source);
}

async function syncAccountWatchlist(source: WatchlistSource) {
  const state = getWatchlistState(source);
  if (state.syncing) return;

  state.syncing = true;
  const initialLocalPlayers = readLocalWatchlist(source);
  const accountPlayers = await fetchAccountWatchlist(source);
  state.syncing = false;

  if (!accountPlayers) {
    state.syncStarted = false;
    return;
  }

  let nextPlayers = accountPlayers;
  const localPlayersById = new Map<string, WatchlistPlayer>();
  for (const localPlayer of [...initialLocalPlayers, ...readLocalWatchlist(source)]) {
    localPlayersById.set(localPlayer.id, localPlayer);
  }
  for (const localPlayer of localPlayersById.values()) {
    if (nextPlayers.some((player) => player.id === localPlayer.id)) continue;
    const migratedPlayers = await saveAccountWatchlistPlayer(source, localPlayer);
    if (migratedPlayers) nextPlayers = migratedPlayers;
  }

  setWatchlistState(source, nextPlayers, true);
}

function getWatchlistState(source: WatchlistSource) {
  const existing = watchlistStates.get(source);
  if (existing) return existing;

  const state: WatchlistState = {
    players: readLocalWatchlist(source),
    accountBacked: false,
    syncStarted: false,
    syncing: false
  };
  watchlistStates.set(source, state);
  return state;
}

function setWatchlistState(source: WatchlistSource, players: WatchlistPlayer[], accountBacked: boolean) {
  const current = getWatchlistState(source);
  const nextPlayers = players.slice(0, maxWatchlistPlayers);
  watchlistStates.set(source, {
    ...current,
    players: nextPlayers,
    accountBacked
  });
  writeLocalWatchlist(source, nextPlayers);
  window.dispatchEvent(new Event(watchlistChangeEvent));
}

function readLocalWatchlist(source: WatchlistSource) {
  if (typeof window === "undefined") return [];
  const raw = window.localStorage.getItem(watchlistStorageKey(source));
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isWatchlistPlayer).slice(0, maxWatchlistPlayers);
  } catch {
    return [];
  }
}

function writeLocalWatchlist(source: WatchlistSource, players: WatchlistPlayer[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(watchlistStorageKey(source), JSON.stringify(players.slice(0, maxWatchlistPlayers)));
}

async function fetchAccountWatchlist(source: WatchlistSource) {
  try {
    const response = await fetch(`/api/user/watchlist?source=${source}`, { cache: "no-store" });
    if (!response.ok) return null;
    return watchlistPlayersFromPayload(await response.json());
  } catch {
    return null;
  }
}

async function saveAccountWatchlistPlayer(source: WatchlistSource, player: WatchlistPlayerInput) {
  try {
    const response = await fetch("/api/user/watchlist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ source, player })
    });
    if (!response.ok) return null;
    return watchlistPlayersFromPayload(await response.json());
  } catch {
    return null;
  }
}

async function deleteAccountWatchlistPlayer(source: WatchlistSource, playerId: string) {
  try {
    const params = new URLSearchParams({ source, playerKey: playerId });
    const response = await fetch(`/api/user/watchlist?${params.toString()}`, { method: "DELETE" });
    if (!response.ok) return null;
    return watchlistPlayersFromPayload(await response.json());
  } catch {
    return null;
  }
}

function watchlistPlayersFromPayload(payload: unknown) {
  if (!payload || typeof payload !== "object") return null;
  const players = (payload as { players?: unknown }).players;
  if (!Array.isArray(players)) return null;
  return players.filter(isWatchlistPlayer).slice(0, maxWatchlistPlayers);
}

function watchlistStorageKey(source: WatchlistSource) {
  return `fantasy-player-watchlist:${source}`;
}

function isWatchlistPlayer(value: unknown): value is WatchlistPlayer {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return typeof record.id === "string" && typeof record.name === "string" && typeof record.savedAt === "string";
}
