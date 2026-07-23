"use client";

import { ArrowLeft, ArrowRight, Bookmark, Check, Columns3, Copy, Crown, Download, FilePlus2, Layers3, ListChecks, Lock, MoreHorizontal, Plus, Save, Search, SlidersHorizontal, Sparkles, Trash2, Users, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { type DragEvent, type PointerEvent as ReactPointerEvent, type ReactNode, type RefObject, type SetStateAction, useDeferredValue, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";

import { I18nText } from "@/components/i18n-text";
import { LocalizedOption, localizedText, useLanguage } from "@/components/localized-option";
import {
  fixtureChipPresentations,
  orderSquadSelectionsWithBenchGoalkeeperLast,
  startingXiAlternativeHorizonPoints,
  startingXiAlternativeRoundPoints,
  startingXiFoontasyPoints,
  startingXiRoundPoints,
  swapSquadSelectionCards
} from "@/components/machete/fantasy-squad-ui";
import { SortableTable } from "@/components/sortable-table";
import { FdrRow } from "@/components/ui/fdr-pill";
import { SegmentedControl, type SegmentedOption } from "@/components/ui/segmented-control";
import { compactPriceHeaderThreshold, responsivePriceHeaderLabel } from "@/components/machete/responsive-price-label";
import type {
  FantasySquadWorkerRequest,
  FantasySquadWorkerResponse,
  TransferSuggestionWorkerInput
} from "@/components/machete/fantasy-squad-worker-contract";
import { formatAlternativeScore, formatCompactScore, formatDate, formatNumber, formatScore } from "@/lib/format";
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
  createFantasyAddEvaluator,
  createFantasyFitEvaluator,
  createFantasySquadRoundPlans,
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
  type FantasyFitEvaluator,
  type FantasyPlannerPlayer,
  type FantasyPositionGroup,
  type FantasyRoundProjection,
  type FantasyProjectionFixtureInputs,
  type FantasySquadRules,
  type FantasySquadRoundPlan,
  type FantasySquadOptimizationInput,
  type FantasySquadSelection,
  type FantasySquadStrategy,
  type TransferPlanSuggestion
} from "@/machete/squad_logic";
import type { SavedFantasySquad, SavedFantasySquadOption } from "@/machete/squad_planner";
import type { PlannerReadiness } from "@/machete/planner_readiness";
import type { SquadFilterPreset, SquadFilterPresetFilters } from "@/machete/squad-filter-presets";
import {
  defaultSquadTableColumns,
  emptySquadTableValueFilter,
  moveSquadTableColumn,
  squadTableValueFilterIsActive,
  squadTableValueMatchesFilter,
  type SquadTableValueFilter
} from "@/machete/squad-table-columns";
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
  initialVisiblePlayerPoolColumns: string[];
  initialPlayerPoolColumnWidths: Record<string, number>;
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

export function FantasySquadPlanner({ leagueId, season, rules, rounds, players: initialPlayers, playerPoolHref, initialSquad, savedSquads, readiness, priceStatus, historySettings, historySeasonOptions, initialVisiblePlayerPoolColumns, initialPlayerPoolColumnWidths }: FantasySquadPlannerProps) {
  const language = useLanguage();
  const router = useRouter();
  const budgetForecastRef = useRef<HTMLDivElement>(null);
  const suggestionPanelRef = useRef<HTMLDivElement>(null);
  const [sourcePlayers, setSourcePlayers] = useState<FantasyPlannerPlayer[]>(initialPlayers);
  const [appliedHistorySettings, setAppliedHistorySettings] = useState(historySettings);
  const [playerPoolRequestHref, setPlayerPoolRequestHref] = useState(playerPoolHref);
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
  const selections = useMemo(() => roundPlans[activeRoundOffset]?.selections ?? [], [activeRoundOffset, roundPlans]);
  const savedSelections = useMemo(() => savedRoundPlans[activeRoundOffset]?.selections ?? [], [activeRoundOffset, savedRoundPlans]);
  const [activeSquadId, setActiveSquadId] = useState<string | null>(initialSquad.id);
  const [squadName, setSquadName] = useState(initialSquad.name);
  const [squadOptions, setSquadOptions] = useState<SavedFantasySquadOption[]>(savedSquads);
  const captainStorageKey = `fantasy-squad-captains:${leagueId}:${season}:${activeSquadId ?? "new"}:${activeRoundOffset}`;
  const [horizon, setHorizon] = useState(initialHorizon);
  const [tableHorizon, setTableHorizon] = useState<3 | 5>(5);
  const [exportColumnKeys, setExportColumnKeys] = useState(initialVisiblePlayerPoolColumns);
  const playerNameQueryRef = useRef("");
  const playerPoolMaskRootRef = useRef<HTMLDivElement>(null);
  const [presetNameQuery, setPresetNameQuery] = useState("");
  const [presetNameQueryRevision, setPresetNameQueryRevision] = useState(0);
  const [teamFilter, setTeamFilter] = useState("ALL");
  const [positionFilter, setPositionFilter] = useState("ALL");
  const [minimumPrice, setMinimumPrice] = useState<number | null>(null);
  const [maximumPrice, setMaximumPrice] = useState<number | null>(null);
  const [advancedTableFilters, setAdvancedTableFilters] = useState<Record<string, SquadTableValueFilter>>({});
  const [onlyAffordable, setOnlyAffordable] = useState(false);
  const [filterPresets, setFilterPresets] = useState<SquadFilterPreset[]>([]);
  const [filterPresetsPending, setFilterPresetsPending] = useState(false);
  const [selectedFilterPresetId, setSelectedFilterPresetId] = useState<string | null>(null);
  const [fitsPreparing, setFitsPreparing] = useState(false);
  const [fitCalculation, setFitCalculation] = useState<{
    evaluator: FantasyFitEvaluator;
    eligiblePlayerIds: Set<string>;
  } | null>(null);
  const [autoPickStrategy, setAutoPickStrategy] = useState<FantasySquadStrategy>("balanced");
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [savePending, setSavePending] = useState(false);
  const [deletePending, setDeletePending] = useState(false);
  const [tableExportPending, setTableExportPending] = useState(false);
  const interactionPending = isPending || savePending || deletePending;
  const [mobileTab, setMobileTab] = useState<MobileTab>("squad");
  const [showAllSuggestions, setShowAllSuggestions] = useState(false);
  const [draggedPlayerId, setDraggedPlayerId] = useState<string | null>(null);
  const [postLoadContentReady, setPostLoadContentReady] = useState(false);
  const [betaAutoPickComplete, setBetaAutoPickComplete] = useState(false);
  const [autoPickPending, setAutoPickPending] = useState(false);
  const autoPickRevisionRef = useRef(0);
  const playerPoolReady = !playerPoolRequestHref || (!playerPoolPending && !playerPoolFailed);
  const historyDraft: FantasyHistorySettings = {
    scope: historyScopeDraft,
    window: historyWindowDraft,
    selectedSeasons: historyWindowDraft === "SELECTED_SEASONS" ? historySeasonsDraft : []
  };
  const historySelectionChanged = fantasyHistorySettingsKey(historyDraft) !== fantasyHistorySettingsKey(appliedHistorySettings);
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
  const teamFilterOptions = useMemo(() => [...new Map(players
    .filter((player) => player.teamId)
    .map((player) => [player.teamId!, { id: player.teamId!, name: player.teamName }])).values()]
    .sort((left, right) => left.name.localeCompare(right.name)), [players]);
  const priceFilterOptions = useMemo(() => [...new Set(players.map((player) => player.price))].sort((left, right) => left - right), [players]);
  const playerPoolColumns = useMemo(() => playerPoolOptionalColumns(players, tableHorizon, language), [language, players, tableHorizon]);
  const advancedFilterColumns = useMemo(() => playerPoolColumns.map(({ key, label, title, numeric }) => ({ key, label, title, numeric })), [playerPoolColumns]);
  const deferredAdvancedTableFilters = useDeferredValue(advancedTableFilters);
  const activeAdvancedFilterColumns = useMemo(() => advancedFilterColumns.filter((column) =>
    squadTableValueFilterIsActive(deferredAdvancedTableFilters[column.key] ?? emptySquadTableValueFilter, column.numeric)
  ), [advancedFilterColumns, deferredAdvancedTableFilters]);
  const activeAdvancedFilterCount = activeAdvancedFilterColumns.length;
  const fantasyAddEvaluator = useMemo(() => createFantasyAddEvaluator(players, selections, rules), [players, rules, selections]);
  const fantasyFitEvaluator = useMemo(() => createFantasyFitEvaluator(players, selections, rules), [players, rules, selections]);

  useEffect(() => {
    if (!onlyAffordable) return;
    let cancelled = false;

    async function calculateFits() {
      await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
      if (cancelled) return;
      setFitsPreparing(true);
      const eligiblePlayerIds = new Set<string>();
      for (let index = 0; index < players.length; index += 1) {
        const player = players[index];
        if (fantasyFitEvaluator.reason(player) === null) eligiblePlayerIds.add(player.playerId);
        if (index > 0 && index % 48 === 0) {
          await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
          if (cancelled) return;
        }
      }
      if (cancelled) return;
      setFitCalculation({ evaluator: fantasyFitEvaluator, eligiblePlayerIds });
      setFitsPreparing(false);
    }

    void calculateFits();
    return () => {
      cancelled = true;
    };
  }, [fantasyFitEvaluator, onlyAffordable, players]);

  const baseMatchingPlayers = useMemo(() => {
    return players
      .filter((player) => (positionFilter === "ALL" ? true : player.positionGroup === positionFilter))
      .filter((player) => (teamFilter === "ALL" ? true : player.teamId === teamFilter))
      .filter((player) => minimumPrice === null || player.price >= minimumPrice)
      .filter((player) => maximumPrice === null || player.price <= maximumPrice)
      .filter((player) => activeAdvancedFilterColumns.every((column) => squadTableValueMatchesFilter(
        playerPoolFilterValue(column.key, player, tableHorizon),
        deferredAdvancedTableFilters[column.key] ?? emptySquadTableValueFilter,
        column.numeric
      )));
  }, [activeAdvancedFilterColumns, deferredAdvancedTableFilters, maximumPrice, minimumPrice, players, positionFilter, tableHorizon, teamFilter]);
  const matchingPlayers = useMemo(() => {
    if (!onlyAffordable || fitCalculation?.evaluator !== fantasyFitEvaluator) return baseMatchingPlayers;
    return baseMatchingPlayers.filter((player) => selectionsByPlayerId.has(player.playerId) || fitCalculation.eligiblePlayerIds.has(player.playerId));
  }, [baseMatchingPlayers, fantasyFitEvaluator, fitCalculation, onlyAffordable, selectionsByPlayerId]);
  const filteredPlayers = matchingPlayers;

  useEffect(() => {
    void recordBetaMilestone("PLANNER_OPENED");
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void loadSquadFilterPresets(controller.signal).then((presets) => {
      if (presets) setFilterPresets(presets);
    });
    return () => controller.abort();
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
    const revealHandle = window.setTimeout(() => setPostLoadContentReady(true), 0);
    return () => window.clearTimeout(revealHandle);
  }, []);

  useEffect(() => {
    if (!postLoadContentReady || !playerPoolRequestHref) return;

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
    void fetch(playerPoolRequestHref, {
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
        setHistoryApplying(false);
      })
      .catch((error: unknown) => {
        if (lifecycleCancelled || controller.signal.aborted || (error instanceof Error && error.name === "AbortError")) return;
        requestCompleted = true;
        console.error("Failed to load fantasy player pool.", error);
        void recordBetaClientError("PLAYER_POOL_LOAD_FAILED");
        setPlayerPoolFailed(true);
        setPlayerPoolPending(false);
        setHistoryApplying(false);
      });

    return () => {
      window.removeEventListener("pagehide", handlePageHide);
      window.removeEventListener("pageshow", handlePageShow);
      lifecycleCancelled = true;
      controller.abort();
    };
  }, [playerPoolRequestHref, playerPoolRetry, postLoadContentReady]);

  function applyHistorySettings() {
    if (historyWindowDraft === "SELECTED_SEASONS" && historySeasonsDraft.length === 0) {
      setMessage(localizedText(language, "Choose at least one loaded season.", "Выберите хотя бы один загруженный сезон."));
      return;
    }
    requestHistorySettings(historyDraft);
  }

  function applyQuickHistoryScope(scope: FantasyHistoryScope) {
    if (scope === appliedHistorySettings.scope) return;
    setHistoryScopeDraft(scope);
    requestHistorySettings({ ...appliedHistorySettings, scope });
  }

  function requestHistorySettings(nextSettings: FantasyHistorySettings) {
    if (!playerPoolHref) return;
    setAppliedHistorySettings(nextSettings);
    setHistoryApplying(true);
    setPlayerPoolFailed(false);
    setPlayerPoolPending(true);

    const pageUrl = new URL(window.location.href);
    applyFantasyHistorySearchParams(pageUrl.searchParams, nextSettings);
    window.history.replaceState(window.history.state, "", `${pageUrl.pathname}?${pageUrl.searchParams.toString()}`);

    const poolUrl = new URL(playerPoolHref, window.location.origin);
    applyFantasyHistorySearchParams(poolUrl.searchParams, nextSettings);
    setPlayerPoolRequestHref(`${poolUrl.pathname}?${poolUrl.searchParams.toString()}`);
  }

  function currentFilterPresetValue(): SquadFilterPresetFilters {
    return {
      version: 1,
      query: playerNameQueryRef.current,
      teamName: teamFilter === "ALL" ? null : teamFilterOptions.find((team) => team.id === teamFilter)?.name ?? null,
      position: positionFilter as SquadFilterPresetFilters["position"],
      minimumPrice,
      maximumPrice,
      horizon: tableHorizon,
      onlyAffordable,
      historyScope: appliedHistorySettings.scope === "ALL_PLAYER_MATCHES" ? "ALL_PLAYER_MATCHES" : "ALL_LOADED",
      advancedFilters: advancedTableFilters
    };
  }

  function applyFilterPreset(preset: SquadFilterPreset) {
    const filters = preset.filters;
    const matchingTeam = filters.teamName
      ? teamFilterOptions.find((team) => team.name.localeCompare(filters.teamName!, undefined, { sensitivity: "base" }) === 0)
      : null;
    playerNameQueryRef.current = filters.query;
    setPresetNameQuery(filters.query);
    setPresetNameQueryRevision((current) => current + 1);
    setTeamFilter(matchingTeam?.id ?? "ALL");
    setPositionFilter(filters.position);
    setMinimumPrice(filters.minimumPrice);
    setMaximumPrice(filters.maximumPrice);
    setTableHorizon(filters.horizon);
    setOnlyAffordable(filters.onlyAffordable);
    setFitsPreparing(filters.onlyAffordable);
    if (!filters.onlyAffordable) setFitCalculation(null);
    setAdvancedTableFilters(filters.advancedFilters);
    setSelectedFilterPresetId(preset.id);
    applyQuickHistoryScope(filters.historyScope);
  }

  async function saveFilterPreset(name: string) {
    setFilterPresetsPending(true);
    const presets = await saveSquadFilterPreset(name, currentFilterPresetValue());
    setFilterPresetsPending(false);
    if (!presets) {
      setMessage(localizedText(language, "Could not save the filter preset.", "Не удалось сохранить пресет фильтров."));
      return false;
    }
    setFilterPresets(presets);
    const saved = presets.find((preset) => preset.name.localeCompare(name.trim(), undefined, { sensitivity: "base" }) === 0);
    setSelectedFilterPresetId(saved?.id ?? null);
    return true;
  }

  async function deleteFilterPreset(id: string) {
    setFilterPresetsPending(true);
    const presets = await removeSquadFilterPreset(id);
    setFilterPresetsPending(false);
    if (!presets) {
      setMessage(localizedText(language, "Could not delete the filter preset.", "Не удалось удалить пресет фильтров."));
      return;
    }
    setFilterPresets(presets);
    if (selectedFilterPresetId === id) setSelectedFilterPresetId(null);
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
    const blockReason = fantasyAddEvaluator.reason(player);
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

  function handleDropOnPlayer(sourcePlayerId: string, targetPlayerId: string) {
    const result = swapSquadSelectionCards(selections, players, sourcePlayerId, targetPlayerId);
    setDraggedPlayerId(null);
    if (!result.ok) {
      setMessage(result.reason === "GOALKEEPER_MISMATCH"
        ? localizedText(language, "A goalkeeper can only swap with another goalkeeper.", "Вратаря можно менять местами только с другим вратарём.")
        : localizedText(language, "Could not find both players in the squad.", "Не удалось найти обоих игроков в составе."));
      return;
    }

    const nextSelections = sanitizeCaptainRoles(result.selections);
    if (summarizeFantasySquad(players, nextSelections, rules, horizon).violations.length > 0) {
      setMessage(localizedText(
        language,
        "This swap would break the starting XI formation rules.",
        "Такая перестановка нарушит правила расстановки стартового состава."
      ));
      return;
    }

    setSelections(nextSelections);
    setMessage(null);
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
              historyScope: appliedHistorySettings.scope,
              historyWindow: appliedHistorySettings.window,
              historySeasons: appliedHistorySettings.selectedSeasons,
              selections: roundPlansToSave[0].selections,
              roundPlans: roundPlansToSave,
              roundPlanRoundIds: rounds.map((round) => round.id)
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
        router.replace(squadVariantHref(leagueId, season, savedSquadId, appliedHistorySettings));
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
    router.push(squadVariantHref(leagueId, season, squadId, appliedHistorySettings));
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
          router.replace(squadVariantHref(leagueId, season, next.id, appliedHistorySettings));
          return;
        }
        setActiveSquadId(null);
        setSquadName(localizedText(language, "My squad", "Мой состав"));
        const blankPlans = createFantasySquadRoundPlans([]);
        setRoundPlans(blankPlans);
        setSavedRoundPlans(cloneFantasyRoundPlans(blankPlans));
        setActiveRoundOffset(0);
        setMessage(localizedText(language, "Squad deleted.", "Состав удалён."));
        router.replace(squadVariantHref(leagueId, season, null, appliedHistorySettings));
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
  const nextRoundFoontasy = startingXiFoontasyPoints(summary.starterPlayers, captainId);
  const nextRoundFoontasyTotal = summary.starterPlayers.length === rules.starterSize ? nextRoundFoontasy.total : null;

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
            <Metric
              label={<I18nText en="Next round" ru="След. тур" />}
              value={formatScore(summary.projectedNext)}
              secondaryLabel={<I18nText en="Alt" ru="Альт" />}
              secondaryValue={formatAlternativeScore(startingXiAlternativeRoundPoints(summary.starterPlayers, 0, captainId))}
              tertiaryLabel="FFO"
              tertiaryValue={formatScore(nextRoundFoontasyTotal)}
              tone="good"
            />
            <Metric
              label={<I18nText en={`Horizon ${horizon}R`} ru={`Горизонт ${horizon}т`} />}
              value={formatScore(summary.projectedHorizon)}
              secondaryLabel={<I18nText en="Alt" ru="Альт" />}
              secondaryValue={formatAlternativeScore(startingXiAlternativeHorizonPoints(summary.starterPlayers, horizon, captainId))}
              tone="accent"
            />
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
        <div className="grid min-w-0 grid-cols-1 gap-4 xl:grid-cols-[minmax(360px,0.76fr)_minmax(620px,1.24fr)] 2xl:grid-cols-[minmax(390px,0.72fr)_minmax(760px,1.28fr)]">
          <div className={cn(mobileTab === "squad" ? "block" : "hidden xl:block")}>
            <div className="mb-3 flex items-center justify-between gap-3">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500"><I18nText en="Your squad" ru="Ваш состав" /></h3>
              <button
                type="button"
                onClick={() => saveSquad(false)}
                disabled={interactionPending || autoPickPending || !squadIsValid}
                className="btn-brand inline-flex shrink-0 items-center justify-center gap-2 rounded px-3 py-1.5 text-xs font-semibold sm:px-4 sm:py-2 sm:text-sm disabled:opacity-60"
              >
                <Save className="h-4 w-4" />
                {savePending ? <I18nText en="Saving" ru="Сохраняем" /> : <I18nText en="Save squad" ru="Сохранить состав" />}
              </button>
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
              onDropOnPlayer={handleDropOnPlayer}
            />
          </div>

          <div className={cn(mobileTab === "pool" ? "block" : "hidden xl:block", "min-w-0")}>
            <div className="mb-2 flex flex-nowrap items-center justify-between gap-2 overflow-x-auto pb-1">
              <div className="flex shrink-0 flex-nowrap items-center gap-2">
                <div className="inline-flex rounded border border-slate-200 bg-slate-50 p-0.5" aria-label={localizedText(language, "Player match scope", "Какие матчи учитывать")}>
                  <button
                    type="button"
                    onClick={() => applyQuickHistoryScope("ALL_LOADED")}
                    disabled={historyApplying}
                    className={cn("rounded px-3 py-1.5 text-xs font-semibold", appliedHistorySettings.scope !== "ALL_PLAYER_MATCHES" ? "bg-white text-sky-800 shadow-sm" : "text-slate-600")}
                  >
                    <I18nText en="Clubs only" ru="Только клубы" />
                  </button>
                  <button
                    type="button"
                    onClick={() => applyQuickHistoryScope("ALL_PLAYER_MATCHES")}
                    disabled={historyApplying}
                    className={cn("rounded px-3 py-1.5 text-xs font-semibold", appliedHistorySettings.scope === "ALL_PLAYER_MATCHES" ? "bg-white text-sky-800 shadow-sm" : "text-slate-600")}
                  >
                    <I18nText en="All matches" ru="Все матчи" />
                  </button>
                </div>
                <select
                  value={minimumPrice ?? "ALL"}
                  onChange={(event) => setMinimumPrice(event.target.value === "ALL" ? null : Number(event.target.value))}
                  aria-label={localizedText(language, "Minimum price", "Минимальная цена")}
                  className="rounded border border-slate-200 px-2 py-1.5 text-xs font-semibold text-slate-700 [@media(pointer:coarse)]:text-base"
                >
                  <option value="ALL">{localizedText(language, "Min price", "Цена от")}</option>
                  {priceFilterOptions.filter((price) => maximumPrice === null || price <= maximumPrice).map((price) => <option key={price} value={price}>{formatNumber(price, 1)}</option>)}
                </select>
                <select
                  value={maximumPrice ?? "ALL"}
                  onChange={(event) => setMaximumPrice(event.target.value === "ALL" ? null : Number(event.target.value))}
                  aria-label={localizedText(language, "Maximum price", "Максимальная цена")}
                  className="rounded border border-slate-200 px-2 py-1.5 text-xs font-semibold text-slate-700 [@media(pointer:coarse)]:text-base"
                >
                  <option value="ALL">{localizedText(language, "Max price", "Цена до")}</option>
                  {priceFilterOptions.filter((price) => minimumPrice === null || price >= minimumPrice).map((price) => <option key={price} value={price}>{formatNumber(price, 1)}</option>)}
                </select>
              </div>
              <div className="flex shrink-0 flex-nowrap items-center justify-end gap-2">
                <PlayerPoolFilterPresets
                  presets={filterPresets}
                  selectedId={selectedFilterPresetId}
                  pending={filterPresetsPending}
                  language={language}
                  onApply={applyFilterPreset}
                  onSave={saveFilterPreset}
                  onDelete={deleteFilterPreset}
                />
                <PlayerPoolAdvancedFilterMenu
                  columns={advancedFilterColumns}
                  filters={advancedTableFilters}
                  activeCount={activeAdvancedFilterCount}
                  language={language}
                  onChange={(key, filter) => setAdvancedTableFilters((current) => ({ ...current, [key]: filter }))}
                  onReset={() => setAdvancedTableFilters({})}
                />
                <button
                  type="button"
                  onClick={() => {
                    const exportPlayers = filterPlayerPoolByNameQuery(matchingPlayers, playerNameQueryRef.current);
                    if (exportPlayers.length === 0) {
                      setMessage(localizedText(language, "No players match the selected filters.", "Нет игроков под выбранные фильтры."));
                      return;
                    }
                    setTableExportPending(true);
                    void downloadPlayerPoolXlsx(exportPlayers, tableHorizon, language, leagueId, season, exportColumnKeys)
                      .catch(() => setMessage(localizedText(language, "Could not export the player table.", "Не удалось выгрузить таблицу игроков.")))
                      .finally(() => setTableExportPending(false));
                  }}
                  disabled={matchingPlayers.length === 0 || tableExportPending || fitsPreparing}
                  className="inline-flex items-center gap-2 whitespace-nowrap rounded border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-800 hover:bg-emerald-100 disabled:opacity-50"
                >
                  <Download className="h-4 w-4" />
                  {tableExportPending ? <I18nText en="Exporting…" ru="Выгрузка…" /> : <I18nText en="Export table" ru="Выгрузить таблицу" />}
                </button>
              </div>
            </div>
            {playerPoolReady && postLoadContentReady ? (
              <>
                <CustomizablePlayerPoolTable
                  players={filteredPlayers}
                  availableColumns={playerPoolColumns}
                  horizon={tableHorizon}
                  language={language}
                  addBlockReason={fantasyAddEvaluator.reason}
                  selectionsByPlayerId={selectionsByPlayerId}
                  onAdd={addPlayer}
                  onRemove={removePlayer}
                  initialVisibleColumns={initialVisiblePlayerPoolColumns}
                  initialColumnWidths={initialPlayerPoolColumnWidths}
                  onVisibleColumnsChange={setExportColumnKeys}
                  maskRootRef={playerPoolMaskRootRef}
                  nameQueryRef={playerNameQueryRef}
                  toolbar={(
                    <>
                      <PlayerPoolMaskedNameSearch
                        key={presetNameQueryRevision}
                        language={language}
                        players={matchingPlayers}
                        presetQuery={presetNameQuery}
                        queryRef={playerNameQueryRef}
                        rootRef={playerPoolMaskRootRef}
                      />
                      <select value={teamFilter} onChange={(event) => setTeamFilter(event.target.value)} aria-label={localizedText(language, "Team filter", "Фильтр по команде")} className="min-w-0 rounded border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 [@media(pointer:coarse)]:text-base">
                        <option value="ALL">{localizedText(language, "All teams", "Все команды")}</option>
                        {teamFilterOptions.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}
                      </select>
                      <select value={positionFilter} onChange={(event) => setPositionFilter(event.target.value)} aria-label={localizedText(language, "Position filter", "Фильтр позиции")} className="min-w-0 rounded border border-slate-200 px-3 py-2 text-xs [@media(pointer:coarse)]:text-base">
                        <option value="ALL">{localizedText(language, "All positions", "Все позиции")}</option>
                        {positionOrder.map((position) => <option key={position} value={position}>{position}</option>)}
                      </select>
                      <select value={tableHorizon} onChange={(event) => setTableHorizon(event.target.value === "3" ? 3 : 5)} aria-label={localizedText(language, "Player table forecast horizon", "Горизонт таблицы игроков")} className="min-w-0 rounded border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 [@media(pointer:coarse)]:text-base">
                        <option value="3">{localizedText(language, "3 rounds", "3 тура")}</option>
                        <option value="5">{localizedText(language, "5 rounds", "5 туров")}</option>
                      </select>
                      <label className="flex min-w-0 items-center gap-2 rounded border border-slate-200 px-3 py-2 text-xs text-slate-700">
                        <input type="checkbox" checked={onlyAffordable} onChange={(event) => { const enabled = event.target.checked; setOnlyAffordable(enabled); setFitsPreparing(enabled); if (!enabled) setFitCalculation(null); }} className="h-4 w-4 shrink-0 rounded border-slate-300" />
                        <span className="truncate">{fitsPreparing ? <I18nText en="Calculating..." ru="Считаем..." /> : <I18nText en="Fits" ru="Проходит" />}</span>
                      </label>
                    </>
                  )}
                />
              </>
            ) : playerPoolFailed ? (
              <div className="col-span-full rounded border border-rose-200 bg-rose-50 px-3 py-4 text-sm text-rose-700" role="alert">
                <I18nText en="The player pool could not be loaded. Retry from the Tips tab." ru="Не удалось загрузить пул игроков. Повторите загрузку на вкладке «Советы»." />
              </div>
            ) : (
              <p className="col-span-full rounded border border-slate-200 bg-slate-50 px-3 py-4 text-sm text-slate-500" role="status" aria-live="polite">
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
                      {formatScore(startingXiRoundPoints(summary.starterPlayers, index, captainId))}
                    </td>
                  ))}
                </tr>
                <tr className="border-t border-slate-100">
                  <td className="px-4 py-3 font-semibold text-ink">
                    <I18nText en="Starting XI Alt FP" ru="Альт FP старта" />
                  </td>
                  {rounds.map((round, index) => (
                    <td key={round.id} className="px-4 py-3 text-right font-semibold text-amber-700 num-tabular">
                      {formatAlternativeScore(startingXiAlternativeRoundPoints(summary.starterPlayers, index, captainId))}
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

type PlayerPoolTableProps = {
  players: FantasyPlannerPlayer[];
  horizon: number;
  language: UiLanguage;
  addBlockReason: (player: FantasyPlannerPlayer) => string | null;
  selectionsByPlayerId: Map<string, FantasySquadSelection>;
  onAdd: (player: FantasyPlannerPlayer) => void;
  onRemove: (playerId: string) => void;
};

type PlayerPoolOptionalColumn = {
  key: string;
  label: string;
  title: string;
  numeric: boolean;
  width: number;
};

type PlayerPoolAdvancedFilterColumn = Pick<PlayerPoolOptionalColumn, "key" | "label" | "title" | "numeric">;

const playerPoolFixedColumnWidths = {
  player: 190,
  team: 110,
  position: 64,
  price: 72,
  action: 40
} as const;
const minimumPlayerPoolColumnWidth = 40;
const maximumPlayerPoolColumnWidth = 640;

function PlayerPoolFilterPresets({ presets, selectedId, pending, language, onApply, onSave, onDelete }: {
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
    <details className="relative">
      <summary className="inline-flex cursor-pointer list-none items-center gap-2 whitespace-nowrap rounded border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 [&::-webkit-details-marker]:hidden">
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
          <button type="button" onClick={() => void handleSave()} disabled={pending || !name.trim()} className="inline-flex items-center gap-1.5 rounded bg-ink px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">
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

function PlayerPoolAdvancedFilterMenu({ columns, filters, activeCount, language, onChange, onReset }: {
  columns: PlayerPoolAdvancedFilterColumn[];
  filters: Record<string, SquadTableValueFilter>;
  activeCount: number;
  language: UiLanguage;
  onChange: (key: string, filter: SquadTableValueFilter) => void;
  onReset: () => void;
}) {
  return (
    <details className="relative">
      <summary className="inline-flex cursor-pointer list-none items-center gap-2 whitespace-nowrap rounded border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 [&::-webkit-details-marker]:hidden">
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

function normalizedPlayerPoolNameQuery(value: string) {
  return value.trim().toLowerCase();
}

export function filterPlayerPoolByNameQuery(players: FantasyPlannerPlayer[], query: string) {
  const normalizedQuery = normalizedPlayerPoolNameQuery(query);
  if (!normalizedQuery) return players;
  return players.filter((player) => player.name.toLowerCase().includes(normalizedQuery));
}

function applyPlayerPoolNameMask(root: HTMLDivElement | null, query: string) {
  if (!root) return;
  const normalizedQuery = normalizedPlayerPoolNameQuery(query);
  const matchingPlayerIds = new Set<string>();
  root.querySelectorAll<HTMLElement>("[data-player-search-row]").forEach((row) => {
    const matches = !normalizedQuery || (row.dataset.playerSearchName ?? "").includes(normalizedQuery);
    row.hidden = !matches;
    row.setAttribute("aria-hidden", matches ? "false" : "true");
    if (matches && row.dataset.playerSearchId) matchingPlayerIds.add(row.dataset.playerSearchId);
  });
  root.querySelectorAll<HTMLElement>("[data-player-search-empty]").forEach((emptyState) => {
    emptyState.hidden = matchingPlayerIds.size > 0;
  });
  root.querySelectorAll<HTMLElement>("[data-player-search-count]").forEach((counter) => {
    counter.textContent = String(matchingPlayerIds.size);
  });
}

function PlayerPoolMaskedNameSearch({ language, players, presetQuery, queryRef, rootRef }: {
  language: UiLanguage;
  players: FantasyPlannerPlayer[];
  presetQuery: string;
  queryRef: { current: string };
  rootRef: RefObject<HTMLDivElement>;
}) {
  const [value, setValue] = useState(presetQuery);
  const frameRef = useRef<number | null>(null);

  function scheduleMask(query: string) {
    queryRef.current = query;
    if (frameRef.current !== null) window.cancelAnimationFrame(frameRef.current);
    frameRef.current = window.requestAnimationFrame(() => {
      frameRef.current = null;
      applyPlayerPoolNameMask(rootRef.current, query);
    });
  }

  useEffect(() => {
    queryRef.current = presetQuery;
    applyPlayerPoolNameMask(rootRef.current, presetQuery);
    return () => {
      if (frameRef.current !== null) window.cancelAnimationFrame(frameRef.current);
    };
  }, [presetQuery, queryRef, rootRef]);

  useEffect(() => {
    applyPlayerPoolNameMask(rootRef.current, queryRef.current);
  }, [players, rootRef, queryRef]);

  return (
    <label className="relative min-w-0">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
      <input
        value={value}
        onChange={(event) => {
          const nextValue = event.target.value;
          setValue(nextValue);
          scheduleMask(nextValue);
        }}
        placeholder={localizedText(language, "Name", "Имя")}
        aria-label={localizedText(language, "Search by player name", "Поиск по имени игрока")}
        className="w-full rounded border border-slate-200 py-2 pl-9 pr-3 text-xs [@media(pointer:coarse)]:text-base"
      />
    </label>
  );
}

function CustomizablePlayerPoolTable({
  initialVisibleColumns,
  initialColumnWidths,
  onVisibleColumnsChange,
  maskRootRef,
  nameQueryRef,
  toolbar,
  availableColumns,
  ...props
}: PlayerPoolTableProps & { availableColumns: PlayerPoolOptionalColumn[]; initialVisibleColumns: string[]; initialColumnWidths: Record<string, number>; onVisibleColumnsChange: (columns: string[]) => void; maskRootRef: RefObject<HTMLDivElement>; nameQueryRef: { current: string }; toolbar: ReactNode }) {
  const { players, horizon, language } = props;
  const columns = availableColumns;
  const [visibleColumnKeys, setVisibleColumnKeys] = useState(initialVisibleColumns);
  const [columnWidths, setColumnWidths] = useState(initialColumnWidths);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [compactViewport, setCompactViewport] = useState<boolean | null>(null);
  const preferencesMounted = useRef(false);
  const tableContainerRef = useRef<HTMLDivElement>(null);
  const columnsByKey = useMemo(() => new Map(columns.map((column) => [column.key, column])), [columns]);
  const visibleColumns = visibleColumnKeys
    .map((key) => columnsByKey.get(key))
    .filter((column): column is PlayerPoolOptionalColumn => Boolean(column));
  const fixedColumnTitles = playerPoolFixedColumnTitles(language);
  const widthFor = (key: string, fallback: number) => columnWidths[key] ?? fallback;
  const tableWidth = widthFor("action", playerPoolFixedColumnWidths.action)
    + widthFor("player", playerPoolFixedColumnWidths.player)
    + widthFor("team", playerPoolFixedColumnWidths.team)
    + widthFor("position", playerPoolFixedColumnWidths.position)
    + widthFor("price", playerPoolFixedColumnWidths.price)
    + visibleColumns.reduce((total, column) => total + widthFor(column.key, column.width), 0);

  useEffect(() => {
    onVisibleColumnsChange(visibleColumnKeys);
  }, [onVisibleColumnsChange, visibleColumnKeys]);

  useEffect(() => {
    applyPlayerPoolNameMask(maskRootRef.current, nameQueryRef.current);
  }, [compactViewport, maskRootRef, nameQueryRef, players, visibleColumnKeys]);

  useEffect(() => {
    const media = window.matchMedia("(max-width: 767px), (pointer: coarse)");
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
    <div ref={maskRootRef} className="contents">
      <div className="mb-3 flex min-w-0 flex-wrap items-start gap-2 xl:flex-nowrap">
        <div className="grid min-w-0 flex-[1_1_34rem] grid-cols-2 gap-2 lg:grid-cols-5">
          {toolbar}
        </div>
        <details className="relative shrink-0">
          <summary className="inline-flex cursor-pointer list-none items-center gap-2 whitespace-nowrap rounded border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 [&::-webkit-details-marker]:hidden">
            <Columns3 className="h-4 w-4" />
            <I18nText en="Columns" ru="Столбцы" />
            <span className="text-slate-400">{visibleColumns.length}</span>
          </summary>
          <div className="absolute right-0 z-30 mt-2 w-[min(42rem,calc(100vw-2rem))] rounded border border-slate-200 bg-white p-4 shadow-elev">
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

      {compactViewport !== false ? <div className="col-span-full">
        <PlayerPoolMobileList {...props} />
      </div> : null}

      {compactViewport !== true ? <div className="col-span-full hidden min-w-0 max-w-full overflow-hidden rounded border border-slate-200 bg-white md:block [@media(pointer:coarse)]:!hidden" data-testid="player-pool-table">
        <div ref={tableContainerRef} className="relative max-h-[720px] w-full max-w-full overflow-auto [scrollbar-gutter:stable]">
          <SortableTable
            sortRefreshKey={`${horizon}:${visibleColumnKeys.join(",")}`}
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
                <th className="sticky left-0 z-20 overflow-hidden border-r border-slate-200 bg-slate-50 px-2 py-2" title={fixedColumnTitles.player} style={{ width: widthFor("player", playerPoolFixedColumnWidths.player) }}><PlayerPoolHeaderLabel label={localizedText(language, "Player", "Игрок")} /><ColumnResizeHandle label={localizedText(language, "player", "игрока")} onPointerDown={(event) => startColumnResize(event, "player", playerPoolFixedColumnWidths.player)} onDoubleClick={() => resetColumnWidth("player")} /></th>
                <th className="relative overflow-hidden px-2 py-2" title={fixedColumnTitles.team} style={{ width: widthFor("team", playerPoolFixedColumnWidths.team) }}><PlayerPoolHeaderLabel label={localizedText(language, "Team", "Клуб")} /><ColumnResizeHandle label={localizedText(language, "team", "клуба")} onPointerDown={(event) => startColumnResize(event, "team", playerPoolFixedColumnWidths.team)} onDoubleClick={() => resetColumnWidth("team")} /></th>
                <th className="relative overflow-hidden px-1 py-2" title={fixedColumnTitles.position} style={{ width: widthFor("position", playerPoolFixedColumnWidths.position) }}><PlayerPoolHeaderLabel label={localizedText(language, "Pos", "Поз.")} /><ColumnResizeHandle label={localizedText(language, "position", "позиции")} onPointerDown={(event) => startColumnResize(event, "position", playerPoolFixedColumnWidths.position)} onDoubleClick={() => resetColumnWidth("position")} /></th>
                <th data-column-key="price" aria-label={localizedText(language, "Price", "Цена")} className="relative overflow-hidden px-1 py-2 text-right" title={fixedColumnTitles.price} style={{ width: widthFor("price", playerPoolFixedColumnWidths.price) }}><PlayerPoolHeaderLabel label={responsivePriceHeaderLabel(widthFor("price", playerPoolFixedColumnWidths.price), language)} numeric priceLabel fullLabel={localizedText(language, "Price", "Цена")} /><ColumnResizeHandle label={localizedText(language, "price", "цены")} onPointerDown={(event) => startColumnResize(event, "price", playerPoolFixedColumnWidths.price)} onDoubleClick={() => resetColumnWidth("price")} /></th>
                <th data-sort-disabled="true" className="relative overflow-hidden px-1 py-2 text-center" style={{ width: widthFor("action", playerPoolFixedColumnWidths.action) }} title={localizedText(language, "Add the player to the squad or remove a selected player. Disabled means a budget, position, or club limit would be exceeded.", "Добавить игрока в состав или убрать выбранного. Неактивная кнопка означает превышение бюджета, лимита позиции или клуба.")}><span aria-hidden="true">+</span><span className="sr-only"><I18nText en="Add or remove" ru="Добавить или убрать" /></span><ColumnResizeHandle label={localizedText(language, "squad action", "кнопки состава")} onPointerDown={(event) => startColumnResize(event, "action", playerPoolFixedColumnWidths.action)} onDoubleClick={() => resetColumnWidth("action")} /></th>
                {visibleColumns.map((column) => (
                  <th key={column.key} data-sort-disabled={column.key === "fixtures" ? "true" : undefined} className={cn("relative overflow-hidden px-1 py-2", column.numeric && "text-center")} title={column.title} style={{ width: widthFor(column.key, column.width) }}><PlayerPoolHeaderLabel label={column.label} numeric={column.numeric} /><ColumnResizeHandle label={column.label} onPointerDown={(event) => startColumnResize(event, column.key, column.width)} onDoubleClick={() => resetColumnWidth(column.key)} /></th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {players.map((player) => <CustomPlayerPoolRow key={player.playerId} player={player} columns={visibleColumns} {...props} />)}
              <tr data-player-search-empty hidden={players.length > 0}><td colSpan={5 + visibleColumns.length} className="px-4 py-10 text-center text-sm text-slate-500"><I18nText en="No players match the selected filters." ru="Нет игроков под выбранные фильтры." /></td></tr>
            </tbody>
          </SortableTable>
        </div>
      </div> : null}
      <div className="col-span-full mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
        <span><span data-player-search-count>{players.length}</span> {localizedText(language, "players", "игроков")}</span>
      </div>
    </div>
  );
}

function PlayerPoolHeaderLabel({ label, numeric = false, priceLabel = false, fullLabel }: { label: string; numeric?: boolean; priceLabel?: boolean; fullLabel?: string }) {
  return (
    <span className={cn("block min-w-0 truncate pr-4 leading-4", numeric && "text-center")}>
      <span className="whitespace-nowrap" data-price-header-label={priceLabel ? "true" : undefined} data-full-price-label={priceLabel ? fullLabel : undefined}>{label}</span>
    </span>
  );
}

function ColumnResizeHandle({ label, onPointerDown, onDoubleClick }: {
  label: string;
  onPointerDown: (event: ReactPointerEvent<HTMLElement>) => void;
  onDoubleClick: () => void;
}) {
  return (
    <span
      data-column-resize-handle="true"
      role="separator"
      aria-label={`Resize ${label}`}
      aria-orientation="vertical"
      onPointerDown={onPointerDown}
      onDoubleClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onDoubleClick();
      }}
      className="absolute inset-y-0 right-0 z-10 w-2 cursor-col-resize touch-none border-r border-transparent hover:border-sky-500"
    />
  );
}

function playerPoolFixedColumnTitles(language: UiLanguage) {
  return {
    player: localizedText(
      language,
      "Sports.ru fantasy display name. The second line shows expected minutes and the confidence heuristic. Confidence is not a probability that the forecast will be correct: 55% comes from sample size (full at 5 matches), 30% from minute stability, and 15% from the share of matches with a known starting-XI flag.",
      "Имя игрока в формате фэнтези Sports.ru. Во второй строке показаны ожидаемые минуты и эвристика уверенности. Уверенность — не вероятность точности прогноза: 55% дают полнота выборки (максимум при 5 матчах), 30% — стабильность минут, 15% — доля матчей с известной отметкой выхода в старте."
    ),
    team: localizedText(language, "The player's current club in the selected league and season.", "Текущий клуб игрока в выбранной лиге и сезоне."),
    position: localizedText(language, "Fantasy position used for formation limits: goalkeeper, defender, midfielder, or forward.", "Фэнтези-позиция, по которой применяются лимиты состава: вратарь, защитник, полузащитник или нападающий."),
    price: localizedText(language, "Current Sports.ru fantasy price. A tilde means the price is estimated because no verified Sports.ru value is available.", "Текущая цена в фэнтези Sports.ru. Тильда означает оценочную цену: подтверждённой цены Sports.ru для игрока нет.")
  };
}

function CustomPlayerPoolRow({ player, columns, horizon, language, addBlockReason, selectionsByPlayerId, onAdd, onRemove }: Omit<PlayerPoolTableProps, "players"> & { player: FantasyPlannerPlayer; columns: PlayerPoolOptionalColumn[] }) {
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
  const fixedColumnTitles = playerPoolFixedColumnTitles(language);
  const teamDisplayName = fantasyPlayerTeamDisplayName(player);
  const fullTeamName = player.teamName.trim() || teamDisplayName;
  const teamCellTitle = `${player.name} · ${localizedText(language, "club", "клуб")}: ${teamDisplayName}\n${localizedText(language, "Full club name", "Полное название клуба")}: ${fullTeamName}\n${fixedColumnTitles.team}`;

  return (
    <tr
      data-player-search-row
      data-player-search-id={player.playerId}
      data-player-search-name={player.name.toLowerCase()}
      className={cn("group", isSelected ? "bg-emerald-50 text-slate-700" : disabled ? "bg-slate-50 text-slate-500" : "hover:bg-slate-50")}
    >
      <td className={cn("sticky left-0 z-[5] overflow-hidden border-r border-slate-200 px-2 py-1.5", isSelected ? "bg-emerald-50" : disabled ? "bg-slate-50" : "bg-white group-hover:bg-slate-50")} title={`${player.name}\n${fixedColumnTitles.player}\n${localizedText(language, `Forecast inputs: ${player.expectedMinutes == null ? "—" : `${formatNumber(player.expectedMinutes, 0)} min`}; confidence ${player.forecastConfidence == null ? "—" : `${formatNumber(player.forecastConfidence * 100, 0)}%`}.`, `Входы прогноза: ${player.expectedMinutes == null ? "—" : `${formatNumber(player.expectedMinutes, 0)} мин`}; уверенность ${player.forecastConfidence == null ? "—" : `${formatNumber(player.forecastConfidence * 100, 0)}%`}.`)}`}>
        <span className={cn("block truncate font-semibold", muted ? "text-slate-500" : "text-ink")}>{compactPlayerDisplayName(player.name)}</span>
        {playerMetadata ? <span className="block truncate text-[10px] text-slate-500">{playerMetadata}</span> : null}
      </td>
      <td className="overflow-hidden px-2 py-1.5 text-slate-600" title={teamCellTitle}><span className="block truncate">{teamDisplayName}</span></td>
      <td className="overflow-hidden px-1 py-1.5" title={`${player.name} · ${localizedText(language, "position", "позиция")}: ${player.positionGroup}\n${fixedColumnTitles.position}`}><span className={cn("inline-block max-w-full truncate rounded px-1 py-0.5 text-[10px] font-bold", muted ? "border border-slate-300 bg-slate-200 text-slate-700" : positionPillClass(player.positionGroup))}>{player.positionGroup}</span></td>
      <td data-sort-value={player.price} className={cn("overflow-hidden whitespace-nowrap px-1 py-1.5 text-right font-semibold", muted ? "text-slate-600" : "text-ink")} title={`${player.name} · ${localizedText(language, "price", "цена")}: ${formatNumber(player.price, 1)}\n${localizedText(language, `Source: ${player.priceSource === "SPORTS_RU" ? "verified Sports.ru fantasy price" : "estimate; no verified Sports.ru mapping"}.`, `Источник: ${player.priceSource === "SPORTS_RU" ? "подтверждённая цена фэнтези Sports.ru" : "оценка; подтверждённого сопоставления Sports.ru нет"}.`)}`}>{player.priceSource === "ESTIMATED" ? "~" : ""}{formatNumber(player.price, 1)}</td>
      <td className="px-1 py-1.5 text-center">
        {isSelected ? (
          <button type="button" onClick={() => onRemove(player.playerId)} aria-label={removeLabel} className="inline-flex h-7 w-7 items-center justify-center rounded border border-rose-200 bg-white text-rose-700 hover:bg-rose-50"><Trash2 className="h-4 w-4" /></button>
        ) : disabled ? (
          <span role="button" aria-disabled="true" tabIndex={0} aria-label={addLabel} title={localizedReason ?? undefined} className="inline-flex h-7 w-7 items-center justify-center rounded border border-slate-200 bg-slate-100 text-slate-400"><Lock className="h-4 w-4" /></span>
        ) : (
          <button type="button" onClick={() => onAdd(player)} aria-label={addLabel} className="inline-flex h-7 w-7 items-center justify-center rounded border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"><Plus className="h-4 w-4" /></button>
        )}
      </td>
      {columns.map((column) => customPlayerPoolCell(column, player, horizon, language, muted))}
    </tr>
  );
}

function playerPoolOptionalColumns(players: FantasyPlannerPlayer[], horizon: number, language: UiLanguage): PlayerPoolOptionalColumn[] {
  const column = (key: string, en: string, ru: string, titleEn = en, titleRu = ru, numeric = true, width = 72): PlayerPoolOptionalColumn => ({
    key,
    label: localizedText(language, en, ru),
    title: localizedText(language, titleEn, titleRu),
    numeric,
    width
  });
  const standard = [
    column("nextFp", "FP", "ФО", "Expected fantasy points in the next round from expected minutes, player event rates, opponent strength, bookmaker inputs, and the active scoring formula.", "Ожидаемые фэнтези-очки в следующем туре: учитываются ожидаемые минуты, игровые показатели футболиста, сила соперника, букмекерские данные и активная формула начисления.", true, 64),
    column("horizonFp", `${horizon}R FP`, `${horizon}Т ФО`, `Sum of independently calculated primary forecasts for the next ${horizon} rounds; the current-round value is not simply multiplied.`, `Сумма отдельно рассчитанных основных прогнозов на следующие ${horizon} туров; значение текущего тура не умножается механически.`),
    column("foontasy", "FFO", "FFO", "Foontasy's external forecast for the current round, matched strictly through the Sports.ru player identifier. Foontasy does not publish a multi-round forecast; missing data is shown as a dash.", "Внешний прогноз Foontasy на текущий тур, сопоставленный строго через идентификатор игрока Sports.ru. Foontasy не публикует прогноз на несколько туров; отсутствие данных показывается прочерком."),
    column("modelHorizon", `${horizon}R FFO`, `${horizon}Т ФФО`, `Our reproducible Foontasy-style forecast for the selected ${horizon}-round horizon. Every fixture is calculated separately from expected minutes, smoothed player rates, and fresh odds, xG form, or goals fallback. It is our model, not Foontasy's external forecast.`, `Наш воспроизводимый прогноз в стиле Foontasy на выбранный горизонт ${horizon} туров. Каждый матч считается отдельно по ожидаемым минутам, сглаженным показателям игрока и свежим коэффициентам, xG-форме или голам. Это наша модель, а не внешний прогноз Foontasy.`),
    column("alternative", "Alt", "Альт", "Alternative next-round fantasy forecast calculated with this user's personal Alt formula and the same minute-aware player inputs.", "Альтернативный прогноз фэнтези-очков на следующий тур по личной формуле Alt пользователя и с учётом ожидаемых минут игрока."),
    column("alternativeHorizon", `Alt ${horizon}R`, `Альт ${horizon}Т`, `Sum of independently calculated personal Alt forecasts for the next ${horizon} rounds.`, `Сумма отдельно рассчитанных личных прогнозов Alt на следующие ${horizon} туров.`),
    column("fixtures", "Fixtures", "Матчи", "The next opponents in the selected horizon. Chip colour represents fixture difficulty; hover a chip for the full opponent name and home/away context.", "Следующие соперники на выбранном горизонте. Цвет плашки показывает сложность матча; при наведении доступны полное имя соперника и поле дома/в гостях.", false, 230),
    column("age", "Age", "Возраст", "Player age from the current FotMob profile.", "Возраст игрока из текущего профиля FotMob."),
    column("nationality", "Nationality", "Гражданство", "Player nationality from FotMob metadata.", "Гражданство игрока из метаданных FotMob.", false, 120),
    column("rosterStarter", "XI flag", "Старт", "The club's current starting-XI flag edited on the team page. This is a shared roster marker, not the model's start probability.", "Текущая отметка стартовых 11 клуба, установленная на странице команды. Это общий признак состава, а не вероятность старта модели.", false),
    column("expectedMinutes", "Exp min", "Ож. мин", "Expected playing time in the next match, from 0 to 90 minutes. It scales all per-90 event rates; 80 or more minutes count as a full fantasy match.", "Ожидаемое игровое время в следующем матче от 0 до 90 минут. Им масштабируются все показатели per 90; 80 минут и больше считаются полным фэнтези-матчем."),
    column("startProbability", "Appearance %", "Выход %", "Model probability that the player appears on the pitch in the next fixture. This stored forecast field is not a starting-XI probability.", "Вероятность модели, что игрок появится на поле в следующем матче. Это сохранённое поле прогноза не является вероятностью выхода в стартовом составе."),
    column("sixtyProbability", "60 min %", "60 мин %", "Estimated probability of reaching 60 minutes. It controls the fantasy threshold for the higher appearance score and is not assumed to be 100% for every attacker.", "Оценка вероятности провести не менее 60 минут. Она управляет порогом повышенных очков за участие и не считается автоматически равной 100% для всех атакующих игроков."),
    column("fullMatchProbability", "Full %", "Фулл %", "Estimated probability of a full fantasy match. In the forecast pipeline, 80 expected minutes already count as full time to absorb normal prediction error.", "Оценка вероятности полного фэнтези-матча. В прогнозном пайплайне 80 ожидаемых минут уже считаются полным матчем с учётом обычной погрешности модели."),
    column("forecastConfidence", "Confidence", "Уверенность", "Data-reliability heuristic, not forecast accuracy: 55% sample completeness (reaches maximum at 5 matches) + 30% minute stability (standard deviation, worst at 45+ minutes) + 15% completeness of known starting-XI flags.", "Эвристика надёжности данных, а не точность прогноза: 55% — полнота выборки (максимум при 5 матчах), 30% — стабильность минут (по стандартному отклонению, минимум при 45+ минутах), 15% — полнота известных отметок выхода в старте."),
    column("valueScore", "FP/price", "ФО/цена", "Next-round primary expected fantasy points divided by the player's current price; a relative value indicator, not a separate forecast.", "Основной прогноз ФО на следующий тур, делённый на текущую цену игрока; показатель относительной выгодности, а не отдельный прогноз."),
    column("recentFp", "Recent FP", "Недавние ФО", "Average actual fantasy points over up to the last 5 stored matches in the selected history scope.", "Средние фактические фэнтези-очки максимум за 5 последних сохранённых матчей в выбранном историческом диапазоне."),
    column("projectedGoals", "Exp goals", "Ож. голы", "Expected goals allocated to the player for the next fixture after scaling his scoring rate by expected minutes and team attacking forecast.", "Ожидаемые голы игрока в следующем матче после масштабирования его голевого темпа на ожидаемые минуты и атакующий прогноз команды."),
    column("projectedAssists", "Exp assists", "Ож. ассисты", "Expected assists for the next fixture after minute scaling and team-event allocation.", "Ожидаемые ассисты в следующем матче после учёта минут и распределения командных событий между игроками."),
    column("projectedRecoveries", "Exp rec.", "Ож. возвраты", "Expected recoveries in the next fixture, scaled to the player's expected minutes; used only where the scoring model rewards them.", "Ожидаемые возвраты мяча в следующем матче с учётом ожидаемых минут; используются только если активная формула начисляет за них очки."),
    column("projectedSaves", "Exp saves", "Ож. сейвы", "Expected goalkeeper saves in the next fixture from the player's save rate, expected minutes, and opponent shot forecast.", "Ожидаемые сейвы вратаря в следующем матче на основе его темпа сейвов, ожидаемых минут и прогноза ударов соперника."),
    column("projectedCleanSheets", "Exp CS", "Ож. сухарь", "Expected clean-sheet contribution for the next fixture, weighted by team defensive forecast and the player's playing-time exposure.", "Ожидаемый вклад сухого матча в следующем туре, взвешенный по защитному прогнозу команды и игровому времени футболиста."),
    column("projectedGoalsConceded", "Exp GC", "Ож. пропущ.", "Expected goals conceded while the player is on the pitch in the next fixture. Both primary FP and default Alt subtract one fantasy point per Poisson group of two for defenders and goalkeepers.", "Ожидаемые пропущенные голы, пока игрок находится на поле в следующем матче. Основное ФО и стандартный Альт вычитают по одному фэнтези-очку за каждую пуассоновскую группу из двух голов у защитников и вратарей."),
    column("projectedYellowCards", "Exp YC", "Ож. ЖК", "Expected yellow cards in the next fixture from the player's card rate scaled by expected minutes.", "Ожидаемые жёлтые карточки в следующем матче: карточный темп игрока масштабируется на ожидаемые минуты."),
    column("projectedRedCards", "Exp RC", "Ож. КК", "Expected red cards in the next fixture from the player's card rate scaled by expected minutes.", "Ожидаемые красные карточки в следующем матче: карточный темп игрока масштабируется на ожидаемые минуты."),
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

function playerPoolAdvancedFilterColumns(players: FantasyPlannerPlayer[], horizon: number, language: UiLanguage): PlayerPoolAdvancedFilterColumn[] {
  const fixedTitles = playerPoolFixedColumnTitles(language);
  return [
    { key: "player", label: localizedText(language, "Player", "Игрок"), title: fixedTitles.player, numeric: false },
    { key: "team", label: localizedText(language, "Club", "Клуб"), title: fixedTitles.team, numeric: false },
    { key: "position", label: localizedText(language, "Position", "Позиция"), title: fixedTitles.position, numeric: false },
    { key: "price", label: localizedText(language, "Price", "Цена"), title: fixedTitles.price, numeric: true },
    ...playerPoolOptionalColumns(players, horizon, language)
  ];
}

function historicalStatTitle(key: string, language: UiLanguage) {
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

function customPlayerPoolCell(column: PlayerPoolOptionalColumn, player: FantasyPlannerPlayer, horizon: number, language: UiLanguage, muted: boolean) {
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
  const tone = column.key === "nextFp" ? "text-emerald-700"
    : column.key === "horizonFp" ? "text-sky-700"
      : column.key === "foontasy" ? "text-cyan-700"
        : column.key.startsWith("alternative") ? "text-amber-700"
          : "text-slate-700";
  const cellTitle = playerPoolValueCellTitle(column, player, horizon, language, rawValue);
  return (
    <td key={column.key} data-sort-value={rawValue ?? ""} className={cn("overflow-hidden text-ellipsis whitespace-nowrap px-1 py-1.5", column.numeric && "text-center num-tabular", muted ? "text-slate-500" : tone)} title={cellTitle}>
      {display}
    </td>
  );
}

function playerPoolValueCellTitle(column: PlayerPoolOptionalColumn, player: FantasyPlannerPlayer, horizon: number, language: UiLanguage, rawValue: string | number | null) {
  const numericValue = typeof rawValue === "number" && Number.isFinite(rawValue) ? rawValue : null;
  if (column.key === "nextFp") return playerPrimaryNextForecastTitle(player, language, numericValue);
  if (column.key === "horizonFp") return playerPrimaryHorizonForecastTitle(player, language, numericValue, horizon);
  if (column.key === "foontasy") return foontasyForecastTitle(player, language, 1);
  if (column.key === "alternative") return alternativePlayerForecastTitle(player, language);
  if (column.key === "alternativeHorizon") return alternativePlayerHorizonForecastTitle(player, language, horizon);
  return playerPoolMetricValueTitle(column, player, language, rawValue);
}

function playerPoolMetricValueTitle(column: PlayerPoolOptionalColumn, player: FantasyPlannerPlayer, language: UiLanguage, rawValue: string | number | null) {
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
    lines.push(localizedText(language, `Next-fixture component produced by the minute-aware projection. Expected minutes: ${player.expectedMinutes == null ? "—" : formatNumber(player.expectedMinutes, 1)}; component value: ${display}.`, `Компонент прогноза на следующий матч с учётом минут. Ожидаемые минуты: ${player.expectedMinutes == null ? "—" : formatNumber(player.expectedMinutes, 1)}; значение компонента: ${display}.`));
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

function finiteMetric(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function horizonModelStatus(player: FantasyPlannerPlayer, label: string) {
  return label.includes("3") ? player.modelT3Status ?? null : player.modelT5Status ?? null;
}

function appendForecastNotes(lines: string[], player: FantasyPlannerPlayer, language: UiLanguage) {
  if (player.forecastFactors?.length) lines.push(localizedText(language, `Factors: ${player.forecastFactors.join("; ")}`, `Факторы модели: ${player.forecastFactors.map((note) => localizeForecastNote(note, language)).join("; ")}`));
  if (player.forecastRisks?.length) lines.push(localizedText(language, `Risks: ${player.forecastRisks.join("; ")}`, `Риски модели: ${player.forecastRisks.map((note) => localizeForecastNote(note, language)).join("; ")}`));
}

function appendHistoricalMetricCalculation(lines: string[], key: string, value: number, stats: Record<string, number | null>, language: UiLanguage) {
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

function playerPoolFilterValue(key: string, player: FantasyPlannerPlayer, horizon: number) {
  if (key === "player") return player.name;
  if (key === "team") return `${player.teamName} ${fantasyPlayerTeamDisplayName(player)}`;
  if (key === "position") return player.positionGroup;
  if (key === "price") return player.price;
  return customPlayerPoolColumnValue(key, player, horizon);
}

function customPlayerPoolColumnValue(key: string, player: FantasyPlannerPlayer, horizon: number): string | number | null {
  const projected = player.projectedFixtureComponents;
  if (key.startsWith("stat:")) return player.historicalStats?.[key.slice(5)] ?? null;
  switch (key) {
    case "nextFp": return nextFantasyPoints(player);
    case "horizonFp": return playerHorizonPoints(player, horizon);
    case "foontasy": return player.foontasyPoints ?? null;
    case "modelHorizon": return horizon === 3 ? player.modelT3Points ?? null : player.modelT5Points ?? null;
    case "alternative": return player.alternativePredictedFp ?? null;
    case "alternativeHorizon": return playerAlternativeHorizonPoints(player, horizon);
    case "fixtures": return [...(player.fixtureFullNames ?? []), ...(player.fixtures ?? [])].join(" ");
    case "age": return player.age ?? null;
    case "nationality": return player.nationality ?? null;
    case "rosterStarter": return player.isStarter ? 1 : 0;
    case "expectedMinutes": return player.expectedMinutes ?? null;
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

function customPlayerPoolColumnDisplay(key: string, value: string | number | null, language: UiLanguage) {
  if (value === null || value === undefined) return "—";
  if (typeof value === "string") return value;
  if (key === "rosterStarter") return value ? localizedText(language, "Yes", "Да") : localizedText(language, "No", "Нет");
  if (["startProbability", "sixtyProbability", "fullMatchProbability", "forecastConfidence"].includes(key) || /(?:appearance|sixty|full_match)_(?:probability|rate)/.test(key)) {
    return `${formatNumber(value * 100, 0)}%`;
  }
  if (key === "age" || key === "expectedMinutes" || key === "baltikaMatches" || /^stat:(?:matches|minutes|appearances|full_matches|goals|assists|shots|saves|cards)/.test(key)) return formatNumber(value, 0);
  return formatNumber(value, 2);
}

function historicalStatLabel(key: string, language: UiLanguage) {
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

function historicalStatRank(key: string) {
  const order = ["matches_played", "minutes_played", "appearance_probability", "sixty_minute_probability", "full_match_probability", "goals", "assists", "xg", "xa", "xgot", "shots", "shots_on_target", "key_passes", "chances_created", "tackles_won", "interceptions", "clearances", "duels_won", "aerials_won", "recoveries", "touches_in_opposition_box", "fouls_won", "penalties_won", "saves", "goals_conceded", "clean_sheets", "yellow_cards", "red_cards", "average_rating"];
  const index = order.indexOf(key);
  return index === -1 ? order.length : index;
}

function average(values: number[]) {
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
        <div className="relative min-w-0 max-h-[720px] w-full max-w-full overflow-x-hidden overflow-y-auto [scrollbar-gutter:stable]">
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
                    data-sort-value={player.alternativePredictedFp ?? 0}
                    className={`overflow-hidden whitespace-nowrap px-1 py-1.5 text-right text-[11px] font-semibold ${muted ? "text-slate-600" : "text-amber-700"}`}
                    title={alternativePlayerForecastTitle(player, language)}
                  >
                    {formatAlternativeScore(player.alternativePredictedFp)}
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
            data-player-search-row
            data-player-search-id={player.playerId}
            data-player-search-name={player.name.toLowerCase()}
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
                <dd className="truncate text-sm font-bold text-amber-700 num-tabular">{formatAlternativeScore(player.alternativePredictedFp)}</dd>
              </div>
            </dl>

            <div className="mt-2 flex min-w-0 items-center justify-between gap-2 overflow-hidden">
              <div className="min-w-0 overflow-hidden">
                {fixtureChips.length > 0 ? <FdrRow fixtures={fixtureChips} /> : <span className="text-[11px] text-slate-500"><I18nText en="No fixture loaded" ru="Матч не загружен" /></span>}
              </div>
              <span className="shrink-0 text-[11px] font-semibold text-violet-700 num-tabular" title={alternativeFiveRoundFpTitle(language)}>
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
      <p data-player-search-empty hidden={players.length > 0} className="rounded border border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
        <I18nText en="No players match the selected filters." ru="Нет игроков под выбранные фильтры." />
      </p>
    </div>
  );
}

function Metric({
  label,
  value,
  secondaryLabel,
  secondaryValue,
  tertiaryLabel,
  tertiaryValue,
  tone = "default"
}: {
  label: React.ReactNode;
  value: string;
  secondaryLabel?: React.ReactNode;
  secondaryValue?: string;
  tertiaryLabel?: React.ReactNode;
  tertiaryValue?: string;
  tone?: "default" | "good" | "bad" | "accent";
}) {
  const color = tone === "good" ? "text-emerald-700" : tone === "bad" ? "text-rose-700" : tone === "accent" ? "text-sky-700" : "text-ink";
  return (
    <dl className="min-w-0 border-b border-slate-200 px-3 py-2 last:border-b-0 md:border-b-0">
      <dt className="truncate text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className={cn("mt-0.5 truncate text-lg font-bold num-tabular", color)}>{value}</dd>
      {secondaryValue !== undefined ? (
        <dd className="mt-0.5 flex items-baseline gap-1.5 truncate text-xs font-semibold text-amber-700 num-tabular">
          <span className="uppercase tracking-wide text-slate-500">{secondaryLabel}</span>
          <span>{secondaryValue}</span>
        </dd>
      ) : null}
      {tertiaryValue !== undefined ? (
        <dd className="mt-0.5 flex items-baseline gap-1.5 truncate text-xs font-semibold text-cyan-700 num-tabular">
          <span className="uppercase tracking-wide text-slate-500">{tertiaryLabel}</span>
          <span>{tertiaryValue}</span>
        </dd>
      ) : null}
    </dl>
  );
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
  onDropToBench,
  onDropOnPlayer
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
  onDropOnPlayer: (sourcePlayerId: string, targetPlayerId: string) => void;
}) {
  const starterLines: Array<{ position: Exclude<FantasyPositionGroup, "UNK">; label: React.ReactNode }> = [
    { position: "DEF", label: <I18nText en="Defenders" ru="Защитники" /> },
    { position: "MID", label: <I18nText en="Midfielders" ru="Полузащитники" /> },
    { position: "FWD", label: <I18nText en="Forwards" ru="Нападающие" /> }
  ];
  const draggedSelection = draggedPlayerId ? selectionsByPlayerId.get(draggedPlayerId) : undefined;
  const orderedBenchPlayers = [...summary.benchPlayers].sort((left, right) =>
    Number(left.positionGroup === "GK") - Number(right.positionGroup === "GK")
  );

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
              onDropOnPlayer={onDropOnPlayer}
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
                onDropOnPlayer={onDropOnPlayer}
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
            "flex min-h-16 flex-wrap justify-center gap-1 rounded border border-dashed border-transparent p-0.5 transition-colors sm:flex-nowrap",
            draggedSelection?.isStarter && "border-sky-300 bg-sky-50"
          )}
          onDragOver={(event) => allowSquadDrop(event, Boolean(draggedPlayerId))}
          onDrop={(event) => {
            const playerId = readDraggedPlayerId(event);
            if (playerId) onDropToBench(playerId);
          }}
        >
          {orderedBenchPlayers.map((player) => (
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
              onDropOnPlayer={onDropOnPlayer}
            />
          ))}
          {orderedBenchPlayers.length === 0 ? (
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
  onDropOnPlayer,
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
  onDropOnPlayer: (sourcePlayerId: string, targetPlayerId: string) => void;
  onDropToStarter: (playerId: string) => void;
}) {
  return (
    <div>
      <div className="mb-0.5 text-center text-[10px] font-bold uppercase tracking-wide text-white/80">{label}</div>
      <div
        className={cn(
          "flex min-h-14 flex-wrap items-stretch justify-center gap-1 rounded border border-dashed border-transparent p-0.5 transition-colors sm:flex-nowrap",
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
            onDropOnPlayer={onDropOnPlayer}
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
  onDragEnd,
  onDropOnPlayer
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
  onDropOnPlayer: (sourcePlayerId: string, targetPlayerId: string) => void;
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
  const cardPrimaryNextForecast = nextFantasyPoints(player);
  const cardPrimaryHorizonForecast = playerHorizonPoints(player, 3);
  const cardAlternativeNextForecast = player.alternativePredictedFp ?? null;
  const cardAlternativeHorizonForecast = playerAlternativeHorizonPoints(player, 3);
  const cardPrimaryNextTitle = squadCardForecastTitle(
    playerPrimaryNextForecastTitle(player, language, cardPrimaryNextForecast),
    cardPrimaryNextForecast,
    isCaptain,
    language
  );
  const cardPrimaryHorizonTitle = squadCardForecastTitle(
    playerPrimaryHorizonForecastTitle(player, language, cardPrimaryHorizonForecast, 3),
    cardPrimaryHorizonForecast,
    isCaptain,
    language
  );
  const cardAlternativeNextTitle = squadCardForecastTitle(
    alternativePlayerForecastTitle(player, language),
    cardAlternativeNextForecast,
    isCaptain,
    language
  );
  const cardAlternativeHorizonTitle = squadCardForecastTitle(
    alternativePlayerHorizonForecastTitle(player, language, 3),
    cardAlternativeHorizonForecast,
    isCaptain,
    language
  );
  const cardFoontasyForecast = scaleCaptainForecast(player.foontasyPoints, isCaptain);
  const cardFoontasyTitle = [
    foontasyForecastTitle(player, language, 1),
    isCaptain ? localizedText(language, "Captain multiplier x2 is applied on this card.", "На карточке применён капитанский коэффициент x2.") : null
  ].filter((line): line is string => Boolean(line)).join("\n");
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
      onDragOver={(event) => allowSquadDrop(event, Boolean(selection))}
      onDrop={(event) => {
        event.stopPropagation();
        const sourcePlayerId = readDraggedPlayerId(event);
        if (sourcePlayerId && sourcePlayerId !== player.playerId) onDropOnPlayer(sourcePlayerId, player.playerId);
      }}
      title={fantasyForecastTitle(player, language)}
      aria-label={localizedText(language, `Squad player ${player.name}`, `Игрок состава: ${player.name}`)}
      className={cn(
        compact ? "w-[3.6rem] sm:w-[3.8rem] 2xl:w-16" : "w-[3.6rem] sm:w-[3.8rem] 2xl:w-[4.25rem]",
        "relative cursor-grab rounded border bg-white px-1 py-0.5 text-center shadow-sm transition active:cursor-grabbing [@media(pointer:fine)]:pb-5",
        isCaptain ? "border-amber-400 ring-2 ring-amber-200" : "border-white/70",
        isDragging && "opacity-55 ring-2 ring-sky-300"
      )}
    >
      <span
        className="absolute left-0.5 top-0.5 max-w-[1.45rem] truncate text-[7px] font-bold text-slate-500"
        title={player.teamName}
      >
        {fantasyPlayerTeamDisplayName(player)}
      </span>
      <button
        type="button"
        onClick={() => onRemove(player.playerId)}
        className="absolute right-0.5 top-0.5 z-10 inline-flex h-3.5 w-3.5 items-center justify-center rounded-full bg-white/90 text-rose-700 shadow-sm hover:bg-rose-50 [@media(pointer:coarse)]:h-6 [@media(pointer:coarse)]:w-6"
        aria-label={removeActionLabel}
      >
        <X className="h-2.5 w-2.5" />
        <span className="sr-only">{removeActionLabel}</span>
      </button>
      <div className="flex translate-x-1 items-center justify-center gap-1">
        <span className={`rounded px-0.5 py-px text-[7px] font-bold ${positionPillClass(player.positionGroup)}`}>{player.positionGroup}</span>
      </div>
      <div className="relative mx-auto grid w-full grid-cols-[1fr_1.75rem_1fr] items-center">
        {isCaptain || isVice ? (
          <span
            className={cn(
              "z-10 mr-0.5 justify-self-end rounded px-0.5 py-px text-[7px] font-black text-white shadow-sm",
              isCaptain ? "bg-amber-700" : "bg-slate-700"
            )}
            title={isCaptain ? captainActionLabel : viceActionLabel}
            aria-label={isCaptain ? localizedText(language, "Captain", "Капитан") : localizedText(language, "Vice-captain", "Вице-капитан")}
          >
            {isCaptain ? "C" : "VC"}
          </span>
        ) : <span aria-hidden="true" />}
        <SquadPlayerPhoto player={player} />
        <span
          className="ml-0.5 justify-self-start whitespace-nowrap text-[7px] font-black text-ink num-tabular"
          title={localizedText(language, `Fantasy price: ${formatNumber(player.price, 1)}`, `Фэнтези-цена: ${formatNumber(player.price, 1)}`)}
          aria-label={localizedText(language, `Fantasy price ${formatNumber(player.price, 1)}`, `Фэнтези-цена ${formatNumber(player.price, 1)}`)}
        >
          {player.priceSource === "ESTIMATED" ? "~" : ""}{formatNumber(player.price, 1)}
        </span>
      </div>
      <p className="mt-0.5 truncate text-[9px] font-bold text-ink" title={player.name} aria-label={player.name}>{compactPlayerDisplayName(player.name)}</p>
      <dl className="mt-0.5 text-[7px] leading-tight num-tabular">
        <div className="grid grid-cols-3 gap-x-px">
          <div className="min-w-0">
            <dt className="whitespace-nowrap text-[6px] font-semibold uppercase text-slate-500"><I18nText en="FP1" ru="ФО1" /></dt>
            <dd className="cursor-help whitespace-nowrap text-[8px] font-bold text-emerald-700" title={cardPrimaryNextTitle}>{formatCompactScore(cardPrimaryNextForecast * (isCaptain ? 2 : 1))}</dd>
          </div>
          <div className="min-w-0">
            <dt className="whitespace-nowrap text-[6px] font-semibold uppercase text-slate-500"><I18nText en="FP3" ru="ФО3" /></dt>
            <dd className="cursor-help whitespace-nowrap text-[8px] font-bold text-sky-700" title={cardPrimaryHorizonTitle}>{formatCompactScore(cardPrimaryHorizonForecast * (isCaptain ? 2 : 1))}</dd>
          </div>
          <div className="min-w-0" title={cardFoontasyTitle}>
            <dt className="whitespace-nowrap text-[6px] font-semibold uppercase text-slate-500">FFO</dt>
            <dd className="cursor-help whitespace-nowrap text-[8px] font-bold text-cyan-700" title={cardFoontasyTitle}>{formatCompactScore(cardFoontasyForecast)}</dd>
          </div>
        </div>
        <div className="mt-px grid grid-cols-2 gap-x-px px-1">
          <div className="min-w-0">
            <dt className="whitespace-nowrap text-[6px] font-semibold uppercase text-slate-500">ALT1</dt>
            <dd className="cursor-help whitespace-nowrap text-[8px] font-bold text-amber-700" title={cardAlternativeNextTitle}>{formatCompactScore(scaleCaptainForecast(cardAlternativeNextForecast, isCaptain), "0")}</dd>
          </div>
          <div className="min-w-0">
            <dt className="whitespace-nowrap text-[6px] font-semibold uppercase text-slate-500">ALT3</dt>
            <dd className="cursor-help whitespace-nowrap text-[8px] font-bold text-violet-700" title={cardAlternativeHorizonTitle}>{formatCompactScore(scaleCaptainForecast(cardAlternativeHorizonForecast, isCaptain), "0")}</dd>
          </div>
        </div>
      </dl>
      {fixtureChips.length > 0 ? (
        <div className="mt-0.5 flex min-w-0 items-center justify-center overflow-hidden">
          <FdrRow
            fixtures={fixtureChips.slice(0, 3)}
            className="min-w-0 flex-nowrap gap-px overflow-hidden [&_.fdr-pill]:min-w-0 [&_.fdr-pill]:max-w-[1.1rem] [&_.fdr-pill]:px-px [&_.fdr-pill]:text-[8px]"
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
          "absolute bottom-0.5 left-0.5 hidden h-4 w-4 items-center justify-center rounded border border-slate-200 text-[7px] font-black hover:bg-amber-50 [@media(pointer:fine)]:inline-flex",
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
          "absolute bottom-0.5 right-0.5 hidden h-4 w-4 items-center justify-center rounded border border-slate-200 text-[7px] font-black hover:bg-slate-50 [@media(pointer:fine)]:inline-flex",
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
      <div aria-hidden="true" className="mx-auto mt-0.5 flex h-7 w-7 items-center justify-center rounded-full bg-slate-200 text-[9px] font-black text-slate-500 ring-1 ring-white">
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
      className="mx-auto mt-0.5 h-7 w-7 rounded-full bg-slate-100 object-cover object-top ring-1 ring-white"
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

function averageForecastValue(baseForecast: number | null, alternativeForecast: number | null) {
  if (baseForecast === null || alternativeForecast === null) return null;
  if (!Number.isFinite(baseForecast) || !Number.isFinite(alternativeForecast)) return null;
  return Math.round(((baseForecast + alternativeForecast) / 2) * 100) / 100;
}

function addProjectionTermLine(
  lines: string[],
  language: UiLanguage,
  label: string,
  value: number | null | undefined,
  formula?: string
) {
  if (value === null || value === undefined || Number.isNaN(value)) return;
  const valueText = formatNumber(value, 4);
  const localizedLabel = projectionBreakdownText(label, language);
  const localizedFormula = formula ? projectionBreakdownText(formula, language) : null;
  if (!formula) {
    lines.push(localizedText(language, `- ${localizedLabel}: ${valueText} FP`, `- ${localizedLabel}: ${valueText} ФО`));
    return;
  }
  lines.push(localizedText(language, `- ${localizedLabel}: ${localizedFormula} = ${valueText} FP`, `- ${localizedLabel}: ${localizedFormula} = ${valueText} ФО`));
}

function projectionBreakdownText(value: string, language: UiLanguage) {
  if (language !== "ru") return value;
  const exact: Record<string, string> = {
    "Appearance FP": "ФО за выход",
    "60+ minutes FP": "ФО за 60+ минут",
    "Full match FP": "ФО за полный матч",
    "Goal FP": "ФО за голы",
    "Assist FP": "ФО за ассисты",
    "Clean sheet FP": "ФО за сухой матч",
    "Save FP": "ФО за сейвы",
    "Recovery FP": "ФО за возвраты",
    "Goals conceded FP": "ФО за пропущенные голы",
    "Yellow card FP": "ФО за жёлтые карточки",
    "Red card FP": "ФО за красные карточки",
    "Total": "Итого",
    "Alternative total": "Итого Альт",
    "not awarded for this position": "не начисляется для этой позиции",
    "not applicable for this position": "не применяется для этой позиции",
    "negative Poisson groups of 2 from expected goals conceded": "отрицательные пуассоновские группы по 2 из ожидаемых пропущенных голов",
    "not available": "нет данных"
  };
  if (exact[value]) return exact[value];
  return value
    .replaceAll("Expected clean sheets", "Ожидаемые сухие матчи")
    .replaceAll("Expected recoveries", "Ожидаемые возвраты")
    .replaceAll("Expected yellow cards", "Ожидаемые жёлтые карточки")
    .replaceAll("Expected red cards", "Ожидаемые красные карточки")
    .replaceAll("Expected assists", "Ожидаемые ассисты")
    .replaceAll("Expected goals", "Ожидаемые голы")
    .replaceAll("Expected saves", "Ожидаемые сейвы")
    .replaceAll("when unavailable", "если данных нет")
    .replaceAll("from", "из");
}

function formatProjectionMetric(value: number | null | undefined, digits = 3) {
  if (value === null || value === undefined || Number.isNaN(value)) return null;
  return formatNumber(value, digits);
}

function minuteHistoryProvenanceLines(
  inputs: FantasyProjectionFixtureInputs | null | undefined,
  language: UiLanguage
) {
  if (!inputs) return [];
  const currentMatches = inputs.currentClubHistoryMatches ?? 0;
  const previousMatches = inputs.previousClubHistoryMatches ?? 0;
  if (previousMatches <= 0) {
    return currentMatches > 0
      ? [localizedText(
          language,
          `Minutes history: ${formatNumber(currentMatches, 0)} current-club matches; no transfer fallback was used.`,
          `История минут: ${formatNumber(currentMatches, 0)} матчей за текущий клуб; резервная выборка трансфера не использовалась.`
        )]
      : [];
  }
  const previousTeam = inputs.previousClubHistoryTeam || localizedText(language, "previous club", "предыдущий клуб");
  const factor = inputs.previousClubPenaltyFactor ?? 0.9;
  return [localizedText(
    language,
    `Transfer fallback: ${formatNumber(currentMatches, 0)} current-club matches + ${formatNumber(previousMatches, 0)} matches for ${previousTeam}. Previous-club minutes and forecast event volumes are weighted by ${formatNumber(factor, 2)} until five current-club matches are available.`,
    `Резервная выборка трансфера: ${formatNumber(currentMatches, 0)} матчей за текущий клуб + ${formatNumber(previousMatches, 0)} матчей за ${previousTeam}. Минуты и объёмы прогнозных событий прошлого клуба учитываются с коэффициентом ${formatNumber(factor, 2)}, пока не накопится пять матчей за текущий клуб.`
  )];
}

function starterMinuteFloorLines(
  inputs: FantasyProjectionFixtureInputs | null | undefined,
  language: UiLanguage
) {
  if (
    !inputs?.rosterStarter ||
    inputs.baseExpectedMinutes === null ||
    inputs.baseExpectedMinutes === undefined ||
    inputs.expectedMinutes === null ||
    inputs.expectedMinutes === undefined
  ) return [];
  const adjustment = inputs.rosterStarterMinutesUplift ?? inputs.expectedMinutes - inputs.baseExpectedMinutes;
  return [localizedText(
    language,
    `Nearest-fixture starter floor: max(base ${formatNumber(inputs.baseExpectedMinutes, 1)}, 60) = ${formatNumber(inputs.expectedMinutes, 1)} expected minutes; adjustment ${adjustment >= 0 ? "+" : ""}${formatNumber(adjustment, 1)}. It is not applied to later fixtures.`,
    `Минимум основы только на ближайший матч: max(базовые ${formatNumber(inputs.baseExpectedMinutes, 1)}, 60) = ${formatNumber(inputs.expectedMinutes, 1)} ожидаемых минут; корректировка ${adjustment >= 0 ? "+" : ""}${formatNumber(adjustment, 1)}. На последующие матчи правило не переносится.`
  )];
}

function addProjectionWeightedTermLine(
  lines: string[],
  language: UiLanguage,
  label: string,
  value: number | null | undefined,
  weight: number,
  variableName: string,
  variableValue: number | null | undefined
) {
  if (value === null || value === undefined || Number.isNaN(value)) return;
  const metric = formatProjectionMetric(variableValue);
  const formula = metric === null ? `${variableName} * ${weight}` : `${variableName} (${metric}) * ${weight}`;
  addProjectionTermLine(lines, language, label, value, formula);
}

function foontasyForecastTitle(player: FantasyPlannerPlayer, language: UiLanguage, horizon: number) {
  const value = horizon === 1 ? player.foontasyPoints : player.foontasyHorizonPoints;
  if (value === null || value === undefined) {
    return localizedText(language, `FFO ${horizon === 1 ? "" : `T${horizon} `}is unavailable. Foontasy currently publishes only the current-round forecast.`, `FFO${horizon === 1 ? "" : ` Т${horizon}`} недоступен: Foontasy сейчас публикует прогноз только текущего тура.`);
  }
  return localizedText(language, `FFO${horizon === 1 ? "" : ` T${horizon}`}: ${formatScore(value)} FP.`, `FFO${horizon === 1 ? "" : ` Т${horizon}`}: ${formatScore(value)} ФО.`);
}

function addPoissonProjectionTermLine(
  lines: string[],
  language: UiLanguage,
  label: string,
  value: number | null | undefined,
  groupSize: 2 | 3,
  variableName: string,
  variableValue: number | null | undefined,
  fallback = 0
) {
  if (value === null || value === undefined || Number.isNaN(value)) return;
  const metric = formatProjectionMetric(variableValue);
  const formula = metric === null
    ? `${fallback} (from ${variableName} when unavailable)`
    : `poisson_groups(${metric}, ${groupSize})`;
  addProjectionTermLine(lines, language, label, value, formula);
}

function buildFormulaBreakdownLines(
  language: UiLanguage,
  formulaData: NonNullable<FantasyPlannerPlayer["projectionFormula"]> | NonNullable<FantasyPlannerPlayer["alternativeProjectionFormula"]>,
  totalLabel: string,
  totalOverride: number | null
) {
  const lines: string[] = [];

  if (formulaData.terms.length === 0) {
    lines.push(localizedText(language, "- No formula terms available.", "- Нет доступных слагаемых формулы."));
  } else {
    formulaData.terms.forEach((term) => {
      const valueText = formatNumber(term.value, 4);
      const moduleLabel = formulaTermLabel(term.expression, language);
      const fixturePrefix = term.fixtureLabel ? `${term.fixtureLabel} — ` : "";
      const resolvedExpression = readableResolvedFormulaExpression(term.resolvedExpression, language);
      const signedExpression = term.sign === -1
        ? `-(${resolvedExpression})`
        : resolvedExpression;
      lines.push(localizedText(
        language,
        `- ${fixturePrefix}${moduleLabel}: ${signedExpression} = ${valueText} FP`,
        `- ${fixturePrefix}${moduleLabel}: ${signedExpression} = ${valueText} ФО`
      ));
    });
  }

  const total = totalOverride === null ? formulaData.total : totalOverride;
  lines.push(formulaContributionTotalLine(
    language,
    totalLabel,
    formulaData.terms.map((term) => term.value),
    total
  ));
  return lines;
}

function readableResolvedFormulaExpression(expression: string, language: UiLanguage) {
  const readable = expression
    .replaceAll(" * ", " × ")
    .replaceAll(" / ", " ÷ ");
  if (language !== "ru") return readable;
  return projectionBreakdownText(readable, language)
    .replaceAll("expected goals conceded", "ожидаемые пропущенные голы")
    .replaceAll("expected clean sheets", "ожидаемые сухие матчи")
    .replaceAll("expected recoveries", "ожидаемые возвраты")
    .replaceAll("expected yellow cards", "ожидаемые жёлтые карточки")
    .replaceAll("expected red cards", "ожидаемые красные карточки")
    .replaceAll("expected assists", "ожидаемые ассисты")
    .replaceAll("expected goals", "ожидаемые голы")
    .replaceAll("expected saves", "ожидаемые сейвы")
    .replaceAll("full match probability", "вероятность полного матча")
    .replaceAll("60 minute probability", "вероятность 60+ минут")
    .replaceAll("appearance probability", "вероятность выхода");
}

function formulaContributionTotalLine(
  language: UiLanguage,
  totalLabel: string,
  contributions: number[],
  total: number
) {
  const arithmetic = contributions.length > 0
    ? contributions.map((value, index) => {
        const absolute = formatNumber(Math.abs(value), 4);
        if (index === 0) return value < 0 || Object.is(value, -0) ? `-${absolute}` : absolute;
        return value < 0 || Object.is(value, -0) ? `- ${absolute}` : `+ ${absolute}`;
      }).join(" ")
    : "0";
  const unroundedTotal = contributions.reduce((sum, value) => sum + value, 0);
  const totalArithmetic = Math.abs(unroundedTotal - total) > 0.00005
    ? `${arithmetic} = ${formatNumber(unroundedTotal, 4)} → ${formatScore(total)}`
    : `${arithmetic} = ${formatScore(total)}`;
  return localizedText(
    language,
    `- ${totalLabel}: ${totalArithmetic} FP`,
    `- ${projectionBreakdownText(totalLabel, language)}: ${totalArithmetic} ФО`
  );
}

function formulaTermLabel(expression: string, language: UiLanguage) {
  const normalized = expression.toLowerCase();
  const english = normalized.includes("expected goals conceded") ? "Goals conceded"
    : normalized.includes("expected goals") ? "Goals"
    : normalized.includes("expected assists") ? "Assists"
    : normalized.includes("expected clean sheets") ? "Clean sheet"
    : normalized.includes("expected saves") ? "Saves"
    : normalized.includes("expected recoveries") ? "Recoveries"
    : normalized.includes("expected yellow cards") ? "Yellow cards"
    : normalized.includes("expected red cards") ? "Red cards"
    : normalized.includes("full match probability") ? "Full match"
    : normalized.includes("60 minute probability") ? "60+ minutes"
    : normalized.includes("appearance probability") ? "Appearance"
    : "Formula module";
  if (language !== "ru") return english;
  return english === "Goals conceded" ? "Пропущенные голы"
    : english === "Goals" ? "Голы"
    : english === "Assists" ? "Ассисты"
    : english === "Clean sheet" ? "Сухой матч"
    : english === "Saves" ? "Сейвы"
    : english === "Recoveries" ? "Возвраты"
    : english === "Yellow cards" ? "Жёлтые карточки"
    : english === "Red cards" ? "Красные карточки"
    : english === "Full match" ? "Полный матч"
    : english === "60+ minutes" ? "60+ минут"
    : english === "Appearance" ? "Выход на поле"
    : "Модуль формулы";
}

function buildProjectionBreakdownLines(
  player: FantasyPlannerPlayer,
  language: UiLanguage,
  components: NonNullable<FantasyPlannerPlayer["projectionComponents"]>,
  fixtureInputs: FantasyProjectionFixtureInputs | null | undefined
) {
  const lines: string[] = [];
  const goalWeight = player.positionGroup === "MID" ? 5 : player.positionGroup === "FWD" ? 4 : 6;
  const cleanSheetWeight = player.positionGroup === "GK" || player.positionGroup === "DEF" ? 4 : 1;
  const showFullMatch = player.positionGroup === "MID" || player.positionGroup === "FWD";
  const showSaves = player.positionGroup === "GK";
  const showRecoveries = player.positionGroup !== "GK";
  const showGoalsConceded = player.positionGroup === "GK" || player.positionGroup === "DEF";

  if (fixtureInputs?.expectedMinutes !== null && fixtureInputs?.expectedMinutes !== undefined) {
    const expectedMinutes = formatProjectionMetric(fixtureInputs.expectedMinutes, 1);
    if (expectedMinutes) lines.push(localizedText(language, `- Expected minutes: ${expectedMinutes}`, `- Ожидаемые минуты: ${expectedMinutes}`));
  }
  lines.push(...starterMinuteFloorLines(fixtureInputs, language));
  lines.push(...minuteHistoryProvenanceLines(fixtureInputs, language));

  addProjectionWeightedTermLine(
    lines,
    language,
    "Appearance FP",
    components.appearance,
    1,
    "P(appearance)",
    fixtureInputs?.appearanceProbability
  );
  addProjectionWeightedTermLine(
    lines,
    language,
    "60+ minutes FP",
    components.sixtyMinutes,
    1,
    "P(60+ min)",
    fixtureInputs?.sixtyMinutesProbability
  );
  if (showFullMatch) {
    addProjectionWeightedTermLine(
      lines,
      language,
      "Full match FP",
      components.fullMatch,
      1,
      "P(full match)",
      fixtureInputs?.fullMatchProbability
    );
  } else {
    addProjectionTermLine(lines, language, "Full match FP", components.fullMatch, "not awarded for this position");
  }

  addProjectionWeightedTermLine(
    lines,
    language,
    "Goal FP",
    components.goals,
    goalWeight,
    "Expected goals",
    fixtureInputs?.expectedGoals
  );
  addProjectionWeightedTermLine(
    lines,
    language,
    "Assist FP",
    components.assists,
    3,
    "Expected assists",
    fixtureInputs?.expectedAssists
  );
  addProjectionWeightedTermLine(
    lines,
    language,
    "Clean sheet FP",
    components.cleanSheet,
    cleanSheetWeight,
    "Expected clean sheets",
    fixtureInputs?.expectedCleanSheets
  );

  if (showSaves) {
    addPoissonProjectionTermLine(
      lines,
      language,
      "Save FP",
      components.saves,
      3,
      "Expected saves",
      fixtureInputs?.expectedSaves,
      0
    );
  } else {
    addProjectionTermLine(lines, language, "Save FP", components.saves, "not applicable for this position");
  }

  if (showRecoveries) {
    addPoissonProjectionTermLine(
      lines,
      language,
      "Recovery FP",
      components.recoveries,
      3,
      "Expected recoveries",
      fixtureInputs?.expectedRecoveries,
      0
    );
  } else {
    addProjectionTermLine(lines, language, "Recovery FP", components.recoveries, "not applicable for this position");
  }

  if (showGoalsConceded) {
    if (fixtureInputs?.expectedGoalsConceded !== null && fixtureInputs?.expectedGoalsConceded !== undefined && Number.isFinite(fixtureInputs.expectedGoalsConceded)) {
      const expected = fixtureInputs.expectedGoalsConceded;
      const formula = `-poisson_groups(${formatProjectionMetric(expected, 3)}, 2)`;
      addProjectionTermLine(lines, language, "Goals conceded FP", components.goalsConceded, formula);
    } else {
      addProjectionTermLine(lines, language, "Goals conceded FP", components.goalsConceded, "not available");
    }
  } else {
    addProjectionTermLine(lines, language, "Goals conceded FP", components.goalsConceded, "not awarded for this position");
  }

  addProjectionWeightedTermLine(
    lines,
    language,
    "Yellow card FP",
    components.yellowCards,
    -1,
    "Expected yellow cards",
    fixtureInputs?.expectedYellowCards
  );
  addProjectionWeightedTermLine(
    lines,
    language,
    "Red card FP",
    components.redCards,
    -3,
    "Expected red cards",
    fixtureInputs?.expectedRedCards
  );
  const contributions = [
    components.appearance,
    components.sixtyMinutes,
    components.fullMatch,
    components.goals,
    components.assists,
    components.cleanSheet,
    components.saves,
    components.recoveries,
    components.goalsConceded,
    components.yellowCards,
    components.redCards
  ];
  lines.push(formulaContributionTotalLine(language, "Total", contributions, components.total));

  const computedTotal = contributions.reduce((total, value) => total + (value ?? 0), 0);
  if (Math.abs(computedTotal - components.total) > 0.001) {
    lines.push(localizedText(language, "Total differs from module sum: custom weights/order were applied during scoring.", "Итог отличается от суммы модулей: применены пользовательские веса или порядок расчёта."));
  }

  return lines;
}

function buildAlternativeProjectionBreakdownLines(
  player: FantasyPlannerPlayer,
  language: UiLanguage,
  components: NonNullable<FantasyPlannerPlayer["alternativeProjectionComponents"]>,
  fixtureInputs: FantasyProjectionFixtureInputs | null | undefined
) {
  const lines: string[] = [];
  const goalWeight = player.positionGroup === "MID" ? 5 : player.positionGroup === "FWD" ? 4 : 6;
  const cleanSheetWeight = player.positionGroup === "GK" || player.positionGroup === "DEF" ? 4 : 1;
  const showFullMatch = player.positionGroup === "MID" || player.positionGroup === "FWD";
  const showSaves = player.positionGroup === "GK";
  const showRecoveries = player.positionGroup !== "GK";

  if (fixtureInputs?.expectedMinutes !== null && fixtureInputs?.expectedMinutes !== undefined) {
    const expectedMinutes = formatProjectionMetric(fixtureInputs.expectedMinutes, 1);
    if (expectedMinutes) lines.push(localizedText(language, `- Expected minutes: ${expectedMinutes}`, `- Ожидаемые минуты: ${expectedMinutes}`));
  }
  lines.push(...minuteHistoryProvenanceLines(fixtureInputs, language));

  addProjectionWeightedTermLine(
    lines,
    language,
    "Appearance FP",
    components.appearance,
    1,
    "P(appearance)",
    fixtureInputs?.appearanceProbability
  );
  addProjectionWeightedTermLine(
    lines,
    language,
    "60+ minutes FP",
    components.sixtyMinutes,
    1,
    "P(60+ min)",
    fixtureInputs?.sixtyMinutesProbability
  );
  if (showFullMatch) {
    addProjectionWeightedTermLine(
      lines,
      language,
      "Full match FP",
      components.fullMatch,
      1,
      "P(full match)",
      fixtureInputs?.fullMatchProbability
    );
  } else {
    addProjectionTermLine(lines, language, "Full match FP", components.fullMatch, "not awarded for this position");
  }

  addProjectionWeightedTermLine(
    lines,
    language,
    "Goal FP",
    components.goals,
    goalWeight,
    "Expected goals",
    fixtureInputs?.expectedGoals
  );
  addProjectionWeightedTermLine(
    lines,
    language,
    "Assist FP",
    components.assists,
    3,
    "Expected assists",
    fixtureInputs?.expectedAssists
  );
  addProjectionWeightedTermLine(
    lines,
    language,
    "Clean sheet FP",
    components.cleanSheet,
    cleanSheetWeight,
    "Expected clean sheets",
    fixtureInputs?.expectedCleanSheets
  );

  if (showSaves) {
    const savesMetric = formatProjectionMetric(fixtureInputs?.expectedSaves);
    const savesFormula = savesMetric === null ? "Expected saves / 3" : `${savesMetric} / 3`;
    addProjectionTermLine(lines, language, "Save FP", components.saves, `${savesFormula}`);
  } else {
    addProjectionTermLine(lines, language, "Save FP", components.saves, "not applicable for this position");
  }

  if (showRecoveries) {
    const recoveriesMetric = formatProjectionMetric(fixtureInputs?.expectedRecoveries);
    const recoveriesFormula = recoveriesMetric === null ? "Expected recoveries / 3" : `${recoveriesMetric} / 3`;
    addProjectionTermLine(lines, language, "Recovery FP", components.recoveries, recoveriesFormula);
  } else {
    addProjectionTermLine(lines, language, "Recovery FP", components.recoveries, "not applicable for this position");
  }

  const concededPenaltyApplies = player.positionGroup === "GK" || player.positionGroup === "DEF";
  const expectedGoalsConceded = formatProjectionMetric(fixtureInputs?.expectedGoalsConceded);
  addProjectionTermLine(
    lines,
    language,
    "Goals conceded FP",
    components.goalsConceded,
    concededPenaltyApplies
      ? expectedGoalsConceded === null
        ? "negative Poisson groups of 2 from expected goals conceded"
        : `-poisson_groups(${expectedGoalsConceded}, 2)`
      : "not applicable for this position"
  );

  addProjectionWeightedTermLine(
    lines,
    language,
    "Yellow card FP",
    components.yellowCards,
    -1,
    "Expected yellow cards",
    fixtureInputs?.expectedYellowCards
  );
  addProjectionWeightedTermLine(
    lines,
    language,
    "Red card FP",
    components.redCards,
    -3,
    "Expected red cards",
    fixtureInputs?.expectedRedCards
  );
  const contributions = [
    components.appearance,
    components.sixtyMinutes,
    components.fullMatch,
    components.goals,
    components.assists,
    components.cleanSheet,
    components.saves,
    components.recoveries,
    components.goalsConceded,
    components.yellowCards,
    components.redCards
  ];
  lines.push(formulaContributionTotalLine(language, "Alternative total", contributions, components.total));

  const computedTotal = contributions.reduce((total, value) => total + (value ?? 0), 0);
  if (Math.abs(computedTotal - components.total) > 0.001) {
    lines.push(localizedText(language, "Total differs from module sum: custom weights/order were applied during scoring.", "Итог отличается от суммы модулей: применены пользовательские веса или порядок расчёта."));
  }

  return lines;
}

function playerPrimaryNextForecastTitle(player: FantasyPlannerPlayer, language: UiLanguage, nextForecast: number | null) {
  const lines = [localizedText(language, `Primary forecast for next round: ${formatScore(nextForecast)} FP`, `Основной прогноз на следующий тур: ${formatScore(nextForecast)} ФО`)];
  if (player.projectionEngine === "COMPONENT_XFP_V1" && player.projectionFormula) {
    lines.push(...starterMinuteFloorLines(player.projectedFixtureComponents, language));
    lines.push(...minuteHistoryProvenanceLines(player.projectedFixtureComponents, language));
    lines.push(...buildFormulaBreakdownLines(language, player.projectionFormula, "Total", nextForecast));
  } else if (player.projectionEngine === "COMPONENT_XFP_V1" && player.projectionComponents) {
    lines.push(...buildProjectionBreakdownLines(player, language, player.projectionComponents, player.projectedFixtureComponents));
  } else if (player.projectionEngine === "LEGACY_RIDGE19_V1") {
    lines.push(localizedText(
      language,
      "The legacy calibrated forecast does not expose a component-level arithmetic breakdown; component-model values are intentionally not shown as if they formed this total.",
      "Калиброванный legacy-прогноз не сохраняет арифметический разбор по компонентам; значения компонентной модели намеренно не показываются так, будто из них получен этот итог."
    ));
  }
  return lines.join("\n");
}

function playerPrimaryHorizonForecastTitle(
  player: FantasyPlannerPlayer,
  language: UiLanguage,
  primaryHorizonForecast: number | null,
  horizon: number
) {
  const available = player.roundPoints.slice(0, horizon).filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  const lines = [localizedText(language, `Primary forecast total over ${horizon} rounds: ${formatScore(primaryHorizonForecast)} FP`, `Основной прогноз на ${horizon} тура: ${formatScore(primaryHorizonForecast)} ФО`)];
  if (available.length > 0) {
    lines.push(localizedText(language, "Round-by-round values:", "По турам:"));
    available.forEach((value, index) => lines.push(localizedText(language, `Round ${index + 1}: ${formatScore(value)} FP`, `Тур ${index + 1}: ${formatScore(value)} ФО`)));
  }
  if (available.length === 0) {
    lines.push(localizedText(language, "No round-by-round values available yet.", "Значений по отдельным турам пока нет."));
  }
  if (player.forecastModelVersion) {
    lines.push(localizedText(language, `Model: ${player.forecastModelVersion}`, `Модель: ${player.forecastModelVersion}`));
  }
  return lines.join("\n");
}

function playerAverageForecastTitle(
  language: UiLanguage,
  averageForecast: number | null,
  primaryForecast: number | null,
  alternativeForecast: number | null,
  horizon: number
) {
  const base = formatScore(primaryForecast);
  const alternative = formatScore(alternativeForecast);
  const lines = [
    localizedText(language, `Average forecast (${horizon} rounds): ${formatScore(averageForecast)} FP`, `Средний прогноз (${horizon} туров): ${formatScore(averageForecast)} ФО`),
  ];
  if (primaryForecast === null || alternativeForecast === null) {
    lines.push(
      localizedText(language, "Average is not available because one source is missing for this player.", "Среднее недоступно: для игрока отсутствует один из источников.")
    );
  }
  return lines.join("\n");
}

function alternativePlayerForecastTitle(player: FantasyPlannerPlayer, language: UiLanguage) {
  const nextAlternative = player.alternativePredictedFp ?? null;
  const lines = [localizedText(language, `Alternative forecast for next fixture: ${formatScore(nextAlternative)} FP`, `Альтернативный прогноз на следующий матч: ${formatScore(nextAlternative)} ФО`)];
  const minuteInputs = player.alternativeProjectedFixtureComponents;
  lines.push(...starterMinuteFloorLines(minuteInputs, language));
  if (player.alternativeProjectionFormula) {
    lines.push(...minuteHistoryProvenanceLines(player.alternativeProjectedFixtureComponents, language));
    lines.push(...buildFormulaBreakdownLines(
      language,
      player.alternativeProjectionFormula,
      "Alternative total",
      nextAlternative
    ));
  } else if (player.alternativeProjectionComponents) {
    lines.push(
      ...buildAlternativeProjectionBreakdownLines(
        player,
        language,
        player.alternativeProjectionComponents,
        player.alternativeProjectedFixtureComponents
      )
    );
  } else {
    lines.push(localizedText(language, "This player does not expose component-level alternative decomposition.", "Для этого игрока нет покомпонентной расшифровки Альт."));
  }
  return lines.join("\n");
}

function alternativePlayerHorizonForecastTitle(player: FantasyPlannerPlayer, language: UiLanguage, horizon: number) {
  const alternativeTotal = playerAlternativeHorizonPoints(player, horizon);
  const values = player.alternativeRoundPoints?.slice(0, horizon).filter((value): value is number => value !== null && Number.isFinite(value)) ?? [];
  const lines = [localizedText(language, `Alternative forecast total over ${horizon} rounds: ${formatScore(alternativeTotal)} FP`, `Альтернативный прогноз на ${horizon} тура: ${formatScore(alternativeTotal)} ФО`)];
  if (values.length > 0) {
    lines.push(localizedText(language, "Round-by-round values:", "По турам:"));
    values.forEach((value, index) => lines.push(localizedText(language, `Round ${index + 1}: ${formatScore(value)} FP`, `Тур ${index + 1}: ${formatScore(value)} ФО`)));
  }
  return lines.join("\n");
}

function squadCardForecastTitle(details: string, baseValue: number | null, isCaptain: boolean, language: UiLanguage) {
  if (!isCaptain || baseValue === null || !Number.isFinite(baseValue)) return details;
  return [
    details,
    localizedText(
      language,
      `Captain: ${formatScore(baseValue)} × 2 = ${formatScore(baseValue * 2)} FP`,
      `Капитан: ${formatScore(baseValue)} × 2 = ${formatScore(baseValue * 2)} ФО`
    )
  ].join("\n");
}

function alternativePredictedFpTitle(language: UiLanguage) {
  return localizedText(
    language,
    "Alternative forecast for the next fixture.",
    "Альтернативный прогноз FP на следующий матч. Только для просмотра: не используется в автоподборе, ценности, трансферах и очках тура."
  );
}

function alternativeFiveRoundFpTitle(language: UiLanguage, horizon = 5) {
  return localizedText(
    language,
    `Total alternative forecast over ${horizon} rounds.`,
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
    foontasyNext: localizedText(language, "Foontasy current-round forecast (FFO).", "Прогноз Foontasy на текущий тур (FFO)."),
    alternative: alternativePredictedFpTitle(language),
    alternativeFive: alternativeFiveRoundFpTitle(language, horizon),
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

  return sanitizeCaptainRoles(orderSquadSelectionsWithBenchGoalkeeperLast(normalized, players));
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
  if (scope === "ALL_PLAYER_MATCHES") return localizedText(language, "All player matches, including national teams", "Все матчи игрока, включая сборные");
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

function scaleCaptainForecast(value: number | null | undefined, isCaptain: boolean) {
  return typeof value === "number" && Number.isFinite(value) ? value * (isCaptain ? 2 : 1) : null;
}

async function downloadPlayerPoolXlsx(
  players: FantasyPlannerPlayer[],
  horizon: number,
  language: UiLanguage,
  leagueId: string,
  season: string,
  visibleColumnKeys: string[]
) {
  const optionalColumnsByKey = new Map(playerPoolOptionalColumns(players, horizon, language).map((column) => [column.key, column]));
  const selectedColumns = visibleColumnKeys
    .map((key) => optionalColumnsByKey.get(key))
    .filter((column): column is PlayerPoolOptionalColumn => Boolean(column));
  const columns = [
    { key: "player", header: localizedText(language, "Player", "Игрок") },
    { key: "team", header: localizedText(language, "Team", "Команда") },
    { key: "position", header: localizedText(language, "Position", "Позиция") },
    { key: "price", header: localizedText(language, "Price", "Цена") },
    ...selectedColumns.map((column) => ({ key: column.key, header: column.label }))
  ];
  const response = await fetch("/api/machete/squads/export-table", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" },
    body: JSON.stringify({
      leagueId,
      season,
      language,
      horizon,
      columns,
      rows: players.map((player) => ({
        player: player.fotmobName ?? player.name,
        team: player.teamName,
        position: player.positionGroup,
        price: player.price,
        ...Object.fromEntries(selectedColumns.map((column) => [
          column.key,
          playerPoolExportCellValue(column.key, player, horizon)
        ]))
      }))
    })
  });
  if (!response.ok) throw new Error("PLAYER_TABLE_EXPORT_FAILED");

  const blob = await response.blob();
  const href = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = href;
  link.download = `players-${leagueId}-${season.replaceAll("/", "-")}.xlsx`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(href);
}

async function loadSquadFilterPresets(signal?: AbortSignal) {
  try {
    const response = await fetch("/api/user/saved-views?source=squad", { cache: "no-store", signal });
    if (!response.ok) return null;
    return squadFilterPresetsFromPayload(await response.json());
  } catch (error) {
    if ((error as Error).name === "AbortError") return null;
    return null;
  }
}

async function saveSquadFilterPreset(name: string, filters: SquadFilterPresetFilters) {
  try {
    const href = `squad-filter:${encodeURIComponent(name.trim().toLocaleLowerCase())}`;
    const response = await fetch("/api/user/saved-views", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ source: "squad", name: name.trim().slice(0, 60), href, filters })
    });
    if (!response.ok) return null;
    return squadFilterPresetsFromPayload(await response.json());
  } catch {
    return null;
  }
}

async function removeSquadFilterPreset(id: string) {
  try {
    const params = new URLSearchParams({ source: "squad", id });
    const response = await fetch(`/api/user/saved-views?${params.toString()}`, { method: "DELETE" });
    if (!response.ok) return null;
    return squadFilterPresetsFromPayload(await response.json());
  } catch {
    return null;
  }
}

function squadFilterPresetsFromPayload(payload: unknown): SquadFilterPreset[] | null {
  if (!payload || typeof payload !== "object" || !Array.isArray((payload as { views?: unknown }).views)) return null;
  const result: SquadFilterPreset[] = [];
  for (const item of (payload as { views: unknown[] }).views) {
    if (!item || typeof item !== "object") continue;
    const preset = item as Partial<SquadFilterPreset>;
    if (typeof preset.id !== "string" || typeof preset.name !== "string" || typeof preset.createdAt !== "string" || typeof preset.updatedAt !== "string" || !preset.filters) continue;
    result.push(preset as SquadFilterPreset);
  }
  return result.slice(0, 20);
}

function playerPoolExportCellValue(key: string, player: FantasyPlannerPlayer, horizon: number) {
  if (key === "fixtures") return player.fixtures.slice(0, horizon).join(" | ");
  const value = customPlayerPoolColumnValue(key, player, horizon);
  if (typeof value !== "number") return value;
  if (["startProbability", "sixtyProbability", "fullMatchProbability", "forecastConfidence"].includes(key) || /(?:appearance|sixty|full_match)_(?:probability|rate)/.test(key)) {
    return value * 100;
  }
  return value;
}
