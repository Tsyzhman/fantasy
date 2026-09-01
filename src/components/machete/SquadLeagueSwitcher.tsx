"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, useEffect, useRef, useSyncExternalStore, useTransition } from "react";

import { I18nText } from "@/components/i18n-text";
import {
  beginFantasySquadLeagueNavigation,
  buildFantasySquadLeagueHref,
  fantasySquadLeagueNavigationEvent,
  fantasySquadPendingLeagueId,
  finishFantasySquadLeagueNavigation,
  subscribeFantasySquadLeagueNavigation
} from "@/machete/squad-league-navigation";

type SquadLeagueOption = {
  leagueId: string;
  label: string;
};

type SquadLeagueSwitcherProps = {
  pathname: string;
  selectedLeagueId: string;
  historyQuery: string;
  leagues: SquadLeagueOption[];
};

const hardNavigationFallbackMs = 8_000;

export function SquadLeagueSwitcher({ pathname, selectedLeagueId, historyQuery, leagues }: SquadLeagueSwitcherProps) {
  const router = useRouter();
  const [transitionPending, startTransition] = useTransition();
  const requestedLeagueId = useSyncExternalStore(
    subscribeFantasySquadLeagueNavigation,
    fantasySquadPendingLeagueId,
    () => null
  );
  const committedLeagueIdRef = useRef(selectedLeagueId);
  const requestedLeagueIdRef = useRef<string | null>(null);
  const fallbackTimerRef = useRef<number | null>(null);

  function clearFallbackTimer() {
    if (!fallbackTimerRef.current) return;
    window.clearTimeout(fallbackTimerRef.current);
    fallbackTimerRef.current = null;
  }

  useEffect(() => {
    committedLeagueIdRef.current = selectedLeagueId;
  }, [selectedLeagueId]);

  useEffect(() => {
    if (!requestedLeagueId) {
      requestedLeagueIdRef.current = null;
      clearFallbackTimer();
    }
  }, [requestedLeagueId]);

  useEffect(() => () => {
    clearFallbackTimer();
    finishFantasySquadLeagueNavigation(requestedLeagueIdRef.current);
  }, []);

  function navigate(nextLeagueId: string) {
    if (!leagues.some((league) => league.leagueId === nextLeagueId)) return;
    const href = buildFantasySquadLeagueHref(pathname, historyQuery, nextLeagueId);
    const previousRequest = requestedLeagueIdRef.current;
    if (!previousRequest && nextLeagueId === committedLeagueIdRef.current) return;

    requestedLeagueIdRef.current = nextLeagueId;
    beginFantasySquadLeagueNavigation(nextLeagueId);
    clearFallbackTimer();

    window.dispatchEvent(new CustomEvent(fantasySquadLeagueNavigationEvent, {
      detail: { leagueId: nextLeagueId }
    }));

    // Returning to the still-rendered league after another navigation has
    // already been dispatched cannot revive its aborted player-pool request.
    // A direct reload is the rare, deterministic recovery path for that case.
    if (previousRequest && nextLeagueId === committedLeagueIdRef.current) {
      window.location.replace(href);
      return;
    }

    startTransition(() => {
      router.replace(href, { scroll: false });
    });

    fallbackTimerRef.current = window.setTimeout(() => {
      fallbackTimerRef.current = null;
      if (fantasySquadPendingLeagueId() !== nextLeagueId) return;
      if (window.location.href === new URL(href, window.location.href).href) {
        window.location.reload();
      } else {
        window.location.replace(href);
      }
    }, hardNavigationFallbackMs);
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    navigate(requestedLeagueId ?? selectedLeagueId);
  }

  const requestedLeague = requestedLeagueId
    ? leagues.find((league) => league.leagueId === requestedLeagueId) ?? null
    : null;
  const pending = Boolean(requestedLeagueId) || transitionPending;

  return (
    <form
      onSubmit={submit}
      aria-busy={pending}
      className="mt-3 grid grid-cols-[minmax(0,1fr)_auto] gap-2 sm:max-w-xl"
      data-squad-league-switcher
    >
      <label className="text-sm">
        <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
          <I18nText en="Sports.ru league" ru="Лига Sports.ru" />
        </span>
        <select
          name="leagueId"
          value={requestedLeagueId ?? selectedLeagueId}
          onChange={(event) => navigate(event.target.value)}
          className="min-h-12 w-full rounded border border-slate-200 bg-white px-3 py-2 text-base"
        >
          {leagues.map((league) => (
            <option key={league.leagueId} value={league.leagueId}>{league.label}</option>
          ))}
        </select>
      </label>
      <button type="submit" className="ui-button ui-button-primary min-h-12 self-end px-4" disabled={pending}>
        {pending ? <I18nText en="Loading…" ru="Загрузка…" /> : <I18nText en="Load" ru="Загрузить" />}
      </button>
      {requestedLeague ? (
        <span className="col-span-2 text-xs font-semibold text-sky-700" role="status" aria-live="polite">
          <I18nText
            en={`Opening ${requestedLeague.label}. The previous player download has been stopped.`}
            ru={`Открываю ${requestedLeague.label}. Выгрузка игроков прошлой лиги остановлена.`}
          />
        </span>
      ) : null}
    </form>
  );
}

export function SquadLeagueCommit({ leagueId }: { leagueId: string }) {
  useEffect(() => {
    finishFantasySquadLeagueNavigation(leagueId);
  }, [leagueId]);

  return null;
}
