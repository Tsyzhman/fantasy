export const fantasySquadLeagueNavigationEvent = "fantasy-squad:league-navigation";

const historyParamNames = ["historyScope", "historyWindow", "historySeason"] as const;

let pendingLeagueId: string | null = null;
const pendingLeagueListeners = new Set<() => void>();

function notifyPendingLeagueListeners() {
  for (const listener of pendingLeagueListeners) listener();
}

export function buildFantasySquadLeagueHref(pathname: string, historyQuery: string, leagueId: string) {
  const normalizedLeagueId = leagueId.trim();
  if (!normalizedLeagueId) return pathname;

  const source = new URLSearchParams(historyQuery);
  const target = new URLSearchParams({ leagueId: normalizedLeagueId });
  for (const name of historyParamNames) {
    for (const value of source.getAll(name)) {
      const normalizedValue = value.trim();
      if (normalizedValue) target.append(name, normalizedValue);
    }
  }
  return `${pathname}?${target.toString()}`;
}

export function beginFantasySquadLeagueNavigation(leagueId: string) {
  const nextLeagueId = leagueId.trim() || null;
  if (pendingLeagueId === nextLeagueId) return pendingLeagueId;
  pendingLeagueId = nextLeagueId;
  notifyPendingLeagueListeners();
  return pendingLeagueId;
}

export function finishFantasySquadLeagueNavigation(leagueId?: string | null) {
  if (leagueId && pendingLeagueId !== leagueId) return;
  if (pendingLeagueId === null) return;
  pendingLeagueId = null;
  notifyPendingLeagueListeners();
}

export function fantasySquadPendingLeagueId() {
  return pendingLeagueId;
}

export function subscribeFantasySquadLeagueNavigation(listener: () => void) {
  pendingLeagueListeners.add(listener);
  return () => {
    pendingLeagueListeners.delete(listener);
  };
}

export function fantasySquadLeagueNavigationTarget(event: Event) {
  if (!(event instanceof CustomEvent)) return null;
  const detail = event.detail as { leagueId?: unknown } | null;
  return typeof detail?.leagueId === "string" && detail.leagueId.trim()
    ? detail.leagueId.trim()
    : null;
}
