"use client";

import { Copy, Crown, FilePlus2, Layers3, ListChecks, Lock, MoreHorizontal, Plus, Save, Search, Sparkles, Trash2, Users, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { type DragEvent, type SetStateAction, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";

import { I18nText } from "@/components/i18n-text";
import { LocalizedOption, localizedText, useLanguage } from "@/components/localized-option";
import { fixtureChipPresentations } from "@/components/machete/fantasy-squad-ui";
import { SortableTable } from "@/components/sortable-table";
import { FdrRow } from "@/components/ui/fdr-pill";
import { SegmentedControl, type SegmentedOption } from "@/components/ui/segmented-control";
import type {
  FantasySquadWorkerRequest,
  FantasySquadWorkerResponse,
  TransferSuggestionWorkerInput
} from "@/components/machete/fantasy-squad-worker-contract";
import { formatDate, formatNumber, formatScore } from "@/lib/format";
import { cn } from "@/lib/cn";
import { compactPlayerDisplayName } from "@/lib/players/display-name";
import {
  betaSessionHasMilestone,
  recordBetaClientError,
  recordBetaMilestone
} from "@/lib/beta-telemetry-client";
import {
  canStartFantasyPlayer,
  countFantasySquadTransfers,
  createFantasySquadRoundPlans,
  fantasyAddBlockReason,
  fantasyTransferLimitForHorizon,
  nextFantasyPoints,
  normalizeFantasyHorizon,
  optimizeFantasySquad,
  optimizeFantasyStarters,
  playerHorizonPoints,
  selectionForPlayer,
  selectionForNewPlayer,
  summarizeFantasySquad,
  updateFantasySquadRoundPlan,
  type FantasyPlannerPlayer,
  type FantasyPositionGroup,
  type FantasyRoundProjection,
  type FantasySquadRules,
  type FantasySquadRoundPlan,
  type FantasySquadOptimizationInput,
  type FantasySquadSelection,
  type FantasySquadStrategy,
  type TransferPlanSuggestion
} from "@/machete/squad_logic";
import type { SavedFantasySquad, SavedFantasySquadOption } from "@/machete/squad_planner";
import type { PlannerReadiness } from "@/machete/planner_readiness";
import {
  applyFantasyHistorySearchParams,
  fantasyHistoryScopes,
  fantasyHistorySettingsKey,
  fantasyHistoryWindows,
  type FantasyHistoryScope,
  type FantasyHistorySettings,
  type FantasyHistoryWindow
} from "@/machete/squad-history-settings";

type FantasySquadPlannerProps = {
  leagueId: string;
  season: string;
  rules: FantasySquadRules;
  rounds: FantasyRoundProjection[];
  players: FantasyPlannerPlayer[];
  playerPoolHref?: string;
  initialSquad: SavedFantasySquad;
  savedSquads: SavedFantasySquadOption[];
  readiness: PlannerReadiness;
  priceStatus: {
    sportsRuPrices: number;
    estimatedPrices: number;
    lastSyncedAt: string | null;
  };
  historySettings: FantasyHistorySettings;
  historySeasonOptions: string[];
};

const positionOrder: FantasyPositionGroup[] = ["GK", "DEF", "MID", "FWD", "UNK"];
const squadDragDataType = "application/x-fantasy-player-id";
const fantasySquadOptimizationSafetyTimeoutMs = 15_000;

type UiLanguage = ReturnType<typeof useLanguage>;
type MobileTab = "squad" | "pool" | "suggestions";
type StoredSquadCaptains = {
  captainId: string | null;
  viceCaptainId: string | null;
};

function optimizeFantasySquadOffThread(input: FantasySquadOptimizationInput) {
  if (typeof Worker === "undefined") return Promise.resolve(optimizeFantasySquad(input));

  return new Promise<FantasySquadSelection[] | null>((resolve, reject) => {
    const worker = new Worker(new URL("./FantasySquadOptimizer.worker.ts", import.meta.url), {
      name: "fantasy-squad-optimizer"
    });
    const timeout = window.setTimeout(() => {
      worker.terminate();
      reject(new Error("FANTASY_SQUAD_OPTIMIZER_TIMEOUT"));
    }, fantasySquadOptimizationSafetyTimeoutMs);
    const finish = () => {
      window.clearTimeout(timeout);
      worker.terminate();
    };

    worker.onmessage = (event: MessageEvent<FantasySquadWorkerResponse>) => {
      finish();
      if (event.data.error || event.data.kind !== "OPTIMIZE_SQUAD") {
        reject(new Error("FANTASY_SQUAD_OPTIMIZER_FAILED"));
        return;
      }
      resolve(event.data.optimized);
    };
    worker.onerror = () => {
      finish();
      reject(new Error("FANTASY_SQUAD_OPTIMIZER_FAILED"));
    };
    const request: FantasySquadWorkerRequest = { kind: "OPTIMIZE_SQUAD", input };
    worker.postMessage(request);
  });
}

function buildTransferSuggestionsOffThread(input: TransferSuggestionWorkerInput) {
  if (typeof Worker === "undefined") return failedTransferSuggestionTask("FANTASY_TRANSFER_SUGGESTIONS_WORKER_UNAVAILABLE");
  let worker: Worker;
  try {
    worker = new Worker(new URL("./FantasySquadOptimizer.worker.ts", import.meta.url), {
      name: "fantasy-transfer-suggestions"
    });
  } catch {
    return failedTransferSuggestionTask("FANTASY_TRANSFER_SUGGESTIONS_WORKER_UNAVAILABLE");
  }
  let rejectTask: ((reason: Error) => void) | null = null;
  let timeout: number | null = null;
  const promise = new Promise<TransferPlanSuggestion[]>((resolve, reject) => {
    rejectTask = reject;
    timeout = window.setTimeout(() => {
      worker.terminate();
      reject(new Error("FANTASY_TRANSFER_SUGGESTIONS_TIMEOUT"));
    }, fantasySquadOptimizationSafetyTimeoutMs);
    const finish = () => {
      if (timeout !== null) window.clearTimeout(timeout);
      timeout = null;
      worker.terminate();
    };
    worker.onmessage = (event: MessageEvent<FantasySquadWorkerResponse>) => {
      finish();
      if (event.data.error || event.data.kind !== "BUILD_TRANSFER_SUGGESTIONS") {
        reject(new Error("FANTASY_TRANSFER_SUGGESTIONS_FAILED"));
        return;
      }
      resolve(event.data.suggestions);
    };
    worker.onerror = () => {
      finish();
      reject(new Error("FANTASY_TRANSFER_SUGGESTIONS_FAILED"));
    };
    const request: FantasySquadWorkerRequest = { kind: "BUILD_TRANSFER_SUGGESTIONS", input };
    worker.postMessage(request);
  });
  return {
    promise,
    cancel() {
      if (timeout !== null) window.clearTimeout(timeout);
      timeout = null;
      worker.terminate();
      rejectTask?.(new Error("FANTASY_TRANSFER_SUGGESTIONS_CANCELLED"));
      rejectTask = null;
    }
  };
}

function failedTransferSuggestionTask(code: string) {
  return {
    promise: Promise.reject<TransferPlanSuggestion[]>(new Error(code)),
    cancel() {}
  };
}

type SquadDiff = {
  changeCount: number;
  added: number;
  removed: number;
  starterChanges: number;
  lockChanges: number;
  captainChanges: number;
  transferCount: number;
  nextDelta: number;
  horizonDelta: number;
};

type TransferSuggestionCalculation = {
  players: FantasyPlannerPlayer[];
  selections: FantasySquadSelection[];
  rules: FantasySquadRules;
  horizon: number;
  availableSuggestionCount: number;
  suggestions: TransferPlanSuggestion[];
};

export function FantasySquadPlanner({ leagueId, season, rules, rounds, players: initialPlayers, playerPoolHref, initialSquad, savedSquads, readiness, priceStatus, historySettings, historySeasonOptions }: FantasySquadPlannerProps) {
  const language = useLanguage();
  const router = useRouter();
  const budgetForecastRef = useRef<HTMLDivElement>(null);
  const suggestionPanelRef = useRef<HTMLDivElement>(null);
  const [sourcePlayers, setSourcePlayers] = useState<FantasyPlannerPlayer[]>(initialPlayers);
  const [activeRoundOffset, setActiveRoundOffset] = useState(0);
  const players = useMemo(
    () => sourcePlayers.map((player) => fantasyPlayerAtRoundOffset(player, activeRoundOffset)),
    [activeRoundOffset, sourcePlayers]
  );
  const [playerPoolPending, setPlayerPoolPending] = useState(Boolean(playerPoolHref));
  const [playerPoolFailed, setPlayerPoolFailed] = useState(false);
  const [historyScopeDraft, setHistoryScopeDraft] = useState<FantasyHistoryScope>(historySettings.scope);
  const [historyWindowDraft, setHistoryWindowDraft] = useState<FantasyHistoryWindow>(historySettings.window);
  const [historySeasonsDraft, setHistorySeasonsDraft] = useState(historySettings.selectedSeasons);
  const [historyApplying, setHistoryApplying] = useState(false);
  const [playerPoolRetry, setPlayerPoolRetry] = useState(0);
  const initialHorizon = normalizeFantasyHorizon(initialSquad.horizonRounds, rules.horizonOptions);
  const initialSelections = useMemo(() => normalizeInitialSelections(initialSquad.selections, sourcePlayers, rules), [initialSquad.selections, rules, sourcePlayers]);
  const initialRoundPlans = normalizePlannerRoundPlans(initialSquad.roundPlans, initialSelections, sourcePlayers, rules);
  const [roundPlans, setRoundPlans] = useState<FantasySquadRoundPlan[]>(() => initialRoundPlans);
  const [savedRoundPlans, setSavedRoundPlans] = useState<FantasySquadRoundPlan[]>(() => cloneFantasyRoundPlans(initialRoundPlans));
  const selections = roundPlans[activeRoundOffset]?.selections ?? [];
  const savedSelections = savedRoundPlans[activeRoundOffset]?.selections ?? [];
  const [activeSquadId, setActiveSquadId] = useState<string | null>(initialSquad.id);
  const [squadName, setSquadName] = useState(initialSquad.name);
  const [squadOptions, setSquadOptions] = useState<SavedFantasySquadOption[]>(savedSquads);
  const captainStorageKey = `fantasy-squad-captains:${leagueId}:${season}:${activeSquadId ?? "new"}:${activeRoundOffset}`;
  const [horizon, setHorizon] = useState(initialHorizon);
  const [query, setQuery] = useState("");
  const [positionFilter, setPositionFilter] = useState("ALL");
  const [starterPoolFilter, setStarterPoolFilter] = useState("ALL");
  const [onlyAffordable, setOnlyAffordable] = useState(false);
  const [autoPickStrategy, setAutoPickStrategy] = useState<FantasySquadStrategy>("balanced");
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [savePending, setSavePending] = useState(false);
  const [deletePending, setDeletePending] = useState(false);
  const interactionPending = isPending || savePending || deletePending;
  const [mobileTab, setMobileTab] = useState<MobileTab>("squad");
  const [showAllSuggestions, setShowAllSuggestions] = useState(false);
  const [draggedPlayerId, setDraggedPlayerId] = useState<string | null>(null);
  const [postLoadContentReady, setPostLoadContentReady] = useState(false);
  const [betaAutoPickComplete, setBetaAutoPickComplete] = useState(false);
  const [autoPickPending, setAutoPickPending] = useState(false);
  const autoPickRevisionRef = useRef(0);
  const playerPoolReady = !playerPoolHref || (!playerPoolPending && !playerPoolFailed);
  const historyDraft: FantasyHistorySettings = {
    scope: historyScopeDraft,
    window: historyWindowDraft,
    selectedSeasons: historyWindowDraft === "SELECTED_SEASONS" ? historySeasonsDraft : []
  };
  const historySelectionChanged = fantasyHistorySettingsKey(historyDraft) !== fantasyHistorySettingsKey(historySettings);
  const hasRealRoundProjections = useMemo(
    () => rounds.length > 0 && players.some((player) => player.roundPoints.some((value) => Number.isFinite(value) && value !== 0)),
    [players, rounds.length]
  );
  const plannerForecastReady = readiness.ready && hasRealRoundProjections;

  function setSelections(action: SetStateAction<FantasySquadSelection[]>) {
    setRoundPlans((current) => {
      const currentSelections = current[activeRoundOffset]?.selections ?? [];
      const nextSelections = typeof action === "function" ? action(currentSelections) : action;
      if (nextSelections === currentSelections) return current;
      return updateFantasySquadRoundPlan(current, activeRoundOffset, nextSelections);
    });
  }

  function inheritPreviousRound() {
    if (activeRoundOffset === 0) return;
    setRoundPlans((current) => {
      return updateFantasySquadRoundPlan(current, activeRoundOffset, current[activeRoundOffset - 1].selections, true);
    });
    setMessage(localizedText(language, "This round now inherits the previous squad.", "Этот тур снова наследует предыдущий состав."));
  }

  useEffect(() => {
    autoPickRevisionRef.current += 1;
  }, [autoPickStrategy, horizon, players, rules, selections]);

  const selectionsByPlayerId = useMemo(() => new Map(selections.map((selection) => [selection.playerId, selection])), [selections]);
  const selectedPlayerIds = useMemo(() => new Set(selections.map((selection) => selection.playerId)), [selections]);
  const captainId = useMemo(() => selections.find((selection) => selection.isCaptain)?.playerId ?? null, [selections]);
  const viceCaptainId = useMemo(() => selections.find((selection) => selection.isViceCaptain)?.playerId ?? null, [selections]);
  const summary = useMemo(() => summarizeFantasySquad(players, selections, rules, horizon), [players, selections, rules, horizon]);
  const savedSummary = useMemo(() => summarizeFantasySquad(players, savedSelections, rules, horizon), [players, savedSelections, rules, horizon]);
  const squadDiff = useMemo(() => buildSquadDiff(savedSelections, selections, savedSummary, summary), [savedSelections, selections, savedSummary, summary]);
  const transferBaselineSelections = activeRoundOffset > 0 ? roundPlans[activeRoundOffset - 1].selections : savedSelections;
  const hasFullSquad = summary.selectedPlayers.length === rules.squadSize;
  const squadIsValid =
    hasFullSquad &&
    summary.starterPlayers.length === rules.starterSize &&
    summary.benchPlayers.length === rules.benchSize &&
    summary.violations.length === 0;
  const transferLimit = fantasyTransferLimitForHorizon(activeRoundOffset > 0 ? 1 : horizon);
  const transferLimitIsActive = transferBaselineSelections.length === rules.squadSize;
  const plannedTransferCount = countFantasySquadTransfers(transferBaselineSelections, selections);
  const availableSuggestionCount = transferLimitIsActive ? Math.max(0, transferLimit - plannedTransferCount) : transferLimit;
  const [suggestionCalculation, setSuggestionCalculation] = useState<TransferSuggestionCalculation | null>(null);
  const [failedSuggestionCalculation, setFailedSuggestionCalculation] = useState<TransferSuggestionCalculation | null>(null);
  const [suggestionRetry, setSuggestionRetry] = useState(0);
  const suggestionsAreCurrent =
    suggestionCalculation?.players === players &&
    suggestionCalculation.selections === selections &&
    suggestionCalculation.rules === rules &&
    suggestionCalculation.horizon === horizon &&
    suggestionCalculation.availableSuggestionCount === availableSuggestionCount;
  const suggestions = suggestionsAreCurrent ? suggestionCalculation.suggestions : [];
  const suggestionsPending = plannerForecastReady && !suggestionsAreCurrent;
  const suggestionsFailed =
    failedSuggestionCalculation?.players === players &&
    failedSuggestionCalculation.selections === selections &&
    failedSuggestionCalculation.rules === rules &&
    failedSuggestionCalculation.horizon === horizon &&
    failedSuggestionCalculation.availableSuggestionCount === availableSuggestionCount;
  const displayedSuggestions = showAllSuggestions ? suggestions : suggestions.slice(0, 3);
  const transferCostUnconfigured = suggestions.some((suggestion) => suggestion.paidTransferLoss === null);
  const filteredPlayers = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return players
      .filter((player) => (positionFilter === "ALL" ? true : player.positionGroup === positionFilter))
      .filter((player) =>
        normalizedQuery
          ? `${player.name} ${player.teamName} ${player.teamShortName ?? ""} ${player.position ?? ""}`.toLowerCase().includes(normalizedQuery)
          : true
      )
      .filter((player) => {
        const selection = selectionsByPlayerId.get(player.playerId);
        if (starterPoolFilter === "STARTER") return selection?.isStarter === true;
        if (starterPoolFilter === "BENCH") return selection?.isStarter === false;
        return true;
      })
      .filter((player) => (onlyAffordable ? fantasyAddBlockReason(player, players, selections, rules) === null || selectionsByPlayerId.has(player.playerId) : true))
      .slice(0, 140);
  }, [onlyAffordable, players, positionFilter, query, rules, selections, selectionsByPlayerId, starterPoolFilter]);

  useEffect(() => {
    void recordBetaMilestone("PLANNER_OPENED");
  }, []);

  useEffect(() => {
    if (!initialSquad.id || initialSquad.selections.length !== rules.squadSize || savedSummary.violations.length > 0) return;
    const navigation = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
    if (navigation?.type !== "reload" || !betaSessionHasMilestone("SQUAD_SAVED")) return;
    void recordBetaMilestone("SQUAD_RESTORED");
  }, [initialSquad.id, initialSquad.selections.length, rules.squadSize, savedSummary.violations.length]);

  useEffect(() => {
    if (!betaAutoPickComplete || summary.violations.length > 0) return;
    const node = budgetForecastRef.current;
    if (!node) return;
    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting && entry.intersectionRatio >= 0.5)) return;
      void recordBetaMilestone("BUDGET_FORECAST_VIEWED");
      observer.disconnect();
    }, { threshold: 0.5 });
    observer.observe(node);
    return () => observer.disconnect();
  }, [betaAutoPickComplete, summary.violations.length]);

  useEffect(() => {
    if (!betaAutoPickComplete || !squadIsValid || playerPoolPending || playerPoolFailed || suggestionsPending) return;
    const node = suggestionPanelRef.current;
    if (!node) return;
    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting && entry.intersectionRatio >= 0.25)) return;
      void recordBetaMilestone("TRANSFER_TIPS_VIEWED");
      observer.disconnect();
    }, { threshold: 0.25 });
    observer.observe(node);
    return () => observer.disconnect();
  }, [betaAutoPickComplete, playerPoolFailed, playerPoolPending, squadIsValid, suggestionsPending]);

  useEffect(() => {
    let revealHandle: number | null = null;
    const revealPostLoadContent = () => {
      revealHandle = window.setTimeout(() => setPostLoadContentReady(true), 0);
    };

    if (document.readyState === "complete") {
      revealPostLoadContent();
    } else {
      window.addEventListener("load", revealPostLoadContent, { once: true });
    }

    return () => {
      window.removeEventListener("load", revealPostLoadContent);
      if (revealHandle !== null) window.clearTimeout(revealHandle);
    };
  }, []);

  useEffect(() => {
    if (!postLoadContentReady || !playerPoolHref) return;

    let lifecycleCancelled = false;
    let requestCompleted = false;
    let retryAfterBfcacheRestore = false;
    const controller = new AbortController();
    const handlePageHide = (event: PageTransitionEvent) => {
      lifecycleCancelled = true;
      retryAfterBfcacheRestore = event.persisted && !requestCompleted;
      if (!requestCompleted) controller.abort();
    };
    const handlePageShow = (event: PageTransitionEvent) => {
      if (!event.persisted || !retryAfterBfcacheRestore) return;
      retryAfterBfcacheRestore = false;
      setPlayerPoolFailed(false);
      setPlayerPoolPending(true);
      setPlayerPoolRetry((value) => value + 1);
    };
    window.addEventListener("pagehide", handlePageHide);
    window.addEventListener("pageshow", handlePageShow);
    void fetch(playerPoolHref, {
      cache: "no-store",
      headers: { Accept: "application/json" },
      signal: controller.signal
    })
      .then(async (response) => {
        const payload = await response.json().catch(() => ({})) as { players?: FantasyPlannerPlayer[] };
        if (!response.ok || !Array.isArray(payload.players)) throw new Error("PLAYER_POOL_LOAD_FAILED");
        if (lifecycleCancelled) return;
        requestCompleted = true;
        setSourcePlayers(payload.players);
        setPlayerPoolFailed(false);
        setPlayerPoolPending(false);
      })
      .catch((error: unknown) => {
        if (lifecycleCancelled || controller.signal.aborted || (error instanceof Error && error.name === "AbortError")) return;
        requestCompleted = true;
        console.error("Failed to load fantasy player pool.", error);
        void recordBetaClientError("PLAYER_POOL_LOAD_FAILED");
        setPlayerPoolFailed(true);
        setPlayerPoolPending(false);
      });

    return () => {
      window.removeEventListener("pagehide", handlePageHide);
      window.removeEventListener("pageshow", handlePageShow);
      lifecycleCancelled = true;
      controller.abort();
    };
  }, [playerPoolHref, playerPoolRetry, postLoadContentReady]);

  function applyHistorySettings() {
    if (historyWindowDraft === "SELECTED_SEASONS" && historySeasonsDraft.length === 0) {
      setMessage(localizedText(language, "Choose at least one loaded season.", "Выберите хотя бы один загруженный сезон."));
      return;
    }
    setHistoryApplying(true);
    const url = new URL(window.location.href);
    applyFantasyHistorySearchParams(url.searchParams, historyDraft);
    router.replace(`${url.pathname}?${url.searchParams.toString()}`);
  }

  useEffect(() => {
    if (!postLoadContentReady || !playerPoolReady || !plannerForecastReady) return;

    let cancelled = false;
    const task = buildTransferSuggestionsOffThread({
      pool: players,
      selections,
      rules,
      horizon,
      transferCount: availableSuggestionCount,
      maximumPlans: 6
    });
    void task.promise
      .then((nextSuggestions) => {
        if (cancelled) return;
        setFailedSuggestionCalculation(null);
        setSuggestionCalculation({ players, selections, rules, horizon, availableSuggestionCount, suggestions: nextSuggestions });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        console.error("Failed to calculate fantasy transfer suggestions.", error);
        setSuggestionCalculation({ players, selections, rules, horizon, availableSuggestionCount, suggestions: [] });
        setFailedSuggestionCalculation({ players, selections, rules, horizon, availableSuggestionCount, suggestions: [] });
      });

    return () => {
      cancelled = true;
      task.cancel();
    };
  }, [availableSuggestionCount, players, selections, rules, horizon, playerPoolReady, plannerForecastReady, postLoadContentReady, suggestionRetry]);

  useEffect(() => {
    const handle = window.setTimeout(() => {
      if (captainId || viceCaptainId) {
        writeStoredSquadCaptains(captainStorageKey, { captainId, viceCaptainId });
        return;
      }
      const storedCaptains = readStoredSquadCaptains(captainStorageKey, selectedPlayerIds);
      if (!storedCaptains.captainId && !storedCaptains.viceCaptainId) return;
      setSelections((current) => {
        const next = withCaptainState(current, storedCaptains.captainId, storedCaptains.viceCaptainId);
        if (!next.some((selection) => selection.isCaptain || selection.isViceCaptain)) {
          writeStoredSquadCaptains(captainStorageKey, { captainId: null, viceCaptainId: null });
          return current;
        }
        return next;
      });
    }, 0);

    return () => window.clearTimeout(handle);
  }, [captainId, captainStorageKey, selectedPlayerIds, viceCaptainId]);

  function updateCaptainState(nextCaptainId: string | null, nextViceCaptainId: string | null) {
    writeStoredSquadCaptains(captainStorageKey, { captainId: nextCaptainId, viceCaptainId: nextViceCaptainId });
    setSelections((current) => withCaptainState(current, nextCaptainId, nextViceCaptainId));
  }

  function transferLimitBlockReason(nextSelections: FantasySquadSelection[]) {
    if (!transferLimitIsActive) return null;
    if (countFantasySquadTransfers(transferBaselineSelections, nextSelections) <= transferLimit) return null;

    return localizedText(
      language,
      `Transfer limit reached: ${transferLimit} for the selected forecast.`,
      `Лимит замен: ${transferLimit} на выбранный прогноз.`
    );
  }

  function addPlayer(player: FantasyPlannerPlayer) {
    const blockReason = fantasyAddBlockReason(player, players, selections, rules);
    if (blockReason) {
      setMessage(localizeAddBlockReason(blockReason, language));
      return;
    }

    const nextSelections = [...selections, selectionForNewPlayer(player, players, selections, rules)];
    const limitReason = transferLimitBlockReason(nextSelections);
    if (limitReason) {
      setMessage(limitReason);
      return;
    }

    setSelections(nextSelections);
    setMessage(null);
  }

  function removePlayer(playerId: string) {
    const nextSelections = selections.filter((selection) => selection.playerId !== playerId).map((selection, index) => ({ ...selection, slotIndex: index }));
    const limitReason = transferLimitBlockReason(nextSelections);
    if (limitReason) {
      setMessage(limitReason);
      return;
    }

    setSelections(nextSelections);
    setMessage(null);
  }

  function movePlayerToStarter(playerId: string) {
    const selection = selectionsByPlayerId.get(playerId);
    const player = players.find((candidate) => candidate.playerId === playerId);
    if (!selection || !player) return;
    if (selection.isStarter) {
      setMessage(null);
      return;
    }

    const promoted = promoteStarter(player, players, selections, rules, horizon);
    if (!promoted) {
      setMessage(
        localizedText(
          language,
          "Starting XI must keep 1 GK, 10 field players, DEF 3-5, MID 2-5, FWD 1-3.",
          "В старте должны быть 1 GK, 10 полевых игроков, DEF 3-5, MID 2-5, FWD 1-3."
        )
      );
      return;
    }
    setSelections(sanitizeCaptainRoles(promoted));
    setMessage(localizedText(language, `${player.name} moved to starting XI.`, `${player.name} переведён в старт.`));
  }

  function movePlayerToBench(playerId: string) {
    const selection = selectionsByPlayerId.get(playerId);
    const player = players.find((candidate) => candidate.playerId === playerId);
    if (!selection) return;
    if (!selection.isStarter) {
      setMessage(null);
      return;
    }

    setSelections((current) =>
      current.map((item) => (item.playerId === playerId ? { ...item, isStarter: false, isCaptain: false, isViceCaptain: false } : item))
    );
    const playerName = player?.name ?? localizedText(language, "Player", "Игрок");
    setMessage(localizedText(language, `${playerName} moved to bench.`, `${playerName} переведён в запас.`));
  }

  function handleDropToStarter(playerId: string) {
    movePlayerToStarter(playerId);
    setDraggedPlayerId(null);
  }

  function handleDropToBench(playerId: string) {
    movePlayerToBench(playerId);
    setDraggedPlayerId(null);
  }

  function toggleCaptain(playerId: string) {
    const selection = selectionsByPlayerId.get(playerId);
    if (!selection?.isStarter) {
      setMessage(localizedText(language, "Captain must be in the starting XI.", "Капитан должен быть в стартовом составе."));
      return;
    }
    const nextCaptainId = captainId === playerId ? null : playerId;
    const nextViceCaptainId = viceCaptainId === playerId ? null : viceCaptainId;
    updateCaptainState(nextCaptainId, nextViceCaptainId);
  }

  function toggleViceCaptain(playerId: string) {
    const selection = selectionsByPlayerId.get(playerId);
    if (!selection?.isStarter) {
      setMessage(localizedText(language, "Vice-captain must be in the starting XI.", "Вице-капитан должен быть в стартовом составе."));
      return;
    }
    if (captainId === playerId) return;
    updateCaptainState(captainId, viceCaptainId === playerId ? null : playerId);
  }

  function applySuggestion(suggestion: TransferPlanSuggestion) {
    if (!plannerForecastReady) return;
    const replacements = new Map(suggestion.moves.map((move) => [move.outPlayerId, players.find((player) => player.playerId === move.inPlayerId)]));
    if ([...replacements.values()].some((player) => !player)) return;
    const nextSelections = selections.map((selection) => {
      const incoming = replacements.get(selection.playerId);
      return incoming
        ? {
            ...selection,
            playerId: incoming.playerId,
            purchasePrice: incoming.price,
            isLocked: false
          }
        : selection;
    });
    const limitReason = transferLimitBlockReason(nextSelections);
    if (limitReason) {
      setMessage(limitReason);
      return;
    }

    void recordBetaMilestone("TRANSFER_TIPS_VIEWED");
    setSelections(nextSelections);
    setMessage(null);
  }

  function autoPickStarters() {
    if (!plannerForecastReady) {
      setMessage(localizedText(language, "Auto-pick is unavailable until this league season has fresh forecast data.", "Автоподбор недоступен, пока для сезона лиги нет свежих прогнозных данных."));
      return;
    }
    const optimized = optimizeFantasyStarters({
      pool: players,
      selections,
      rules,
      horizon,
      basis: "horizon",
      strategy: autoPickStrategy,
      respectLocks: true
    });
    if (!optimized) {
      setMessage(
        localizedText(
          language,
          "Could not auto-pick a valid XI with the current squad and locks.",
          "Не удалось автоматически собрать валидный старт с текущим составом и блокировками."
        )
      );
      return;
    }

    const optimizedSummary = summarizeFantasySquad(players, optimized, rules, horizon);
    const delta = optimizedSummary.projectedHorizon - summary.projectedHorizon;
    setSelections(sanitizeCaptainRoles(optimized));
    setMessage(
      delta > 0.05
        ? localizedText(
            language,
            `${squadStrategyCopy(language, autoPickStrategy).label} XI: ${signedScore(delta)} raw xFP over ${horizon} rounds.`,
            `${squadStrategyCopy(language, autoPickStrategy).label}: ${signedScore(delta)} исходного xFP за ${horizon} тур.`
          )
        : localizedText(
            language,
            `Starting XI already matches the ${squadStrategyCopy(language, autoPickStrategy).label.toLowerCase()} strategy.`,
            `Стартовый состав уже соответствует стратегии «${squadStrategyCopy(language, autoPickStrategy).label.toLowerCase()}».`
          )
    );
  }

  async function autoPickSquad() {
    if (autoPickPending || !plannerForecastReady) return;
    const revision = autoPickRevisionRef.current;
    const optimizerInput: FantasySquadOptimizationInput = {
      pool: players,
      selections,
      rules,
      horizon,
      basis: "horizon",
      strategy: autoPickStrategy
    };
    setAutoPickPending(true);
    setMessage(localizedText(language, "Optimizing a valid squad…", "Подбираем допустимый состав…"));

    try {
      const optimized = await optimizeFantasySquadOffThread(optimizerInput);
      if (revision !== autoPickRevisionRef.current) {
        setMessage(localizedText(language, "Squad settings changed during auto-pick. Run it again.", "Настройки состава изменились во время автоподбора. Запустите его ещё раз."));
        return;
      }
      if (!optimized) {
        setMessage(
          localizedText(
            language,
            "Could not auto-pick a valid squad within the current budget, rules, and locks.",
            "Не удалось автоматически собрать допустимый состав с текущим бюджетом, правилами и блокировками."
          )
        );
        return;
      }

      const limitReason = transferLimitBlockReason(optimized);
      if (limitReason) {
        setMessage(limitReason);
        return;
      }

      const optimizedSummary = summarizeFantasySquad(players, optimized, rules, horizon);
      const delta = optimizedSummary.projectedHorizon - summary.projectedHorizon;
      setSelections(optimized);
      if (optimizedSummary.violations.length === 0) {
        setBetaAutoPickComplete(true);
        void recordBetaMilestone("AUTO_PICK_COMPLETED");
      }
      setMessage(
        localizedText(
          language,
          `${squadStrategyCopy(language, autoPickStrategy).label} auto-pick produced a valid ${rules.squadSize}-player squad within budget${delta > 0.05 ? `: ${signedScore(delta)} raw xFP` : ""}.`,
          `Стратегия «${squadStrategyCopy(language, autoPickStrategy).label}» собрала допустимый состав из ${rules.squadSize} игроков в рамках бюджета${delta > 0.05 ? `: ${signedScore(delta)} исходного xFP` : ""}.`
        )
      );
    } catch {
      setMessage(localizedText(language, "Auto-pick could not finish. Try again.", "Автоподбор не завершился. Попробуйте ещё раз."));
    } finally {
      setAutoPickPending(false);
    }
  }

  function saveSquad(asCopy: boolean) {
    if (savePending || deletePending) return;
    setSavePending(true);
    startTransition(async () => {
      try {
        setMessage(null);
        const selectionsToSave = sanitizeCaptainRoles(selections);
        const roundPlansToSave = cloneFantasyRoundPlans(roundPlans);
        roundPlansToSave[activeRoundOffset].selections = selectionsToSave;
        const requestedName = asCopy ? `${squadName} copy` : squadName;
        let response: Response;
        try {
          response = await fetch("/api/machete/squads", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              leagueId,
              season,
              squadId: asCopy ? null : activeSquadId,
              name: requestedName,
              horizonRounds: horizon,
              historyScope: historySettings.scope,
              historyWindow: historySettings.window,
              historySeasons: historySettings.selectedSeasons,
              selections: roundPlansToSave[0].selections,
              roundPlans: roundPlansToSave
            })
          });
        } catch {
          void recordBetaClientError("SQUAD_SAVE_FAILED");
          setMessage(localizedText(language, "Failed to save squad.", "Не удалось сохранить состав."));
          return;
        }
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          void recordBetaClientError("SQUAD_SAVE_FAILED");
          const serverMessage = typeof payload?.error?.message === "string" ? payload.error.message : null;
          setMessage(
            serverMessage
              ? localizedText(language, serverMessage, `Не удалось сохранить состав: ${serverMessage}`)
              : localizedText(language, "Failed to save squad.", "Не удалось сохранить состав.")
          );
          return;
        }
        const savedSquadId = typeof payload.squad?.id === "string" ? payload.squad.id : activeSquadId;
        const savedSquadName = typeof payload.squad?.name === "string" ? payload.squad.name : requestedName;
        if (!savedSquadId) {
          void recordBetaClientError("SQUAD_SAVE_FAILED");
          setMessage(localizedText(language, "The server did not return the saved squad ID.", "Сервер не вернул ID сохранённого состава."));
          return;
        }
        setRoundPlans(roundPlansToSave);
        setSavedRoundPlans(cloneFantasyRoundPlans(roundPlansToSave));
        setActiveSquadId(savedSquadId);
        setSquadName(savedSquadName);
        setSquadOptions((current) => [
          {
            id: savedSquadId,
            name: savedSquadName,
            playersCount: selectionsToSave.length,
            updatedAt: new Date().toISOString()
          },
          ...current.filter((option) => option.id !== savedSquadId)
        ]);
        const savedPlayers = payload.squad?.savedPlayers ?? selectionsToSave.length;
        setMessage(
          asCopy
            ? localizedText(language, `Saved copy "${savedSquadName}" with ${savedPlayers} players.`, `Сохранена копия «${savedSquadName}», игроков: ${savedPlayers}.`)
            : localizedText(language, `Saved ${savedPlayers} players.`, `Сохранено игроков: ${savedPlayers}.`)
        );
        void recordBetaMilestone("SQUAD_SAVED");
        router.replace(squadVariantHref(leagueId, season, savedSquadId, historySettings));
      } finally {
        setSavePending(false);
      }
    });
  }

  function startBlankSquad() {
    const nextName = localUniqueSquadName(
      squadOptions.map((option) => option.name),
      localizedText(language, "New squad", "Новый состав")
    );
    setActiveSquadId(null);
    setSquadName(nextName);
    const blankPlans = createFantasySquadRoundPlans([]);
    setRoundPlans(blankPlans);
    setSavedRoundPlans(cloneFantasyRoundPlans(blankPlans));
    setActiveRoundOffset(0);
    setMessage(localizedText(language, "Blank squad variant started. Save it to keep it.", "Создан пустой вариант. Сохраните его, чтобы не потерять."));
  }

  function selectSquadVariant(squadId: string) {
    if (!squadId || squadId === activeSquadId) return;
    router.push(squadVariantHref(leagueId, season, squadId, historySettings));
  }

  function deleteSquadVariant() {
    if (!activeSquadId || savePending || deletePending) return;
    if (!window.confirm(localizedText(language, `Delete squad "${squadName}"?`, `Удалить состав «${squadName}»?`))) return;

    setDeletePending(true);
    startTransition(async () => {
      try {
        let response: Response;
        try {
          response = await fetch(`/api/machete/squads?squadId=${encodeURIComponent(activeSquadId)}`, { method: "DELETE" });
        } catch {
          setMessage(localizedText(language, "Failed to delete squad. Check the connection and try again.", "Не удалось удалить состав. Проверьте соединение и повторите попытку."));
          return;
        }
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          const serverMessage = typeof payload?.error?.message === "string" ? payload.error.message : null;
          setMessage(serverMessage ?? localizedText(language, "Failed to delete squad.", "Не удалось удалить состав."));
          return;
        }

        const remaining = squadOptions.filter((option) => option.id !== activeSquadId);
        setSquadOptions(remaining);
        const next = remaining[0];
        if (next) {
          router.replace(squadVariantHref(leagueId, season, next.id, historySettings));
          return;
        }
        setActiveSquadId(null);
        setSquadName(localizedText(language, "My squad", "Мой состав"));
        const blankPlans = createFantasySquadRoundPlans([]);
        setRoundPlans(blankPlans);
        setSavedRoundPlans(cloneFantasyRoundPlans(blankPlans));
        setActiveRoundOffset(0);
        setMessage(localizedText(language, "Squad deleted.", "Состав удалён."));
        router.replace(squadVariantHref(leagueId, season, null, historySettings));
      } finally {
        setDeletePending(false);
      }
    });
  }

  const mobileTabs: SegmentedOption<MobileTab>[] = [
    { value: "squad", label: <span className="inline-flex items-center gap-1"><Users className="h-3.5 w-3.5" /><I18nText en="Squad" ru="Состав" /></span> },
    { value: "pool", label: <span className="inline-flex items-center gap-1"><Layers3 className="h-3.5 w-3.5" /><I18nText en="Pool" ru="Пул" /></span> },
    { value: "suggestions", label: <span className="inline-flex items-center gap-1"><ListChecks className="h-3.5 w-3.5" /><I18nText en="Tips" ru="Советы" /></span> }
  ];
  const autoPickStrategyOptions: SegmentedOption<FantasySquadStrategy>[] = [
    { value: "balanced", label: <I18nText en="Balanced" ru="Баланс" />, ariaLabel: localizedText(language, "Balanced auto-pick", "Сбалансированный автоподбор") },
    { value: "reliable", label: <I18nText en="Reliable" ru="Надёжность" />, ariaLabel: localizedText(language, "Reliable auto-pick", "Надёжный автоподбор") },
    { value: "upside", label: <I18nText en="Upside" ru="Потенциал" />, ariaLabel: localizedText(language, "Upside auto-pick", "Автоподбор с потенциалом") }
  ];
  const autoPickStrategyCopy = squadStrategyCopy(language, autoPickStrategy);

  return (
    <div className="mt-4 flex flex-col gap-4">
      <div className="order-1 xl:hidden">
        <SegmentedControl value={mobileTab} onChange={setMobileTab} options={mobileTabs} className="w-full justify-between" size="sm" />
      </div>
      <section className="contents">
        <div className={cn(mobileTab === "squad" ? "block" : "hidden xl:block", "order-2 rounded border border-slate-200 bg-white p-4 shadow-soft")}>
          <div className="space-y-3">
            <div className="rounded border border-slate-200 bg-slate-50 p-2">
              <div className="flex gap-1 overflow-x-auto" aria-label={localizedText(language, "Squad planning round", "Тур плана состава")}>
                {roundPlans.map((plan) => {
                  const round = rounds[plan.roundOffset];
                  const selected = plan.roundOffset === activeRoundOffset;
                  const transfers = plan.roundOffset === 0 ? 0 : countFantasySquadTransfers(roundPlans[plan.roundOffset - 1].selections, plan.selections);
                  return (
                    <button
                      key={plan.roundOffset}
                      type="button"
                      onClick={() => setActiveRoundOffset(plan.roundOffset)}
                      title={round?.label ?? localizedText(language, `Round +${plan.roundOffset}`, `Тур +${plan.roundOffset}`)}
                      className={cn(
                        "min-w-[5.25rem] rounded px-2.5 py-2 text-left text-xs font-semibold transition",
                        selected ? "bg-brand text-white shadow-sm" : "bg-white text-slate-700 hover:bg-slate-100"
                      )}
                    >
                      <span className="block whitespace-nowrap">
                        {plan.roundOffset === 0 ? <I18nText en="Next" ru="Следующий" /> : `+${plan.roundOffset}`}
                      </span>
                      <span className={cn("block truncate text-[10px]", selected ? "text-white/75" : "text-slate-400")}>
                        {plan.roundOffset === 0
                          ? round?.label ?? "—"
                          : plan.linkedToPrevious
                            ? localizedText(language, "linked", "связан")
                            : localizedText(language, `${transfers} tr.`, `${transfers} тр.`)}
                      </span>
                    </button>
                  );
                })}
              </div>
              {activeRoundOffset > 0 ? (
                <div className="mt-2 flex items-center justify-between gap-2 text-xs text-slate-500">
                  <span>
                    {roundPlans[activeRoundOffset].linkedToPrevious
                      ? <I18nText en="Changes from the previous round are inherited." ru="Изменения прошлого тура наследуются." />
                      : <I18nText en="This round has its own saved changes." ru="У этого тура есть собственные изменения." />}
                  </span>
                  <button type="button" onClick={inheritPreviousRound} className="shrink-0 rounded border border-slate-200 bg-white px-2 py-1 font-semibold text-slate-700 hover:bg-slate-100">
                    <I18nText en="Inherit previous" ru="Взять предыдущий" />
                  </button>
                </div>
              ) : null}
            </div>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                <I18nText en="Squad builder" ru="Конструктор состава" />
              </p>
              <span className={cn(
                "rounded-full px-2.5 py-1 text-xs font-semibold",
                squadIsValid
                  ? "bg-emerald-50 text-emerald-700"
                  : hasFullSquad
                    ? "bg-rose-50 text-rose-700"
                    : "bg-amber-50 text-amber-800"
              )}>
                {squadIsValid
                  ? <I18nText en="Valid squad" ru="Состав корректен" />
                  : hasFullSquad
                    ? <I18nText en={`${summary.violations.length} rule issues`} ru={`Нарушений правил: ${summary.violations.length}`} />
                    : <I18nText en={`${rules.squadSize - summary.selectedPlayers.length} players needed`} ru={`Нужно игроков: ${rules.squadSize - summary.selectedPlayers.length}`} />}
              </span>
            </div>

            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                <span className="mb-1 block"><I18nText en="Saved variant" ru="Сохранённый вариант" /></span>
                <select
                  value={activeSquadId ?? ""}
                  onChange={(event) => selectSquadVariant(event.target.value)}
                  className="w-full rounded border border-slate-200 bg-white px-3 py-2 text-sm font-semibold normal-case tracking-normal text-ink"
                >
                  {!activeSquadId ? <LocalizedOption value="" en="Unsaved variant" ru="Несохранённый вариант" /> : null}
                  {squadOptions.map((option) => (
                    <option key={option.id} value={option.id}>{option.name} · {option.playersCount}/{rules.squadSize}</option>
                  ))}
                </select>
              </label>
              <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                <span className="mb-1 block"><I18nText en="Variant name" ru="Название варианта" /></span>
                <input
                  value={squadName}
                  onChange={(event) => setSquadName(event.target.value)}
                  maxLength={80}
                  className="w-full rounded border border-slate-200 px-3 py-2 text-sm font-semibold normal-case tracking-normal text-ink"
                />
              </label>
            </div>

            <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
              <div className="grid grid-cols-1 gap-2 sm:flex sm:flex-wrap">
                <button
                  type="button"
                  onClick={() => void autoPickSquad()}
                  disabled={interactionPending || autoPickPending || !playerPoolReady || !plannerForecastReady}
                  className="inline-flex items-center justify-center gap-2 rounded border border-sky-200 bg-sky-50 px-4 py-2 text-sm font-semibold text-sky-800 hover:bg-sky-100 disabled:opacity-60"
                >
                  <Sparkles className="h-4 w-4" />
                  {autoPickPending ? <I18nText en="Optimizing…" ru="Подбираем…" /> : <I18nText en="Auto-pick squad" ru="Автоподбор состава" />}
                </button>
                <button
                  type="button"
                  onClick={() => saveSquad(false)}
                  disabled={interactionPending || autoPickPending || !squadIsValid}
                  className="btn-brand inline-flex items-center justify-center gap-2 rounded px-4 py-2 text-sm font-semibold disabled:opacity-60"
                >
                  <Save className="h-4 w-4" />
                  {savePending ? <I18nText en="Saving" ru="Сохраняем" /> : <I18nText en="Save squad" ru="Сохранить состав" />}
                </button>
              </div>

              <details className="relative">
                <summary className="cursor-pointer list-none rounded border border-slate-200 bg-white px-3 py-2 text-center text-sm font-semibold text-slate-700 hover:bg-slate-50 [&::-webkit-details-marker]:hidden">
                  <I18nText en="More actions" ru="Другие действия" />
                </summary>
                <div className="mt-2 grid gap-1 rounded border border-slate-200 bg-white p-2 shadow-soft sm:absolute sm:right-0 sm:z-10 sm:w-52">
                  <button
                    type="button"
                    onClick={autoPickStarters}
                    disabled={interactionPending || autoPickPending || !plannerForecastReady}
                    className="inline-flex items-center justify-center gap-2 rounded px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                  >
                    <Sparkles className="h-4 w-4" />
                    <I18nText en="Auto-pick XI" ru="Автостарт" />
                  </button>
                  <button
                    type="button"
                    onClick={() => saveSquad(true)}
                    disabled={interactionPending || autoPickPending || !squadIsValid}
                    className="inline-flex items-center justify-center gap-2 rounded px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                  >
                    <Copy className="h-4 w-4" />
                    <I18nText en="Save copy" ru="Сохранить копию" />
                  </button>
                  <button
                    type="button"
                    onClick={startBlankSquad}
                    disabled={interactionPending || autoPickPending}
                    className="inline-flex items-center justify-center gap-2 rounded px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                  >
                    <FilePlus2 className="h-4 w-4" />
                    <I18nText en="New blank" ru="Новый пустой" />
                  </button>
                  <button
                    type="button"
                    onClick={deleteSquadVariant}
                    disabled={interactionPending || autoPickPending || !activeSquadId}
                    className="inline-flex items-center justify-center gap-2 rounded px-3 py-2 text-sm font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-50"
                  >
                    <Trash2 className="h-4 w-4" />
                    <I18nText en="Delete variant" ru="Удалить вариант" />
                  </button>
                </div>
              </details>
            </div>
          </div>

          <div ref={budgetForecastRef} className="mt-3 grid grid-cols-2 overflow-hidden rounded border border-slate-200 bg-slate-50 [&>dl:nth-child(odd)]:border-r [&>dl:nth-child(n+3)]:border-b-0 md:grid-cols-4 md:divide-x md:divide-slate-200 md:[&>dl]:border-r-0">
            <Metric label={<I18nText en="Next round" ru="След. тур" />} value={formatScore(summary.projectedNext + (captainBonus(summary, captainId)))} tone="good" />
            <Metric label={<I18nText en={`Horizon ${horizon}R`} ru={`Горизонт ${horizon}т`} />} value={formatScore(summary.projectedHorizon)} tone="accent" />
            <Metric label={<I18nText en="Budget" ru="Бюджет" />} value={`${formatNumber(summary.spent, 1)} / ${formatNumber(rules.budgetLimit, 1)}`} tone={summary.spent > rules.budgetLimit ? "bad" : summary.bank < 0 ? "bad" : "default"} />
            <Metric label={<I18nText en="Bank" ru="Банк" />} value={formatNumber(summary.bank, 1)} tone={summary.bank < 0 ? "bad" : "good"} />
          </div>
          {activeSquadId && savedSelections.length > 0 ? <SquadDiffBadge diff={squadDiff} horizon={horizon} /> : null}

          <details className="mt-4 rounded border border-slate-200 bg-slate-50/70">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-2.5 text-sm [&::-webkit-details-marker]:hidden">
              <span className="font-semibold text-slate-700"><I18nText en="Planning settings" ru="Настройки планирования" /></span>
              <span className="truncate text-xs text-slate-500 num-tabular">
                {autoPickStrategyCopy.label} · {horizon}R · {transferLimitIsActive ? `${plannedTransferCount}/${transferLimit}` : transferLimit} <I18nText en="transfers" ru="трансферов" />
              </span>
            </summary>
            <div className="border-t border-slate-200 p-3">
              <div className="flex flex-wrap items-end gap-3">
                <div className="min-w-full text-sm sm:min-w-0 sm:flex-1">
                  <span className="mb-1 block text-xs font-semibold uppercase text-slate-500"><I18nText en="Auto-pick strategy" ru="Стратегия автоподбора" /></span>
                  <SegmentedControl
                    name={localizedText(language, "Auto-pick strategy", "Стратегия автоподбора")}
                    value={autoPickStrategy}
                    onChange={setAutoPickStrategy}
                    options={autoPickStrategyOptions}
                    size="sm"
                    className="max-w-full overflow-x-auto"
                  />
                  <p className="mt-1 max-w-md text-xs text-slate-500">{autoPickStrategyCopy.description}</p>
                </div>
                <label className="text-sm">
                  <span className="mb-1 block text-xs font-semibold uppercase text-slate-500"><I18nText en="Forecast" ru="Прогноз" /></span>
                  <select
                    value={horizon}
                    onChange={(event) => setHorizon(normalizeFantasyHorizon(event.target.value, rules.horizonOptions, horizon))}
                    aria-label={localizedText(language, "Forecast horizon", "Горизонт прогноза")}
                    className="rounded border border-slate-200 bg-white px-3 py-2"
                  >
                    {rules.horizonOptions.map((option) => (
                      <option key={option} value={option}>
                        {option} rounds
                      </option>
                    ))}
                  </select>
                </label>
                <div className="text-sm">
                  <span id="transfer-count-label" className="mb-1 block text-xs font-semibold uppercase text-slate-500"><I18nText en="Transfers" ru="Трансферы" /></span>
                  <output
                    className={cn(
                      "block rounded border bg-white px-3 py-2 font-semibold text-slate-700 num-tabular",
                      transferLimitIsActive && plannedTransferCount >= transferLimit ? "border-amber-200 bg-amber-50 text-amber-800" : "border-slate-200"
                    )}
                    aria-labelledby="transfer-count-label"
                  >
                    {transferLimitIsActive ? `${plannedTransferCount}/${transferLimit}` : transferLimit}
                  </output>
                </div>
                {priceStatus.lastSyncedAt ? (
                  <span className="pb-2 text-sm text-slate-500">
                    <I18nText en={`Prices synced ${formatDate(priceStatus.lastSyncedAt)}`} ru={`Цены обновлены ${formatDate(priceStatus.lastSyncedAt)}`} />
                  </span>
                ) : null}
                {priceStatus.sportsRuPrices > 0 ? (
                  <span className="rounded border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700">
                    <I18nText en={`Sports.ru prices ${priceStatus.sportsRuPrices}`} ru={`Цены Sports.ru ${priceStatus.sportsRuPrices}`} />
                  </span>
                ) : null}
                {priceStatus.estimatedPrices > 0 ? (
                  <span className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-800">
                    <I18nText en={`Hidden without Sports.ru price ${priceStatus.estimatedPrices}`} ru={`Скрыто без цены Sports.ru: ${priceStatus.estimatedPrices}`} />
                  </span>
                ) : null}
              </div>
              <div className="mt-4 border-t border-slate-200 pt-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <I18nText en="Actual / FP history source" ru="Источник истории Actual / FP" />
                </p>
                <div className="mt-2 grid gap-3 md:grid-cols-[minmax(180px,1fr)_minmax(160px,0.8fr)_minmax(190px,1fr)_auto] md:items-end">
                  <label className="text-sm">
                    <span className="mb-1 block text-xs font-semibold text-slate-500"><I18nText en="Competitions" ru="Турниры" /></span>
                    <select
                      value={historyScopeDraft}
                      onChange={(event) => setHistoryScopeDraft(event.target.value as FantasyHistoryScope)}
                      className="w-full rounded border border-slate-200 bg-white px-3 py-2"
                    >
                      {fantasyHistoryScopes.map((scope) => (
                        <option key={scope} value={scope}>{fantasyHistoryScopeLabel(scope, language)}</option>
                      ))}
                    </select>
                  </label>
                  <label className="text-sm">
                    <span className="mb-1 block text-xs font-semibold text-slate-500"><I18nText en="Period" ru="Период" /></span>
                    <select
                      value={historyWindowDraft}
                      onChange={(event) => {
                        const next = event.target.value as FantasyHistoryWindow;
                        setHistoryWindowDraft(next);
                        if (next === "SELECTED_SEASONS" && historySeasonsDraft.length === 0 && historySeasonOptions[0]) {
                          setHistorySeasonsDraft([historySeasonOptions[0]]);
                        }
                      }}
                      className="w-full rounded border border-slate-200 bg-white px-3 py-2"
                    >
                      {fantasyHistoryWindows.map((window) => (
                        <option key={window} value={window}>{fantasyHistoryWindowLabel(window, language)}</option>
                      ))}
                    </select>
                  </label>
                  <fieldset className="text-sm">
                    <span className="mb-1 block text-xs font-semibold text-slate-500"><I18nText en="Loaded seasons" ru="Загруженные сезоны" /></span>
                    <div
                      aria-label={localizedText(language, "History seasons", "Сезоны истории")}
                      className={cn(
                        "max-h-28 min-h-10 overflow-y-auto rounded border border-slate-200 bg-white px-2 py-1.5",
                        historyWindowDraft !== "SELECTED_SEASONS" && "bg-slate-100 opacity-60"
                      )}
                    >
                      {historySeasonOptions.length > 0 ? historySeasonOptions.map((option) => (
                        <label key={option} className="flex min-h-8 cursor-pointer items-center gap-2 px-1 text-sm">
                          <input
                            type="checkbox"
                            checked={historySeasonsDraft.includes(option)}
                            disabled={historyWindowDraft !== "SELECTED_SEASONS"}
                            onChange={(event) => setHistorySeasonsDraft((current) => (
                              event.target.checked ? [...new Set([...current, option])] : current.filter((seasonOption) => seasonOption !== option)
                            ))}
                          />
                          <span>{option}</span>
                        </label>
                      )) : (
                        <span className="block px-1 py-1 text-xs text-slate-500"><I18nText en="No loaded seasons" ru="Нет загруженных сезонов" /></span>
                      )}
                    </div>
                  </fieldset>
                  <button
                    type="button"
                    onClick={applyHistorySettings}
                    disabled={!historySelectionChanged || historyApplying || (historyWindowDraft === "SELECTED_SEASONS" && historySeasonsDraft.length === 0)}
                    className="rounded border border-sky-200 bg-sky-50 px-4 py-2 text-sm font-semibold text-sky-800 hover:bg-sky-100 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {historyApplying ? <I18nText en="Loading…" ru="Загрузка…" /> : <I18nText en="Apply history" ru="Применить историю" />}
                  </button>
                </div>
                <p className="mt-2 text-xs text-slate-500">
                  <I18nText
                    en="This changes the matches used to calculate Actual and historical FP for every player in the planner. You can select several seasons."
                    ru="Настройка меняет матчи, по которым считаются Actual и исторический FP всех игроков планировщика. Можно выбрать несколько сезонов."
                  />
                </p>
              </div>
            </div>
          </details>

          {message ? <div role="status" aria-live="polite" className="mt-3 rounded bg-amber-50 px-3 py-2 text-sm text-amber-800">{message}</div> : null}

          {summary.violations.length > 0 ? (
            <div className="mt-4 rounded border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{summary.violations.join(" / ")}</div>
          ) : null}
          {summary.warnings.length > 0 ? (
            <div className="mt-3 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">{summary.warnings.join(" / ")}</div>
          ) : null}
          {rounds.length === 0 ? (
            <div className="mt-4 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              <I18nText
                en="No upcoming fixtures are loaded for this league season yet, so round projections are zero until schedule ingestion has future matches."
                ru="На сезон этой лиги пока не загружены будущие матчи, поэтому прогноз по турам будет нулевым до загрузки календаря."
              />
            </div>
          ) : null}
        </div>

        <div ref={suggestionPanelRef} className={cn(mobileTab === "suggestions" ? "block" : "hidden xl:block", "order-5 rounded border border-slate-200 bg-white p-4 shadow-soft")}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500"><I18nText en="Transfer suggestions" ru="Подсказки трансферов" /></h3>
              <p className="mt-1 text-xs text-slate-500"><I18nText en="Ranked by the selected forecast horizon." ru="Ранжированы по выбранному горизонту прогноза." /></p>
            </div>
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-800 num-tabular">
              <Sparkles className="h-3.5 w-3.5" />
              {suggestions.length}
            </span>
          </div>
          {transferCostUnconfigured && suggestions.length > 0 ? (
            <p className="mt-3 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              <I18nText
                en="Paid-transfer cost is not configured. Gains below are shown before transfer penalties."
                ru="Стоимость платных трансферов не настроена. Выигрыш ниже указан без трансферных штрафов."
              />
            </p>
          ) : null}
          <div className="mt-3 grid gap-2 xl:grid-cols-3">
            {displayedSuggestions.map((suggestion) => (
              <button
                key={suggestion.id}
                type="button"
                onClick={() => applySuggestion(suggestion)}
                className="block w-full rounded border border-slate-200 bg-white px-3 py-2 text-left hover:bg-slate-50"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-ink">
                      <I18nText en={`${suggestion.transferCount} transfer${suggestion.transferCount === 1 ? "" : "s"}`} ru={`${suggestion.transferCount} трансфер${suggestion.transferCount === 1 ? "" : suggestion.transferCount < 5 ? "а" : "ов"}`} />
                    </p>
                    {suggestion.moves.map((move) => (
                      <p key={`${move.outPlayerId}:${move.inPlayerId}`} className="truncate text-xs text-slate-500">
                        <span title={move.outName}>{compactPlayerDisplayName(move.outName)}</span> → <span className="font-semibold text-ink" title={move.inName}>{compactPlayerDisplayName(move.inName)}</span> / {move.positionGroup}
                      </p>
                    ))}
                  </div>
                  <span className="whitespace-nowrap rounded bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700">
                    {signedScore(suggestion.round1Delta)}
                  </span>
                </div>
                <dl className="mt-2 grid grid-cols-3 gap-2 rounded bg-slate-50 px-2 py-1.5 text-xs">
                  <div>
                    <dt className="text-slate-500"><I18nText en="Next" ru="Следующий" /></dt>
                    <dd className="font-semibold text-ink num-tabular">{signedScore(suggestion.round1Delta)}</dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">{horizon}R</dt>
                    <dd className="font-semibold text-ink num-tabular">{signedScore(suggestion.horizonDelta)}</dd>
                  </div>
                  <div>
                    <dt className="text-slate-500"><I18nText en="Budget" ru="Бюджет" /></dt>
                    <dd className="font-semibold text-ink num-tabular">{signedNumber(suggestion.priceDelta)}</dd>
                  </div>
                </dl>
                <p className="mt-1 text-xs font-medium text-slate-600">
                  <I18nText en={suggestion.reason} ru={`Прогнозный выигрыш ${signedScore(suggestion.horizonDelta)} за ${horizon} тур.`} />
                </p>
                {actionableTransferRisks(suggestion.risks).length > 0 ? (
                  <p className="mt-1 text-[11px] text-rose-700">
                    <I18nText en={`Risks: ${actionableTransferRisks(suggestion.risks).join("; ")}`} ru={`Риски: ${actionableTransferRisks(suggestion.risks).map(localizeTransferRisk).join("; ")}`} />
                  </p>
                ) : null}
              </button>
            ))}
            {suggestions.length > 3 ? (
              <button
                type="button"
                onClick={() => setShowAllSuggestions((value) => !value)}
                className="w-full rounded border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                {showAllSuggestions
                  ? <I18nText en="Show top 3" ru="Показать топ-3" />
                  : <I18nText en={`Show all ${suggestions.length}`} ru={`Показать все: ${suggestions.length}`} />}
              </button>
            ) : null}
            {!plannerForecastReady ? (
              <p className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900" role="status">
                <I18nText en="Transfer recommendations are unavailable until this league season has fresh non-zero round projections." ru="Трансферные рекомендации недоступны, пока для сезона лиги нет свежих ненулевых прогнозов по турам." />
              </p>
            ) : playerPoolFailed ? (
              <div className="space-y-2 rounded border border-rose-200 bg-rose-50 px-3 py-3 text-sm text-rose-700" role="alert">
                <I18nText en="The player pool could not be loaded, so transfer recommendations are unavailable." ru="Не удалось загрузить пул игроков, поэтому трансферные рекомендации недоступны." />
                <button
                  type="button"
                  onClick={() => {
                    setPlayerPoolFailed(false);
                    setPlayerPoolPending(true);
                    setPlayerPoolRetry((value) => value + 1);
                  }}
                  className="block rounded border border-rose-300 bg-white px-3 py-1.5 text-xs font-semibold text-rose-700"
                >
                  <I18nText en="Retry" ru="Повторить" />
                </button>
              </div>
            ) : suggestionsFailed ? (
              <div className="space-y-2 rounded border border-rose-200 bg-rose-50 px-3 py-3 text-sm text-rose-700" role="alert">
                <I18nText en="Transfer recommendations could not be calculated." ru="Не удалось рассчитать трансферные рекомендации." />
                <button
                  type="button"
                  onClick={() => {
                    setFailedSuggestionCalculation(null);
                    setSuggestionRetry((value) => value + 1);
                  }}
                  className="block rounded border border-rose-300 bg-white px-3 py-1.5 text-xs font-semibold text-rose-700"
                >
                  <I18nText en="Retry" ru="Повторить" />
                </button>
              </div>
            ) : playerPoolPending || suggestionsPending ? (
              <p className="text-sm text-slate-500" role="status" aria-live="polite">
                <I18nText
                  en={playerPoolPending ? "Loading player pool..." : "Calculating transfer recommendations..."}
                  ru={playerPoolPending ? "Загружаем пул игроков..." : "Рассчитываем трансферные рекомендации..."}
                />
              </p>
            ) : suggestions.length === 0 ? (
              <p className="text-sm text-slate-500"><I18nText en="No clean upgrade found for the selected filters." ru="Для выбранных фильтров чистое улучшение не найдено." /></p>
            ) : null}
          </div>
        </div>
      </section>

      <section className={cn(mobileTab === "suggestions" ? "hidden xl:block" : "block", "order-4 min-w-0 rounded border border-slate-200 bg-white p-3 shadow-soft sm:p-4")}>
        <div className="grid min-w-0 grid-cols-1 gap-4 xl:grid-cols-[minmax(360px,0.82fr)_minmax(560px,1.18fr)] 2xl:grid-cols-[minmax(400px,0.78fr)_minmax(680px,1.22fr)]">
          <div className={cn(mobileTab === "squad" ? "block" : "hidden xl:block")}>
            <div className="mb-3">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500"><I18nText en="Your squad" ru="Ваш состав" /></h3>
            </div>
            <SquadPitch
              summary={summary}
              selectionsByPlayerId={selectionsByPlayerId}
              horizon={horizon}
              language={language}
              captainId={captainId}
              viceCaptainId={viceCaptainId}
              draggedPlayerId={draggedPlayerId}
              onRemove={removePlayer}
              onToggleCaptain={toggleCaptain}
              onToggleVice={toggleViceCaptain}
              onDragStart={setDraggedPlayerId}
              onDragEnd={() => setDraggedPlayerId(null)}
              onDropToStarter={handleDropToStarter}
              onDropToBench={handleDropToBench}
            />
          </div>

          <div className={cn(mobileTab === "pool" ? "block" : "hidden xl:block", "min-w-0")}>
            <div className="mb-3 grid grid-cols-2 gap-2 md:grid-cols-[1fr_auto_auto_auto]">
              <label className="relative col-span-2 md:col-span-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder={localizedText(language, "Search player or team", "Игрок или команда")}
                  aria-label={localizedText(language, "Search player or team", "Поиск игрока или команды")}
                  className="w-full rounded border border-slate-200 py-2 pl-9 pr-3 text-xs [@media(pointer:coarse)]:text-base"
                />
              </label>
              <select value={positionFilter} onChange={(event) => setPositionFilter(event.target.value)} aria-label={localizedText(language, "Position filter", "Фильтр позиции")} className="rounded border border-slate-200 px-3 py-2 text-xs [@media(pointer:coarse)]:text-base">
                <option value="ALL">{localizedText(language, "All positions", "Все позиции")}</option>
                {positionOrder.map((position) => (
                  <option key={position} value={position}>
                    {position}
                  </option>
                ))}
              </select>
              <select value={starterPoolFilter} onChange={(event) => setStarterPoolFilter(event.target.value)} aria-label={localizedText(language, "Starter pool filter", "Фильтр старта")} className="rounded border border-slate-200 px-3 py-2 text-xs [@media(pointer:coarse)]:text-base">
                <option value="ALL">{localizedText(language, "All players", "Все игроки")}</option>
                <option value="STARTER">{localizedText(language, "In starting XI", "В старте")}</option>
                <option value="BENCH">{localizedText(language, "On bench", "На скамейке")}</option>
              </select>
              <label className="col-span-2 flex items-center gap-2 rounded border border-slate-200 px-3 py-2 text-xs text-slate-700 md:col-span-1">
                <input type="checkbox" checked={onlyAffordable} onChange={(event) => setOnlyAffordable(event.target.checked)} className="h-4 w-4 rounded border-slate-300" />
                <I18nText en="Fits" ru="Проходит" />
              </label>
            </div>
            {playerPoolReady && postLoadContentReady ? (
              <PlayerPoolTable
                players={filteredPlayers}
                horizon={horizon}
                language={language}
                addBlockReason={(player) => fantasyAddBlockReason(player, players, selections, rules)}
                selectionsByPlayerId={selectionsByPlayerId}
                onAdd={addPlayer}
                onRemove={removePlayer}
              />
            ) : playerPoolFailed ? (
              <div className="rounded border border-rose-200 bg-rose-50 px-3 py-4 text-sm text-rose-700" role="alert">
                <I18nText en="The player pool could not be loaded. Retry from the Tips tab." ru="Не удалось загрузить пул игроков. Повторите загрузку на вкладке «Советы»." />
              </div>
            ) : (
              <p className="rounded border border-slate-200 bg-slate-50 px-3 py-4 text-sm text-slate-500" role="status" aria-live="polite">
                <I18nText en="Loading player pool..." ru="Загружаем пул игроков..." />
              </p>
            )}
          </div>
        </div>
      </section>

      {rounds.length > 0 ? (
        <section className="order-3 overflow-hidden rounded border border-slate-200 bg-white shadow-soft">
          <div className="border-b border-slate-200 px-4 py-3">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
              <I18nText en="Round forecast" ru="Прогноз по турам" />
            </h3>
          </div>
          <div className="overflow-x-auto">
            <SortableTable className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-3"><I18nText en="Round" ru="Тур" /></th>
                  {rounds.map((round) => (
                    <th key={round.id} className="min-w-28 px-4 py-3 text-right">
                      {round.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="px-4 py-3 font-semibold text-ink">
                    <I18nText en="Starting XI FP" ru="FP старта" />
                  </td>
                  {rounds.map((round, index) => (
                    <td key={round.id} className="px-4 py-3 text-right font-semibold text-emerald-700 num-tabular">
                      {formatScore(summary.starterPlayers.reduce((total, player) => total + (player.roundPoints[index] ?? (index === 0 ? player.predictedFp ?? 0 : 0)), 0))}
                    </td>
                  ))}
                </tr>
                <tr className="border-t border-slate-100">
                  <td className="px-4 py-3 text-slate-500">
                    <I18nText en="Fixtures" ru="Матчи" />
                  </td>
                  {rounds.map((round) => (
                    <td key={round.id} className="px-4 py-3 text-right text-slate-500 num-tabular">
                      {round.fixtureCount}
                    </td>
                  ))}
                </tr>
              </tbody>
            </SortableTable>
          </div>
        </section>
      ) : null}
    </div>
  );
}

function PlayerPoolTable({
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
        <div className="relative max-h-[720px] w-full max-w-full overflow-auto">
        <SortableTable className="w-full min-w-[720px] table-fixed divide-y divide-slate-200 text-xs">
          <colgroup>
            <col className="w-[19%]" />
            <col className="w-[9%]" />
            <col className="w-[6%]" />
            <col className="w-[8%]" />
            <col className="w-[7%]" />
            <col className="w-[7%]" />
            <col className="w-[7%]" />
            <col className="w-[6%]" />
            <col className="w-[24%]" />
            <col className="w-[7%]" />
          </colgroup>
          <thead className="sticky top-0 z-10 whitespace-nowrap bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500">
            <tr>
              <th className="overflow-hidden px-2 py-2" title={columnTitles.player}><I18nText en="Player" ru="Игрок" /></th>
              <th className="overflow-hidden px-2 py-2" title={columnTitles.team}><I18nText en="Team" ru="Клуб" /></th>
              <th className="overflow-hidden px-1 py-2" title={columnTitles.position}><I18nText en="Pos" ru="Поз." /></th>
              <th className="overflow-hidden px-1 py-2 text-right" title={columnTitles.price}><I18nText en="Price" ru="Цена" /></th>
              <th className="overflow-hidden px-1 py-2 text-right" title={columnTitles.next}><I18nText en="Next" ru="ФО" /></th>
              <th className="overflow-hidden px-1 py-2 text-right" title={columnTitles.alternative}><I18nText en="Alt" ru="Альт" /></th>
              <th className="overflow-hidden px-1 py-2 text-right" title={columnTitles.alternativeFive}><I18nText en="Alt 5R" ru="Альт 5Т" /></th>
              <th className="overflow-hidden px-1 py-2 text-right" title={columnTitles.horizon}><I18nText en={`${horizon}R`} ru={`${horizon}Т`} /></th>
              <th data-sort-disabled="true" className="overflow-hidden px-2 py-2" title={columnTitles.fixtures}><I18nText en="Fixtures" ru="Матчи" /></th>
              <th data-sort-disabled="true" className="overflow-hidden px-2 py-2 text-center" title={columnTitles.action}>
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

              return (
                <tr key={player.playerId} className={rowClassName}>
                  <td className="px-2 py-1.5">
                    <span className={`block truncate font-semibold ${muted ? "text-slate-500" : "text-ink"}`} title={forecastTitle}>{compactPlayerDisplayName(player.name)}</span>
                    <span className="block truncate text-[10px] text-slate-600" title={forecastTitle}>
                      <span className={isSelected ? "font-bold text-emerald-700" : muted ? "text-slate-600" : "text-slate-500"}>
                        {isSelected ? <I18nText en="Selected" ru="В составе" /> : `FP ${formatScore(player.predictedFp)}`}
                      </span>
                      {player.expectedMinutes !== null && player.expectedMinutes !== undefined ? (
                        <>
                          {` · ${Math.round(player.expectedMinutes)}`}<I18nText en="m" ru="м" />
                          {player.forecastConfidence !== null && player.forecastConfidence !== undefined
                            ? ` · ${Math.round(player.forecastConfidence * 100)}%`
                            : ""}
                        </>
                      ) : null}
                    </span>
                  </td>
                  <td className="px-2 py-1.5 text-slate-600">
                    <span className="block truncate" title={player.teamName}>{teamDisplayName}</span>
                  </td>
                  <td className="px-2 py-1.5">
                    <span className={`rounded px-2 py-0.5 text-[11px] font-bold ${muted ? "border border-slate-300 bg-slate-200 text-slate-700" : positionPillClass(player.positionGroup)}`}>{player.positionGroup}</span>
                  </td>
                  <td
                    data-sort-value={player.price}
                    className={`whitespace-nowrap px-2 py-1.5 text-right font-semibold ${muted ? "text-slate-600" : "text-ink"}`}
                    title={player.priceSource === "ESTIMATED" ? localizedText(language, "Estimated price", "Оценочная цена") : undefined}
                  >
                    {player.priceSource === "ESTIMATED" ? "~" : ""}{formatNumber(player.price, 1)}
                  </td>
                  <td data-sort-value={nextFantasyPoints(player)} className={`whitespace-nowrap px-2 py-1.5 text-right font-semibold ${muted ? "text-slate-600" : "text-emerald-700"}`}>{formatScore(nextFantasyPoints(player))}</td>
                  <td
                    data-sort-value={player.alternativePredictedFp ?? ""}
                    className={`whitespace-nowrap px-2 py-1.5 text-right font-semibold ${muted ? "text-slate-600" : "text-amber-700"}`}
                    title={alternativePredictedFpTitle(language)}
                  >
                    {formatScore(player.alternativePredictedFp)}
                  </td>
                  <td
                    data-sort-value={playerAlternativeHorizonPoints(player, 5) ?? ""}
                    className={`whitespace-nowrap px-2 py-1.5 text-right font-semibold ${muted ? "text-slate-600" : "text-violet-700"}`}
                    title={alternativeFiveRoundFpTitle(language)}
                  >
                    {formatScore(playerAlternativeHorizonPoints(player, 5))}
                  </td>
                  <td data-sort-value={playerHorizonPoints(player, horizon)} className={`whitespace-nowrap px-2 py-1.5 text-right font-semibold ${muted ? "text-slate-600" : "text-sky-700"}`}>{formatScore(playerHorizonPoints(player, horizon))}</td>
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
                  <td className="px-1 py-1.5 text-center">
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
                <td colSpan={9} className="px-4 py-10 text-center text-sm text-slate-500">
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

function PlayerPoolMobileList({
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
  return (
    <div className="space-y-2 md:hidden [@media(pointer:coarse)]:!block" data-testid="player-pool-mobile">
      {players.map((player) => {
        const reason = addBlockReason(player);
        const isSelected = selectionsByPlayerId.has(player.playerId);
        const disabled = !isSelected && reason !== null;
        const localizedReason = reason ? localizeAddBlockReason(reason, language) : null;
        const fixtureChips = fixtureChipPresentations(player.fixtures, player.fixtureDifficulties ?? [], horizon, player.fixtureFullNames);
        const addLabel = disabled
          ? localizedText(language, `Cannot add ${player.name}: ${localizedReason ?? reason ?? ""}`, `Нельзя добавить ${player.name}: ${localizedReason ?? reason ?? ""}`)
          : localizedText(language, `Add ${player.name}`, `Добавить ${player.name}`);
        const removeLabel = localizedText(language, `Remove ${player.name}`, `Убрать ${player.name}`);

        return (
          <article
            key={player.playerId}
            className={cn(
              "rounded border p-3",
              isSelected
                ? "border-emerald-200 bg-emerald-50"
                : disabled
                  ? "border-slate-200 bg-slate-50 text-slate-500"
                  : "border-slate-200 bg-white"
            )}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex min-w-0 items-center gap-2">
                  <h4 className="truncate text-sm font-bold text-ink" title={player.name}>{compactPlayerDisplayName(player.name)}</h4>
                  <span className={cn("shrink-0 rounded px-2 py-0.5 text-[10px] font-bold", disabled ? "bg-slate-200 text-slate-600" : positionPillClass(player.positionGroup))}>
                    {player.positionGroup}
                  </span>
                </div>
                <p className="mt-0.5 truncate text-xs text-slate-500" title={player.teamName}>{fantasyPlayerTeamDisplayName(player)}</p>
                {player.expectedMinutes !== null && player.expectedMinutes !== undefined ? (
                  <p className="mt-0.5 text-[11px] text-slate-500">
                    {Math.round(player.expectedMinutes)} <I18nText en="min" ru="мин" />
                    {player.forecastConfidence !== null && player.forecastConfidence !== undefined
                      ? ` · ${Math.round(player.forecastConfidence * 100)}%`
                      : ""}
                  </p>
                ) : null}
              </div>
              {isSelected ? (
                <button type="button" onClick={() => onRemove(player.playerId)} aria-label={removeLabel} className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded border border-rose-200 bg-white text-rose-700 hover:bg-rose-50">
                  <Trash2 className="h-4 w-4" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => onAdd(player)}
                  disabled={disabled}
                  aria-label={addLabel}
                  className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400"
                >
                  {disabled ? <Lock className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                </button>
              )}
            </div>

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
              <div className="min-w-0 px-1" title={alternativePredictedFpTitle(language)}>
                <dt className="text-[10px] font-semibold uppercase text-slate-500">Alt</dt>
                <dd className="truncate text-sm font-bold text-amber-700 num-tabular">{formatScore(player.alternativePredictedFp)}</dd>
              </div>
            </dl>

            <div className="mt-2 flex min-w-0 items-center justify-between gap-2 overflow-hidden">
              <div className="min-w-0 overflow-hidden">
                {fixtureChips.length > 0 ? <FdrRow fixtures={fixtureChips} /> : <span className="text-[11px] text-slate-500"><I18nText en="No fixture loaded" ru="Матч не загружен" /></span>}
              </div>
              <span className="shrink-0 text-[11px] font-semibold text-violet-700 num-tabular" title={alternativeFiveRoundFpTitle(language)}>
                <I18nText en="Alt 5R" ru="Альт 5Т" /> {formatScore(playerAlternativeHorizonPoints(player, 5))}
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
      {players.length === 0 ? (
        <p className="rounded border border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
          <I18nText en="No players match the selected filters." ru="Нет игроков под выбранные фильтры." />
        </p>
      ) : null}
    </div>
  );
}

function Metric({ label, value, tone = "default" }: { label: React.ReactNode; value: string; tone?: "default" | "good" | "bad" | "accent" }) {
  const color = tone === "good" ? "text-emerald-700" : tone === "bad" ? "text-rose-700" : tone === "accent" ? "text-sky-700" : "text-ink";
  return (
    <dl className="min-w-0 border-b border-slate-200 px-3 py-2 last:border-b-0 md:border-b-0">
      <dt className="truncate text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className={cn("mt-0.5 truncate text-lg font-bold num-tabular", color)}>{value}</dd>
    </dl>
  );
}

function captainBonus(summary: ReturnType<typeof summarizeFantasySquad>, captainId: string | null) {
  if (!captainId) return 0;
  const captain = summary.starterPlayers.find((p) => p.playerId === captainId);
  if (!captain) return 0;
  return nextFantasyPoints(captain);
}

function SquadDiffBadge({ diff, horizon }: { diff: SquadDiff; horizon: number }) {
  const tone =
    diff.horizonDelta > 0.05
      ? "good"
      : diff.horizonDelta < -0.05
        ? "bad"
        : diff.changeCount > 0
          ? "neutral"
          : "saved";
  const toneClass =
    tone === "good"
      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
      : tone === "bad"
        ? "border-rose-200 bg-rose-50 text-rose-800"
        : tone === "neutral"
          ? "border-sky-200 bg-sky-50 text-sky-800"
          : "border-slate-200 bg-slate-50 text-slate-600";

  return (
    <div className={cn("mt-3 flex flex-wrap items-center gap-2 rounded border px-3 py-2 text-sm", toneClass)}>
      {diff.changeCount === 0 ? (
        <span className="font-semibold"><I18nText en="No changes vs saved" ru="Без изменений к сохранённому" /></span>
      ) : (
        <>
          <span className="font-semibold"><I18nText en="Vs saved" ru="К сохранённому" /></span>
          <span className="rounded bg-white/80 px-2 py-0.5 font-black num-tabular">
            {signedScore(diff.horizonDelta)} xFP
          </span>
          <span className="text-xs font-semibold opacity-80">{horizon}R</span>
          <span className="text-xs opacity-70">/</span>
          <span className="font-semibold num-tabular">
            <I18nText en={`${diff.changeCount} ${diff.changeCount === 1 ? "change" : "changes"}`} ru={`${diff.changeCount} изм.`} />
          </span>
          <span className="text-xs opacity-80">
            <I18nText
              en={`${diff.added} in, ${diff.removed} out, ${diff.starterChanges} XI, ${diff.captainChanges} C/VC`}
              ru={`+${diff.added}, -${diff.removed}, старт: ${diff.starterChanges}, C/VC: ${diff.captainChanges}`}
            />
          </span>
        </>
      )}
    </div>
  );
}

function allowSquadDrop(event: DragEvent<HTMLElement>, canDrop: boolean) {
  if (!canDrop) return;
  event.preventDefault();
  event.dataTransfer.dropEffect = "move";
}

function readDraggedPlayerId(event: DragEvent<HTMLElement>) {
  event.preventDefault();
  return event.dataTransfer.getData(squadDragDataType) || event.dataTransfer.getData("text/plain") || null;
}

function SquadPitch({
  summary,
  selectionsByPlayerId,
  horizon,
  language,
  captainId,
  viceCaptainId,
  draggedPlayerId,
  onRemove,
  onToggleCaptain,
  onToggleVice,
  onDragStart,
  onDragEnd,
  onDropToStarter,
  onDropToBench
}: {
  summary: ReturnType<typeof summarizeFantasySquad>;
  selectionsByPlayerId: Map<string, FantasySquadSelection>;
  horizon: number;
  language: UiLanguage;
  captainId: string | null;
  viceCaptainId: string | null;
  draggedPlayerId: string | null;
  onRemove: (playerId: string) => void;
  onToggleCaptain: (playerId: string) => void;
  onToggleVice: (playerId: string) => void;
  onDragStart: (playerId: string) => void;
  onDragEnd: () => void;
  onDropToStarter: (playerId: string) => void;
  onDropToBench: (playerId: string) => void;
}) {
  const starterLines: Array<{ position: Exclude<FantasyPositionGroup, "UNK">; label: React.ReactNode }> = [
    { position: "DEF", label: <I18nText en="Defenders" ru="Защитники" /> },
    { position: "MID", label: <I18nText en="Midfielders" ru="Полузащитники" /> },
    { position: "FWD", label: <I18nText en="Forwards" ru="Нападающие" /> }
  ];
  const draggedSelection = draggedPlayerId ? selectionsByPlayerId.get(draggedPlayerId) : undefined;

  return (
    <div className="space-y-1.5">
      <div className="rounded border border-emerald-300 bg-emerald-900 p-1.5 shadow-inner">
        <div className="mb-1">
          <h4 className="text-xs font-bold uppercase tracking-wide text-white"><I18nText en="Starting XI" ru="Стартовый состав" /></h4>
        </div>
        <div className="relative overflow-hidden rounded border border-white/20 bg-emerald-800/80 px-1 py-1.5">
          <div className="pointer-events-none absolute inset-x-3 top-1/2 border-t border-white/15" />
          <div className="pointer-events-none absolute left-1/2 top-1/2 h-16 w-16 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/15" />
          <div className="relative space-y-1.5">
            <SquadLine
              label={<I18nText en="Goalkeeper" ru="Вратарь" />}
              players={summary.starterPlayers.filter((player) => player.positionGroup === "GK")}
              selectionsByPlayerId={selectionsByPlayerId}
              horizon={horizon}
              language={language}
              captainId={captainId}
              viceCaptainId={viceCaptainId}
              draggedPlayerId={draggedPlayerId}
              onRemove={onRemove}
              onToggleCaptain={onToggleCaptain}
              onToggleVice={onToggleVice}
              onDragStart={onDragStart}
              onDragEnd={onDragEnd}
              onDropToStarter={onDropToStarter}
            />
            {starterLines.map((line) => (
              <SquadLine
                key={line.position}
                label={line.label}
                players={summary.starterPlayers.filter((player) => player.positionGroup === line.position)}
                selectionsByPlayerId={selectionsByPlayerId}
                horizon={horizon}
                language={language}
                captainId={captainId}
                viceCaptainId={viceCaptainId}
                draggedPlayerId={draggedPlayerId}
                onRemove={onRemove}
                onToggleCaptain={onToggleCaptain}
                onToggleVice={onToggleVice}
                onDragStart={onDragStart}
                onDragEnd={onDragEnd}
                onDropToStarter={onDropToStarter}
              />
            ))}
          </div>
        </div>
      </div>

      <div className="h-px bg-slate-300" />

      <div className="rounded border border-slate-200 bg-slate-50 p-2">
        <div className="mb-2">
          <h4 className="text-xs font-bold uppercase tracking-wide text-slate-500"><I18nText en="Bench" ru="Запас" /></h4>
        </div>
        <div
          className={cn(
            "flex min-h-16 flex-wrap justify-center gap-1 rounded border border-dashed border-transparent p-0.5 transition-colors",
            draggedSelection?.isStarter && "border-sky-300 bg-sky-50"
          )}
          onDragOver={(event) => allowSquadDrop(event, Boolean(draggedPlayerId))}
          onDrop={(event) => {
            const playerId = readDraggedPlayerId(event);
            if (playerId) onDropToBench(playerId);
          }}
        >
          {summary.benchPlayers.map((player) => (
            <SquadPlayerTile
              key={player.playerId}
              player={player}
              selection={selectionsByPlayerId.get(player.playerId)}
              horizon={horizon}
              language={language}
              isCaptain={captainId === player.playerId}
              isVice={viceCaptainId === player.playerId}
              isDragging={draggedPlayerId === player.playerId}
              compact
              onRemove={onRemove}
              onToggleCaptain={onToggleCaptain}
              onToggleVice={onToggleVice}
              onDragStart={onDragStart}
              onDragEnd={onDragEnd}
            />
          ))}
          {summary.benchPlayers.length === 0 ? (
            <div className="rounded border border-dashed border-slate-300 bg-white px-4 py-6 text-center text-sm text-slate-500">
              <I18nText en="Empty" ru="Пусто" />
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function SquadLine({
  label,
  players,
  selectionsByPlayerId,
  horizon,
  language,
  captainId,
  viceCaptainId,
  draggedPlayerId,
  onRemove,
  onToggleCaptain,
  onToggleVice,
  onDragStart,
  onDragEnd,
  onDropToStarter
}: {
  label: React.ReactNode;
  players: FantasyPlannerPlayer[];
  selectionsByPlayerId: Map<string, FantasySquadSelection>;
  horizon: number;
  language: UiLanguage;
  captainId: string | null;
  viceCaptainId: string | null;
  draggedPlayerId: string | null;
  onRemove: (playerId: string) => void;
  onToggleCaptain: (playerId: string) => void;
  onToggleVice: (playerId: string) => void;
  onDragStart: (playerId: string) => void;
  onDragEnd: () => void;
  onDropToStarter: (playerId: string) => void;
}) {
  return (
    <div>
      <div className="mb-0.5 text-center text-[10px] font-bold uppercase tracking-wide text-white/80">{label}</div>
      <div
        className={cn(
          "flex min-h-14 flex-wrap items-stretch justify-center gap-1 rounded border border-dashed border-transparent p-0.5 transition-colors",
          draggedPlayerId && "border-white/30 bg-white/10"
        )}
        onDragOver={(event) => allowSquadDrop(event, Boolean(draggedPlayerId))}
        onDrop={(event) => {
          const playerId = readDraggedPlayerId(event);
          if (playerId) onDropToStarter(playerId);
        }}
      >
        {players.map((player) => (
          <SquadPlayerTile
            key={player.playerId}
            player={player}
            selection={selectionsByPlayerId.get(player.playerId)}
            horizon={horizon}
            language={language}
            isCaptain={captainId === player.playerId}
            isVice={viceCaptainId === player.playerId}
            isDragging={draggedPlayerId === player.playerId}
            onRemove={onRemove}
            onToggleCaptain={onToggleCaptain}
            onToggleVice={onToggleVice}
            onDragStart={onDragStart}
            onDragEnd={onDragEnd}
          />
        ))}
        {players.length === 0 ? (
          <div className="flex min-h-12 w-24 items-center justify-center rounded border border-dashed border-white/25 bg-white/10 text-[11px] text-white/70">
            <I18nText en="Empty" ru="Пусто" />
          </div>
        ) : null}
      </div>
    </div>
  );
}

function SquadPlayerTile({
  player,
  selection,
  horizon,
  language,
  isCaptain = false,
  isVice = false,
  isDragging = false,
  compact = false,
  onRemove,
  onToggleCaptain,
  onToggleVice,
  onDragStart,
  onDragEnd
}: {
  player: FantasyPlannerPlayer;
  selection: FantasySquadSelection | undefined;
  horizon: number;
  language: UiLanguage;
  isCaptain?: boolean;
  isVice?: boolean;
  isDragging?: boolean;
  compact?: boolean;
  onRemove: (playerId: string) => void;
  onToggleCaptain: (playerId: string) => void;
  onToggleVice: (playerId: string) => void;
  onDragStart: (playerId: string) => void;
  onDragEnd: () => void;
}) {
  const [mobileActionsOpen, setMobileActionsOpen] = useState(false);
  const mobileActionsTriggerRef = useRef<HTMLButtonElement>(null);
  const mobileActionsCloseRef = useRef<HTMLButtonElement>(null);
  const mobileActionsDialogRef = useRef<HTMLDivElement>(null);
  const fixtureChips = fixtureChipPresentations(player.fixtures, player.fixtureDifficulties ?? [], Math.max(horizon, 3), player.fixtureFullNames);
  const captainActionLabel = isCaptain
    ? localizedText(language, "Remove captain", "Снять капитана")
    : localizedText(language, "Make captain x2", "Сделать капитаном x2");
  const viceActionLabel = isVice
    ? localizedText(language, "Remove vice-captain", "Снять вице-капитана")
    : localizedText(language, "Make vice-captain", "Сделать вице-капитаном");
  const removeActionLabel = localizedText(language, `Remove ${player.name}`, `Удалить ${player.name}`);
  const closeActionsLabel = localizedText(language, "Close player actions", "Закрыть действия игрока");
  const mobileActionsLabel = localizedText(language, `Actions for ${player.name}`, `Действия: ${player.name}`);
  const mobileActionsTitleId = `mobile-player-actions-${player.playerId}`;
  const runMobileAction = (action: () => void) => {
    setMobileActionsOpen(false);
    action();
  };

  useEffect(() => {
    if (!mobileActionsOpen) return;
    const trigger = mobileActionsTriggerRef.current;
    const previousBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusFrame = window.requestAnimationFrame(() => mobileActionsCloseRef.current?.focus());
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setMobileActionsOpen(false);
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = [...(mobileActionsDialogRef.current?.querySelectorAll<HTMLButtonElement>("button:not([disabled])") ?? [])]
        .filter((element) => element.tabIndex >= 0);
      const first = focusable[0];
      const last = focusable.at(-1);
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousBodyOverflow;
      trigger?.focus();
    };
  }, [mobileActionsOpen]);

  return (
    <>
    <div
      draggable={Boolean(selection)}
      onDragStart={(event) => {
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData(squadDragDataType, player.playerId);
        event.dataTransfer.setData("text/plain", player.playerId);
        onDragStart(player.playerId);
      }}
      onDragEnd={onDragEnd}
      title={fantasyForecastTitle(player, language)}
      aria-label={localizedText(language, `Squad player ${player.name}`, `Игрок состава: ${player.name}`)}
      className={cn(
        compact ? "w-[4.5rem] sm:w-20" : "w-[4.5rem] sm:w-20 2xl:w-[5.5rem]",
        "relative cursor-grab rounded border bg-white px-1 py-0.5 text-center shadow-sm transition active:cursor-grabbing [@media(pointer:fine)]:pb-6",
        isCaptain ? "border-amber-400 ring-2 ring-amber-200" : "border-white/70",
        isDragging && "opacity-55 ring-2 ring-sky-300"
      )}
    >
      <span
        className="absolute left-0.5 top-0.5 max-w-5 truncate text-[8px] font-bold text-slate-500"
        title={player.teamName}
      >
        {fantasyPlayerTeamDisplayName(player)}
      </span>
      <button
        type="button"
        onClick={() => onRemove(player.playerId)}
        className="absolute right-0.5 top-0.5 z-10 inline-flex h-4 w-4 items-center justify-center rounded-full bg-white/90 text-rose-700 shadow-sm hover:bg-rose-50 [@media(pointer:coarse)]:h-6 [@media(pointer:coarse)]:w-6"
        aria-label={removeActionLabel}
      >
        <X className="h-3 w-3" />
        <span className="sr-only">{removeActionLabel}</span>
      </button>
      <div className="flex items-center justify-center gap-1">
        <span className={`rounded px-1 py-px text-[8px] font-bold ${positionPillClass(player.positionGroup)}`}>{player.positionGroup}</span>
      </div>
      <SquadPlayerPhoto player={player} />
      <p className="mt-0.5 truncate text-[10px] font-bold text-ink" title={player.name} aria-label={player.name}>{compactPlayerDisplayName(player.name)}</p>
      <dl className="mt-0.5 grid grid-cols-2 gap-x-1 gap-y-px text-[8px] leading-tight num-tabular">
        <div title={localizedText(language, "Primary forecast for the next round", "Основной прогноз на следующий тур")}>
          <dt className="text-[7px] font-semibold uppercase text-slate-500"><I18nText en="FP 1" ru="ФО 1" /></dt>
          <dd className="truncate text-[9px] font-bold text-emerald-700">{formatScore(nextFantasyPoints(player) * (isCaptain ? 2 : 1))}</dd>
        </div>
        <div title={localizedText(language, "Primary forecast for the next three rounds", "Основной прогноз на следующие три тура")}>
          <dt className="text-[7px] font-semibold uppercase text-slate-500"><I18nText en="FP 3" ru="ФО 3" /></dt>
          <dd className="truncate text-[9px] font-bold text-sky-700">{formatScore(playerHorizonPoints(player, 3))}</dd>
        </div>
        <div title={localizedText(language, "Alternative forecast for the next round", "Альтернативный прогноз на следующий тур")}>
          <dt className="text-[7px] font-semibold uppercase text-slate-500">Alt 1</dt>
          <dd className="truncate text-[9px] font-bold text-amber-700">{formatScore(player.alternativePredictedFp)}</dd>
        </div>
        <div title={localizedText(language, "Alternative forecast for the next three rounds", "Альтернативный прогноз на следующие три тура")}>
          <dt className="text-[7px] font-semibold uppercase text-slate-500">Alt 3</dt>
          <dd className="truncate text-[9px] font-bold text-violet-700">{formatScore(playerAlternativeHorizonPoints(player, 3))}</dd>
        </div>
      </dl>
      {fixtureChips.length > 0 ? (
        <div className="mt-0.5 flex min-w-0 items-center justify-center overflow-hidden">
          <FdrRow
            fixtures={fixtureChips.slice(0, 3)}
            className="min-w-0 flex-nowrap gap-0.5 overflow-hidden [&_.fdr-pill]:min-w-0 [&_.fdr-pill]:max-w-5 [&_.fdr-pill]:px-0.5 [&_.fdr-pill]:text-[9px]"
          />
        </div>
      ) : null}
      <button
        ref={mobileActionsTriggerRef}
        type="button"
        onClick={() => setMobileActionsOpen(true)}
        className="mt-1 hidden min-h-11 w-full items-center justify-center rounded border border-slate-200 text-slate-700 hover:bg-slate-50 [@media(pointer:coarse)]:inline-flex"
        aria-label={mobileActionsLabel}
      >
        <MoreHorizontal className="h-5 w-5" />
        <span className="sr-only"><I18nText en="Actions" ru="Действия" /></span>
      </button>
      <button
        type="button"
        onClick={() => onToggleCaptain(player.playerId)}
        className={cn(
          "absolute bottom-0.5 left-0.5 hidden h-5 w-5 items-center justify-center rounded border border-slate-200 text-[8px] font-black hover:bg-amber-50 [@media(pointer:fine)]:inline-flex",
          isCaptain ? "bg-amber-100 text-amber-700" : "bg-white text-slate-500"
        )}
        aria-label={captainActionLabel}
      >
        C
        <span className="sr-only">{captainActionLabel}</span>
      </button>
      <button
        type="button"
        onClick={() => onToggleVice(player.playerId)}
        className={cn(
          "absolute bottom-0.5 right-0.5 hidden h-5 w-5 items-center justify-center rounded border border-slate-200 text-[8px] font-black hover:bg-slate-50 [@media(pointer:fine)]:inline-flex",
          isVice ? "bg-slate-200 text-slate-950" : "bg-white text-slate-500"
        )}
        aria-label={viceActionLabel}
      >
        VC
        <span className="sr-only">{viceActionLabel}</span>
      </button>
    </div>
    {mobileActionsOpen && typeof document !== "undefined"
      ? createPortal(
          <div ref={mobileActionsDialogRef} className="fixed inset-0 z-[80]" role="dialog" aria-modal="true" aria-labelledby={mobileActionsTitleId}>
            <button type="button" tabIndex={-1} onClick={() => setMobileActionsOpen(false)} className="absolute inset-0 bg-slate-950/55" aria-label={closeActionsLabel} />
            <section className="absolute inset-x-0 bottom-0 max-h-[calc(100vh-1rem)] overflow-y-auto overscroll-contain rounded-t-2xl bg-white px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-3 text-left shadow-2xl [@supports(height:100dvh)]:max-h-[calc(100dvh-1rem)]">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500"><I18nText en="Player actions" ru="Действия игрока" /></p>
                  <h5 id={mobileActionsTitleId} className="truncate text-base font-bold text-ink" title={player.name}>{compactPlayerDisplayName(player.name)}</h5>
                </div>
                <button ref={mobileActionsCloseRef} type="button" onClick={() => setMobileActionsOpen(false)} className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded border border-slate-200" aria-label={closeActionsLabel}>
                  <X className="h-5 w-5" />
                </button>
              </div>
              <div className="grid gap-2">
                <button type="button" onClick={() => runMobileAction(() => onToggleCaptain(player.playerId))} className="flex min-h-11 items-center gap-3 rounded border border-slate-200 px-4 py-2 font-semibold text-slate-800">
                  <Crown className={cn("h-5 w-5", isCaptain && "fill-current text-amber-600")} />
                  {captainActionLabel}
                </button>
                <button type="button" onClick={() => runMobileAction(() => onToggleVice(player.playerId))} className="flex min-h-11 items-center gap-3 rounded border border-slate-200 px-4 py-2 font-semibold text-slate-800">
                  <span className="inline-flex h-5 w-5 items-center justify-center text-xs font-black">VC</span>
                  {viceActionLabel}
                </button>
              </div>
            </section>
          </div>,
          document.body
        )
      : null}
    </>
  );
}

function SquadPlayerPhoto({ player }: { player: FantasyPlannerPlayer }) {
  const [failed, setFailed] = useState(false);
  if (!player.photoUrl || failed) {
    return (
      <div aria-hidden="true" className="mx-auto mt-0.5 flex h-8 w-8 items-center justify-center rounded-full bg-slate-200 text-[10px] font-black text-slate-500 ring-1 ring-white">
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
      onError={() => setFailed(true)}
      className="mx-auto mt-0.5 h-8 w-8 rounded-full bg-slate-100 object-cover object-top ring-1 ring-white"
    />
  );
}

function fantasyForecastTitle(player: FantasyPlannerPlayer, language: UiLanguage) {
  const lines = [
    player.name,
    localizedText(language, `Forecast: ${formatScore(player.predictedFp)} FP`, `Прогноз: ${formatScore(player.predictedFp)} FP`)
  ];
  if (player.expectedMinutes !== null && player.expectedMinutes !== undefined) {
    lines.push(localizedText(language, `Expected minutes: ${Math.round(player.expectedMinutes)}`, `Ожидаемые минуты: ${Math.round(player.expectedMinutes)}`));
  }
  if (player.startProbability !== null && player.startProbability !== undefined) {
    lines.push(localizedText(language, `Historical start rate: ${Math.round(player.startProbability * 100)}%`, `Историческая доля стартов: ${Math.round(player.startProbability * 100)}%`));
  }
  if (player.forecastConfidence !== null && player.forecastConfidence !== undefined) {
    lines.push(localizedText(language, `Confidence heuristic: ${Math.round(player.forecastConfidence * 100)}%`, `Эвристика уверенности: ${Math.round(player.forecastConfidence * 100)}%`));
  }
  if (player.forecastFactors?.length) {
    lines.push(localizedText(language, "Positive factors:", "Положительные факторы:"), ...player.forecastFactors.map((factor) => `+ ${localizeForecastNote(factor, language)}`));
  }
  if (player.forecastRisks?.length) {
    lines.push(localizedText(language, "Risks:", "Риски:"), ...player.forecastRisks.map((risk) => `- ${localizeForecastNote(risk, language)}`));
  }
  if (player.forecastModelVersion) lines.push(localizedText(language, `Model: ${player.forecastModelVersion}`, `Модель: ${player.forecastModelVersion}`));
  if (player.forecastCalculatedAt) lines.push(localizedText(language, `Calculated: ${formatDate(player.forecastCalculatedAt)}`, `Расчёт: ${formatDate(player.forecastCalculatedAt)}`));
  if (player.forecastDataUpdatedAt) lines.push(localizedText(language, `Data updated: ${formatDate(player.forecastDataUpdatedAt)}`, `Данные обновлены: ${formatDate(player.forecastDataUpdatedAt)}`));
  return lines.join("\n");
}

function alternativePredictedFpTitle(language: UiLanguage) {
  return localizedText(
    language,
    "Alternative FP forecast for the next fixture. Display only: not used by auto-pick, value, transfers, or round points.",
    "Альтернативный прогноз FP на следующий матч. Только для просмотра: не используется в автоподборе, ценности, трансферах и очках тура."
  );
}

function alternativeFiveRoundFpTitle(language: UiLanguage) {
  return localizedText(
    language,
    "Total alternative FP forecast over the next five rounds, calculated from each round's fixtures.",
    "Суммарный альтернативный прогноз FP на следующие пять туров, рассчитанный по матчам каждого тура."
  );
}

function playerAlternativeHorizonPoints(player: FantasyPlannerPlayer, horizon: number) {
  if (!player.alternativeRoundPoints) return null;
  const values = player.alternativeRoundPoints.slice(0, horizon).filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  if (values.length === 0) return null;
  return Math.round(values.reduce((total, value) => total + value, 0) * 100) / 100;
}

function playerPoolColumnTitles(language: UiLanguage, horizon: number) {
  return {
    player: localizedText(language, "Player name and primary fantasy-points forecast.", "Имя игрока и основной прогноз fantasy-очков."),
    team: localizedText(language, "Player's club. The compact code is shown; hover a row value for the full name.", "Клуб игрока. Показан короткий код; полное название доступно при наведении на значение."),
    position: localizedText(language, "Fantasy position: goalkeeper, defender, midfielder, or forward.", "Фэнтези-позиция: вратарь, защитник, полузащитник или нападающий."),
    price: localizedText(language, "Current fantasy price. A tilde marks an estimated price.", "Текущая фэнтези-цена. Тильда означает оценочную цену."),
    next: localizedText(language, "Primary fantasy-points forecast for the next fixture.", "Основной прогноз fantasy-очков на ближайший матч."),
    alternative: alternativePredictedFpTitle(language),
    alternativeFive: alternativeFiveRoundFpTitle(language),
    horizon: localizedText(language, `Total primary forecast over the selected ${horizon}-round horizon.`, `Суммарный основной прогноз на выбранном горизонте в ${horizon} туров.`),
    fixtures: localizedText(language, "Upcoming opponents. Home fixtures are bold; underline colour shows difficulty from green (easy) to red (hard). Hover an opponent for the full club name.", "Ближайшие соперники. Домашние матчи выделены жирным; цвет нижней границы показывает сложность от зелёного (легко) до красного (сложно). Полное название клуба доступно при наведении."),
    action: localizedText(language, "Add the player to the squad or remove the selected player.", "Добавить игрока в состав или убрать уже выбранного игрока.")
  };
}

function localizeForecastNote(value: string, language: UiLanguage) {
  if (language !== "ru") return value;
  if (value === "Active-roster starter flag") return "признак игрока основы в активном составе";
  if (value === "Five-match historical sample") return "историческая выборка из пяти матчей";
  if (value === "Recent fantasy-points trend is positive") return "положительный тренд fantasy-очков";
  if (value === "Favourable upcoming fixture") return "благоприятный ближайший матч";
  if (value === "No prior match statistics") return "нет статистики прошлых матчей";
  if (value === "Low forecast confidence") return "низкая уверенность прогноза";
  if (value === "Upcoming fixture strength is unavailable") return "нет оценки силы ближайшего соперника";
  if (value === "Difficult upcoming fixture") return "сложный ближайший матч";
  if (value === "Historical per-match event rates") return "исторические показатели событий за матч";
  if (value.startsWith("Expected minutes only ")) return `ожидается мало минут: ${value.slice("Expected minutes only ".length)}`;
  if (value.startsWith("Expected minutes ")) return `ожидаемые минуты: ${value.slice("Expected minutes ".length)}`;
  return value;
}

function readStoredSquadCaptains(storageKey: string, selectedPlayerIds: Set<string>): StoredSquadCaptains {
  if (typeof window === "undefined") return { captainId: null, viceCaptainId: null };

  try {
    const parsed = JSON.parse(window.localStorage.getItem(storageKey) ?? "{}") as Partial<StoredSquadCaptains>;
    const captainId = typeof parsed.captainId === "string" && selectedPlayerIds.has(parsed.captainId) ? parsed.captainId : null;
    const viceCaptainId =
      typeof parsed.viceCaptainId === "string" && selectedPlayerIds.has(parsed.viceCaptainId) && parsed.viceCaptainId !== captainId
        ? parsed.viceCaptainId
        : null;

    return { captainId, viceCaptainId };
  } catch {
    return { captainId: null, viceCaptainId: null };
  }
}

function writeStoredSquadCaptains(storageKey: string, captains: StoredSquadCaptains) {
  if (typeof window === "undefined") return;

  if (!captains.captainId && !captains.viceCaptainId) {
    window.localStorage.removeItem(storageKey);
    return;
  }

  window.localStorage.setItem(storageKey, JSON.stringify(captains));
}

function withCaptainState(selections: FantasySquadSelection[], captainId: string | null, viceCaptainId: string | null) {
  return sanitizeCaptainRoles(
    selections.map((selection) => ({
      ...selection,
      isCaptain: selection.playerId === captainId,
      isViceCaptain: selection.playerId === viceCaptainId && selection.playerId !== captainId
    }))
  );
}

function sanitizeCaptainRoles(selections: FantasySquadSelection[]) {
  let captainAssigned = false;
  let viceAssigned = false;
  let captainId: string | null = null;

  return selections.map((selection) => {
    const isCaptain = selection.isStarter && selection.isCaptain && !captainAssigned;
    if (isCaptain) {
      captainAssigned = true;
      captainId = selection.playerId;
    }

    const isViceCaptain = selection.isStarter && selection.isViceCaptain && selection.playerId !== captainId && !isCaptain && !viceAssigned;
    if (isViceCaptain) viceAssigned = true;

    return {
      ...selection,
      isCaptain,
      isViceCaptain
    };
  });
}

function squadStrategyCopy(language: UiLanguage, strategy: FantasySquadStrategy) {
  if (strategy === "reliable") {
    return {
      label: localizedText(language, "Reliable", "Надёжность"),
      description: localizedText(
        language,
        "Weights expected minutes, historical starts and confidence; penalizes stated risks and estimated prices.",
        "Учитывает ожидаемые минуты, долю стартов и уверенность; штрафует явные риски и оценочные цены."
      )
    };
  }
  if (strategy === "upside") {
    return {
      label: localizedText(language, "Upside", "Потенциал"),
      description: localizedText(
        language,
        "Rewards the forecast ceiling and round-to-round variance; this option is intentionally less stable.",
        "Повышает вес потолка прогноза и разброса по турам; этот вариант намеренно менее стабилен."
      )
    };
  }
  return {
    label: localizedText(language, "Balanced", "Баланс"),
    description: localizedText(
      language,
      "Maximizes raw projected points over the selected horizon.",
      "Максимизирует исходный прогноз очков на выбранном горизонте."
    )
  };
}

function signedNumber(value: number) {
  if (value > 0) return `+${formatNumber(value, 1)}`;
  return formatNumber(value, 1);
}

function signedScore(value: number) {
  if (value > 0) return `+${formatScore(value)}`;
  return formatScore(value);
}

function actionableTransferRisks(risks: readonly string[]) {
  return risks.filter((risk) => risk !== "Paid-transfer point cost is not configured");
}

function localizeTransferRisk(value: string) {
  if (value === "Paid-transfer point cost is not configured") return "стоимость платного трансфера не настроена";
  if (value === "At least one move loses projected points next round") return "хотя бы один ход теряет очки в следующем туре";
  if (value === "The loaded schedule does not cover every 3/5-round comparison") return "календарь не покрывает весь горизонт 3/5 туров";
  if (value === "At least one incoming player has low forecast confidence") return "у одного из новых игроков низкая уверенность прогноза";
  if (value === "At least one incoming player has fewer than 60 expected minutes") return "у одного из новых игроков ожидается меньше 60 минут";
  return value;
}

function localizeAddBlockReason(reason: string, language: UiLanguage) {
  if (reason === "Already in squad") return localizedText(language, reason, "Уже в составе");
  if (reason === "Squad is full") return localizedText(language, reason, "Состав заполнен");
  if (reason === "Budget limit") return localizedText(language, reason, "Лимит бюджета");

  const positionLimit = reason.match(/^(GK|DEF|MID|FWD|UNK) limit reached$/);
  if (positionLimit) return localizedText(language, reason, `Лимит ${positionLimit[1]} достигнут`);

  const teamLimit = reason.match(/^(.+) limit reached$/);
  if (teamLimit) return localizedText(language, reason, `Лимит команды ${teamLimit[1]} достигнут`);

  return reason;
}

function fantasyPlayerTeamDisplayName(player: FantasyPlannerPlayer) {
  return player.teamShortName?.trim() || player.teamName;
}

function buildSquadDiff(
  savedSelections: FantasySquadSelection[],
  currentSelections: FantasySquadSelection[],
  savedSummary: ReturnType<typeof summarizeFantasySquad>,
  currentSummary: ReturnType<typeof summarizeFantasySquad>
): SquadDiff {
  const savedById = new Map(savedSelections.map((selection) => [selection.playerId, selection]));
  const currentById = new Map(currentSelections.map((selection) => [selection.playerId, selection]));
  const changedPlayerIds = new Set<string>();
  let added = 0;
  let removed = 0;
  let starterChanges = 0;
  let lockChanges = 0;
  let captainChanges = 0;

  for (const selection of currentSelections) {
    const saved = savedById.get(selection.playerId);
    if (!saved) {
      added += 1;
      changedPlayerIds.add(selection.playerId);
      continue;
    }
    if (saved.isStarter !== selection.isStarter) {
      starterChanges += 1;
      changedPlayerIds.add(selection.playerId);
    }
    if (saved.isLocked !== selection.isLocked) {
      lockChanges += 1;
      changedPlayerIds.add(selection.playerId);
    }
    if (saved.isCaptain !== selection.isCaptain || saved.isViceCaptain !== selection.isViceCaptain) {
      captainChanges += 1;
      changedPlayerIds.add(selection.playerId);
    }
  }

  for (const selection of savedSelections) {
    if (!currentById.has(selection.playerId)) {
      removed += 1;
      changedPlayerIds.add(selection.playerId);
    }
  }

  return {
    changeCount: changedPlayerIds.size,
    added,
    removed,
    starterChanges,
    lockChanges,
    captainChanges,
    transferCount: countFantasySquadTransfers(savedSelections, currentSelections),
    nextDelta: currentSummary.projectedNext - savedSummary.projectedNext,
    horizonDelta: currentSummary.projectedHorizon - savedSummary.projectedHorizon
  };
}

function positionPillClass(position: FantasyPositionGroup) {
  const base = "border border-black/10 text-white shadow-sm";
  if (position === "GK") return `${base} bg-violet-700`;
  if (position === "DEF") return `${base} bg-blue-700`;
  if (position === "MID") return `${base} bg-emerald-700`;
  if (position === "FWD") return `${base} bg-rose-700`;
  return `${base} bg-slate-700`;
}

function normalizeInitialSelections(selections: FantasySquadSelection[], players: FantasyPlannerPlayer[], rules: FantasySquadRules) {
  const playersById = new Map(players.map((player) => [player.playerId, player]));
  const sorted = selections
    .filter((selection) => playersById.has(selection.playerId))
    .sort((left, right) => left.slotIndex - right.slotIndex);
  const normalized: FantasySquadSelection[] = [];

  for (const selection of sorted) {
    const player = playersById.get(selection.playerId);
    const wantsStarter = selection.isStarter && player ? canStartFantasyPlayer(player, players, normalized, rules) : false;
    normalized.push({ ...selection, isStarter: wantsStarter, slotIndex: normalized.length });
  }

  const starterCount = () => normalized.filter((selection) => selection.isStarter).length;
  if (starterCount() < rules.starterSize) {
    const candidates = normalized
      .filter((selection) => !selection.isStarter)
      .map((selection) => playersById.get(selection.playerId))
      .filter((player): player is FantasyPlannerPlayer => Boolean(player))
      .sort((left, right) => playerHorizonPoints(right, 1) - playerHorizonPoints(left, 1));

    for (const player of candidates) {
      if (starterCount() >= rules.starterSize) break;
      if (!canStartFantasyPlayer(player, players, normalized, rules)) continue;
      const index = normalized.findIndex((selection) => selection.playerId === player.playerId);
      if (index >= 0) normalized[index] = { ...normalized[index], isStarter: true };
    }
  }

  return sanitizeCaptainRoles(normalized);
}

function fantasyPlayerAtRoundOffset(player: FantasyPlannerPlayer, roundOffset: number): FantasyPlannerPlayer {
  if (roundOffset <= 0) return player;
  return {
    ...player,
    predictedFp: player.roundPoints[roundOffset] ?? null,
    alternativePredictedFp: player.alternativeRoundPoints?.[roundOffset] ?? null,
    alternativeRoundPoints: player.alternativeRoundPoints?.slice(roundOffset),
    roundPoints: player.roundPoints.slice(roundOffset),
    fixtures: player.fixtures.slice(roundOffset),
    fixtureFullNames: player.fixtureFullNames?.slice(roundOffset),
    fixtureDifficulties: player.fixtureDifficulties.slice(roundOffset)
  };
}

function cloneFantasyRoundPlans(plans: FantasySquadRoundPlan[]) {
  return plans.map((plan) => ({
    ...plan,
    selections: plan.selections.map((selection) => ({ ...selection }))
  }));
}

function normalizePlannerRoundPlans(
  plans: FantasySquadRoundPlan[] | undefined,
  fallbackSelections: FantasySquadSelection[],
  players: FantasyPlannerPlayer[],
  rules: FantasySquadRules
) {
  const source = plans?.length === 5 ? plans : createFantasySquadRoundPlans(fallbackSelections);
  return source.map((plan, roundOffset) => ({
    roundOffset,
    linkedToPrevious: roundOffset > 0 && plan.linkedToPrevious,
    selections: normalizeInitialSelections(plan.selections, players, rules)
  }));
}

function promoteStarter(
  player: FantasyPlannerPlayer,
  players: FantasyPlannerPlayer[],
  selections: FantasySquadSelection[],
  rules: FantasySquadRules,
  horizon: number
) {
  const direct = selections.map((selection) =>
    selection.playerId === player.playerId ? { ...selection, isStarter: true } : selection
  );
  if (summarizeFantasySquad(players, direct, rules, horizon).violations.length === 0) return direct;

  const playersById = new Map(players.map((item) => [item.playerId, item]));
  const demotionCandidates = selections
    .filter((selection) => selection.isStarter && !selection.isLocked && selection.playerId !== player.playerId)
    .map((selection) => playersById.get(selection.playerId))
    .filter((candidate): candidate is FantasyPlannerPlayer => Boolean(candidate))
    .filter((candidate) => (player.positionGroup === "GK" ? candidate.positionGroup === "GK" : candidate.positionGroup !== "GK"))
    .sort((left, right) => playerHorizonPoints(left, horizon) - playerHorizonPoints(right, horizon));

  for (const candidate of demotionCandidates) {
    const swapped = selections.map((selection) =>
      selection.playerId === player.playerId
        ? { ...selection, isStarter: true }
        : selection.playerId === candidate.playerId
          ? { ...selection, isStarter: false }
          : selection
    );
    if (summarizeFantasySquad(players, swapped, rules, horizon).violations.length === 0) return swapped;
  }

  return null;
}

function squadVariantHref(leagueId: string, season: string, squadId: string | null, historySettings: FantasyHistorySettings) {
  const params = new URLSearchParams({ leagueId, season });
  applyFantasyHistorySearchParams(params, historySettings);
  if (squadId) params.set("squadId", squadId);
  return `/machete/squad?${params.toString()}`;
}

function fantasyHistoryScopeLabel(scope: FantasyHistoryScope, language: UiLanguage) {
  if (scope === "ALL_LOADED") return localizedText(language, "All loaded competitions", "Все загруженные турниры");
  if (scope === "SAME_COUNTRY_CLUB") return localizedText(language, "Team-country club competitions", "Клубные турниры страны команды");
  if (scope === "SELECTED_PLUS_UEFA") return localizedText(language, "Selected + Champions / Europa League", "Выбранный + ЛЧ / ЛЕ");
  return localizedText(language, "Selected competition", "Выбранный турнир");
}

function fantasyHistoryWindowLabel(window: FantasyHistoryWindow, language: UiLanguage) {
  if (window === "SELECTED_SEASONS") return localizedText(language, "Selected seasons", "Выбранные сезоны");
  if (window === "ALL_LOADED") return localizedText(language, "All loaded seasons", "Все загруженные сезоны");
  return localizedText(language, "Last 5 matches", "Последние 5 матчей");
}

function localUniqueSquadName(existingNames: string[], baseName: string) {
  const used = new Set(existingNames.map((name) => name.trim().toLocaleLowerCase()));
  if (!used.has(baseName.toLocaleLowerCase())) return baseName;
  for (let index = 2; index < 1_000; index += 1) {
    const candidate = `${baseName} ${index}`;
    if (!used.has(candidate.toLocaleLowerCase())) return candidate;
  }
  return `${baseName} ${Date.now()}`;
}
