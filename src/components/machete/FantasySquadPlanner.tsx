"use client";

import { ArrowLeft, ArrowLeftRight, ArrowRight, Bookmark, Check, Columns3, Crown, Download, Layers3, ListChecks, LoaderCircle, Lock, MoreHorizontal, Plus, Save, Search, SlidersHorizontal, Sparkles, Trash2, Undo2, Users, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { type DragEvent, type PointerEvent as ReactPointerEvent, type ReactNode, type RefObject, type SetStateAction, startTransition as startPlayerPoolTransition, useDeferredValue, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";

import { I18nText } from "@/components/i18n-text";
import { LocalizedOption, localizedText, useLanguage } from "@/components/localized-option";
import {
  fantasyAlternativeRoundPointsWithActiveChip,
  fantasyRoundPointsWithActiveChip,
  fixtureChipPresentations,
  isSquadReplacementTarget,
  mergeFantasyPlayerPools,
  orderSquadSelectionsWithBenchGoalkeeperLast,
  replaceSquadSelectionPlayer,
  startingXiAlternativeHorizonPoints,
  startingXiAlternativeRoundPoints,
  startingXiFoontasyPoints,
  startingXiRoundPoints,
  swapSquadSelectionCards,
  type FantasyActiveChip
} from "@/components/machete/fantasy-squad-ui";
import { ProjectionFormulaHoverCard } from "@/components/machete/ProjectionFormulaHoverCard";
import { FantasyFixtureCalendar } from "@/components/machete/FantasyFixtureCalendar";
import { parseFantasyFixtureCalendar, type FantasyFixtureCalendar as FixtureCalendarData } from "@/machete/squad-fixture-calendar";
import { SortableTable, type SortDirection } from "@/components/sortable-table";
import { FdrRow } from "@/components/ui/fdr-pill";
import { SegmentedControl, type SegmentedOption } from "@/components/ui/segmented-control";
import { compactPriceHeaderThreshold, responsivePriceHeaderLabel } from "@/components/machete/responsive-price-label";
import type {
  FantasySquadWorkerRequest,
  FantasySquadWorkerResponse,
  TransferSuggestionWorkerInput
} from "@/components/machete/fantasy-squad-worker-contract";
import { formatAlternativeScore, formatCompactScore, formatDate, formatDateTime, formatNumber, formatScore } from "@/lib/format";
import { cn } from "@/lib/cn";
import { compactPlayerDisplayName } from "@/lib/players/display-name";
import { compareFantasyPositions, fantasyPositionOrder, fantasyPositionRank, isFantasyPositionSortKey } from "@/lib/players/fantasy-position-order";
import {
  betaSessionHasMilestone,
  recordBetaClientError,
  recordBetaMilestone
} from "@/lib/beta-telemetry-client";
import {
  availableTransfersByRound,
  canStartFantasyPlayer,
  countFantasySquadTransfers,
  createFantasyAddEvaluator,
  createFantasyFitEvaluator,
  createFantasySquadRoundPlans,
  fantasyTransferBudget,
  nextAlternativeFantasyPoints,
  nextFantasyPoints,
  normalizeFantasyHorizon,
  optimizeFantasySquad,
  optimizeFantasyStarters,
  playerAlternativeHorizonPoints,
  playerHorizonPoints,
  selectionForPlayer,
  selectionForNewPlayer,
  summarizeFantasySquad,
  transferSuggestionForecastHorizonPoints,
  transferSuggestionForecastNextPoints,
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
  type TransferPlanSuggestion,
  type TransferSuggestionForecastSource
} from "@/machete/squad_logic";
import { forecastPointsPerPrice } from "@/machete/fantasy-value-efficiency";
import type { FantasyBookmakerFavorite, SavedFantasySquad } from "@/machete/squad_planner";
import { plannerReadinessBlocksForecastActions, type PlannerReadiness } from "@/machete/planner_readiness";
import type { SportsRuSquadSnapshotStatus } from "@/machete/sports_ru_squad_snapshots";
import type { SquadFilterPreset, SquadFilterPresetFilters } from "@/machete/squad-filter-presets";
import {
  fantasySquadLeagueNavigationEvent,
  fantasySquadLeagueNavigationTarget,
  fantasySquadPendingLeagueId,
  subscribeFantasySquadLeagueNavigation
} from "@/machete/squad-league-navigation";
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
  defaultFantasyHistorySettings,
  fantasyHistorySettingsKey,
  type FantasyHistoryScope,
  type FantasyHistorySettings
} from "@/machete/squad-history-settings";

type FantasySquadPlannerProps = {
  leagueId: string;
  season: string;
  provider: string;
  rules: FantasySquadRules;
  rounds: FantasyRoundProjection[];
  bookmakerFavorites: FantasyBookmakerFavorite[];
  initialFixtureCalendar?: FixtureCalendarData | null;
  players: FantasyPlannerPlayer[];
  playerPoolHref?: string;
  squadApiPath?: string;
  squadRoutePath?: string;
  initialSquad: SavedFantasySquad;
  readiness: PlannerReadiness;
  sportsRuSquadStatus: SportsRuSquadSnapshotStatus | null;
  historySettings: FantasyHistorySettings;
  initialVisiblePlayerPoolColumns: string[];
  initialPlayerPoolColumnWidths: Record<string, number>;
};

const squadDragDataType = "application/x-fantasy-player-id";
const fantasySquadOptimizationSafetyTimeoutMs = 15_000;

type UiLanguage = ReturnType<typeof useLanguage>;
type MobileTab = "squad" | "pool" | "suggestions";
type SportsImportNotice = {
  tone: "progress" | "waiting" | "success" | "error";
  text: string;
};
type StoredSquadCaptains = {
  captainId: string | null;
  viceCaptainId: string | null;
};
type PlayerPoolPageInfo = {
  nextCursor: string | null;
  nextStage: "BASE" | "DETAILS" | null;
  visiblePlayers: number;
  enrichedPlayers: number;
  totalPlayers: number;
  complete: boolean;
  batchSize: number;
  priorityPlayers: number;
  strategy: "ACTIVE_SQUADS_THEN_POPULARITY";
  stage: "BASE" | "DETAILS";
  snapshotId: string | null;
};
type PlayerPoolProgress = {
  visiblePlayers: number;
  enrichedPlayers: number;
  totalPlayers: number | null;
  priorityPlayers: number;
  stage: "BASE" | "DETAILS";
};

function emptyPlayerPoolProgress(visiblePlayers = 0): PlayerPoolProgress {
  return {
    visiblePlayers,
    enrichedPlayers: visiblePlayers,
    totalPlayers: null,
    priorityPlayers: visiblePlayers,
    stage: "BASE"
  };
}

function playerPoolProgressMessage(progress: PlayerPoolProgress) {
  if (progress.totalPlayers === null) {
    return progress.visiblePlayers > 0
      ? {
          en: "Your saved squad is already available. Loading the first market batch...",
          ru: "Сохранённый состав уже доступен. Загружаем первый батч рынка..."
        }
      : {
          en: "Loading the first player batch...",
          ru: "Загружаем первый батч игроков..."
        };
  }
  if (progress.stage === "BASE") {
    return {
      en: `Players ready: ${progress.visiblePlayers}/${progress.totalPlayers}. Saved-squad players load first, then Sports.ru popularity; this list is already interactive.`,
      ru: `Игроки доступны: ${progress.visiblePlayers}/${progress.totalPlayers}. Сначала загружаются футболисты из сохранённых составов, затем — по популярности Sports.ru; списком уже можно пользоваться.`
    };
  }
  return {
    en: `All ${progress.totalPlayers} players are available. Updating forecasts: ${progress.enrichedPlayers}/${progress.totalPlayers}.`,
    ru: `Все ${progress.totalPlayers} игроков уже доступны. Обновляем прогнозы: ${progress.enrichedPlayers}/${progress.totalPlayers}.`
  };
}

function parsePlayerPoolPageInfo(value: unknown): PlayerPoolPageInfo | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const page = value as Record<string, unknown>;
  const nextCursor = page.nextCursor;
  const nextStage = page.nextStage;
  const visiblePlayers = page.visiblePlayers;
  const enrichedPlayers = page.enrichedPlayers;
  const totalPlayers = page.totalPlayers;
  const batchSize = page.batchSize;
  const priorityPlayers = page.priorityPlayers;
  const complete = page.complete;
  const snapshotId = page.snapshotId ?? null;
  if (nextCursor !== null && (typeof nextCursor !== "string" || !/^\d+$/.test(nextCursor))) return null;
  if (nextStage !== null && nextStage !== "BASE" && nextStage !== "DETAILS") return null;
  if (!Number.isSafeInteger(totalPlayers) || Number(totalPlayers) < 0) return null;
  if (!Number.isSafeInteger(visiblePlayers) || Number(visiblePlayers) < 0 || Number(visiblePlayers) > Number(totalPlayers)) return null;
  if (!Number.isSafeInteger(enrichedPlayers) || Number(enrichedPlayers) < 0 || Number(enrichedPlayers) > Number(totalPlayers)) return null;
  if (!Number.isSafeInteger(batchSize) || Number(batchSize) < 1) return null;
  if (!Number.isSafeInteger(priorityPlayers) || Number(priorityPlayers) < 0 || Number(priorityPlayers) > Number(totalPlayers)) return null;
  if (typeof complete !== "boolean" || page.strategy !== "ACTIVE_SQUADS_THEN_POPULARITY") return null;
  if (page.stage !== "BASE" && page.stage !== "DETAILS") return null;
  if (snapshotId !== null && (typeof snapshotId !== "string" || snapshotId.length < 1 || snapshotId.length > 128)) return null;
  if (complete !== (nextCursor === null && nextStage === null)) return null;
  if (!complete && (nextCursor === null || nextStage === null)) return null;
  if (page.stage === "BASE" && (complete || Number(enrichedPlayers) !== 0)) return null;
  if (page.stage === "DETAILS" && Number(visiblePlayers) !== Number(totalPlayers)) return null;
  return {
    nextCursor,
    nextStage,
    visiblePlayers: Number(visiblePlayers),
    enrichedPlayers: Number(enrichedPlayers),
    totalPlayers: Number(totalPlayers),
    batchSize: Number(batchSize),
    priorityPlayers: Number(priorityPlayers),
    complete,
    strategy: "ACTIVE_SQUADS_THEN_POPULARITY",
    stage: page.stage,
    snapshotId
  };
}

function playerPoolSnapshotIdFromHref(href: string | undefined) {
  if (!href) return null;
  try {
    const value = new URL(href, "https://fantasy.local").searchParams.get("snapshotId")?.trim() ?? "";
    return value.length > 0 && value.length <= 128 ? value : null;
  } catch {
    return null;
  }
}

function playerPoolSnapshotStatusHref(href: string) {
  try {
    const source = new URL(href, "https://fantasy.local");
    if (source.pathname !== "/api/machete/squads") return null;
    const leagueId = source.searchParams.get("leagueId");
    const season = source.searchParams.get("season");
    if (!leagueId || !season) return null;
    const params = new URLSearchParams({ leagueId, season });
    return `/api/machete/squads/snapshot?${params.toString()}`;
  } catch {
    return null;
  }
}

async function yieldToPlayerPoolUi() {
  const scheduler = (globalThis as { scheduler?: { yield?: () => Promise<void> } }).scheduler;
  if (scheduler?.yield) {
    await scheduler.yield();
    return;
  }
  await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
}

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

type TransferSuggestionCalculation = {
  players: FantasyPlannerPlayer[];
  selections: FantasySquadSelection[];
  rules: FantasySquadRules;
  horizon: number;
  forecastSource: TransferSuggestionForecastSource;
  availableSuggestionCount: number;
  suggestions: TransferPlanSuggestion[];
};

export function FantasySquadPlanner({ leagueId, season, provider, rules, rounds, bookmakerFavorites, initialFixtureCalendar = null, players: initialPlayers, playerPoolHref, squadApiPath = "/api/machete/squads", squadRoutePath = "/machete/squad", initialSquad, readiness, sportsRuSquadStatus, historySettings, initialVisiblePlayerPoolColumns, initialPlayerPoolColumnWidths }: FantasySquadPlannerProps) {
  const language = useLanguage();
  const router = useRouter();
  const budgetForecastRef = useRef<HTMLDivElement>(null);
  const suggestionPanelRef = useRef<HTMLDivElement>(null);
  const plannerTabsRef = useRef<HTMLDivElement>(null);
  const squadSectionRef = useRef<HTMLDivElement>(null);
  const playerPoolSectionRef = useRef<HTMLDivElement>(null);
  const [sourcePlayers, setSourcePlayers] = useState<FantasyPlannerPlayer[]>(initialPlayers);
  const sourcePlayersRef = useRef<FantasyPlannerPlayer[]>(initialPlayers);
  const activePlayerPoolSnapshotIdRef = useRef<string | null>(playerPoolSnapshotIdFromHref(playerPoolHref));
  const [fixtureCalendar, setFixtureCalendar] = useState(initialFixtureCalendar);
  const fixtureCalendarRef = useRef(initialFixtureCalendar);
  const fixtureCalendarSnapshotIdRef = useRef(initialFixtureCalendar ? playerPoolSnapshotIdFromHref(playerPoolHref) : null);
  const playerPoolInitialLoadCompleteRef = useRef(!playerPoolHref);
  const playerPoolBackgroundRefreshRunningRef = useRef(false);
  const foregroundPlayerPoolCancelRef = useRef<(() => void) | null>(null);
  const backgroundPlayerPoolCancelRef = useRef<(() => void) | null>(null);
  const pendingLeagueId = useSyncExternalStore(
    subscribeFantasySquadLeagueNavigation,
    fantasySquadPendingLeagueId,
    () => null
  );
  const leagueNavigationPending = Boolean(pendingLeagueId && pendingLeagueId !== leagueId);
  const [appliedHistorySettings, setAppliedHistorySettings] = useState(historySettings);
  const [playerPoolRequestHref, setPlayerPoolRequestHref] = useState(playerPoolHref);
  const [activeRoundOffset, setActiveRoundOffset] = useState(0);
  const players = useMemo(
    () => sourcePlayers.map((player) => fantasyPlayerAtRoundOffset(player, activeRoundOffset)),
    [activeRoundOffset, sourcePlayers]
  );
  const [playerPoolPending, setPlayerPoolPending] = useState(Boolean(playerPoolHref));
  const [playerPoolFailed, setPlayerPoolFailed] = useState(false);
  const [playerPoolAvailable, setPlayerPoolAvailable] = useState(!playerPoolHref);
  const [playerPoolProgress, setPlayerPoolProgress] = useState<PlayerPoolProgress>(
    playerPoolHref
      ? emptyPlayerPoolProgress(initialPlayers.length)
      : {
          visiblePlayers: initialPlayers.length,
          enrichedPlayers: initialPlayers.length,
          totalPlayers: initialPlayers.length,
          priorityPlayers: initialPlayers.length,
          stage: "DETAILS"
        }
  );
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
  const captainStorageKey = `fantasy-squad-captains:${leagueId}:${season}:${activeSquadId ?? "new"}:${activeRoundOffset}`;
  const [horizon, setHorizon] = useState(initialHorizon);
  const activeFplChip: FantasyActiveChip = null;
  const [transferSuggestionForecastSource, setTransferSuggestionForecastSource] = useState<TransferSuggestionForecastSource>("FO");
  const [tableHorizon, setTableHorizon] = useState<3 | 5>(5);
  const [exportColumnKeys, setExportColumnKeys] = useState(initialVisiblePlayerPoolColumns);
  const [playerNameQuery, setPlayerNameQuery] = useState("");
  const deferredPlayerNameQuery = useDeferredValue(playerNameQuery);
  const [teamFilter, setTeamFilter] = useState("ALL");
  const [positionFilter, setPositionFilter] = useState("ALL");
  const [minimumPrice, setMinimumPrice] = useState<number | null>(null);
  const [maximumPrice, setMaximumPrice] = useState<number | null>(null);
  const [detailedFormulaTooltips, setDetailedFormulaTooltips] = useState(false);
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
  const autoPickStrategy: FantasySquadStrategy = "balanced";
  const [message, setMessage] = useState<string | null>(null);
  const [savePending, setSavePending] = useState(false);
  const [sportsImportPending, setSportsImportPending] = useState(false);
  const [fplImportPending, setFplImportPending] = useState(false);
  const [sportsSnapshotStatus, setSportsSnapshotStatus] = useState(sportsRuSquadStatus);
  const [sportsImportNotice, setSportsImportNotice] = useState<SportsImportNotice | null>(null);
  const [tableExportPending, setTableExportPending] = useState(false);
  const interactionPending = savePending || sportsImportPending || fplImportPending;
  const [mobileTab, setMobileTab] = useState<MobileTab>("squad");
  const [widePlannerViewport, setWidePlannerViewport] = useState(false);
  const [poolSecondaryControlsOpen, setPoolSecondaryControlsOpen] = useState(false);
  const [draggedPlayerId, setDraggedPlayerId] = useState<string | null>(null);
  const [replacementMode, setReplacementMode] = useState(false);
  const [replacementSourcePlayerId, setReplacementSourcePlayerId] = useState<string | null>(null);
  const [poolReplacementSourcePlayerId, setPoolReplacementSourcePlayerId] = useState<string | null>(null);
  const [postLoadContentReady, setPostLoadContentReady] = useState(false);
  const [betaAutoPickComplete, setBetaAutoPickComplete] = useState(false);
  const [autoPickPending, setAutoPickPending] = useState(false);
  const autoPickRevisionRef = useRef(0);
  const playerPoolReady = !playerPoolRequestHref || (!playerPoolPending && !playerPoolFailed);
  const playerPoolLoadingMessage = playerPoolProgressMessage(playerPoolProgress);
  const hasRealRoundProjections = useMemo(
    () => rounds.length > 0 && players.some((player) => player.roundPoints.some((value) => Number.isFinite(value) && value !== 0)),
    [players, rounds.length]
  );
  const forecastActionsBlockedByReadiness = plannerReadinessBlocksForecastActions(readiness);
  const plannerForecastReady = !forecastActionsBlockedByReadiness && hasRealRoundProjections;
  const transferSuggestionHorizon = transferSuggestionForecastSource === "FFO" ? 1 : horizon;
  const transferSuggestionsBlockedByReadiness = forecastActionsBlockedByReadiness;
  const hasSelectedTransferSourceForecasts = useMemo(() => {
    if (transferSuggestionForecastSource === "FFO" && activeRoundOffset > 0) return false;
    return players.some((player) => {
      const nextPoints = transferSuggestionForecastNextPoints(player, transferSuggestionForecastSource);
      return nextPoints !== null
        && nextPoints !== 0
        && transferSuggestionForecastHorizonPoints(player, transferSuggestionForecastSource, transferSuggestionHorizon) !== null;
    });
  }, [activeRoundOffset, players, transferSuggestionForecastSource, transferSuggestionHorizon]);
  const transferSuggestionsReady = !transferSuggestionsBlockedByReadiness && hasSelectedTransferSourceForecasts;

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

  useEffect(() => {
    if (!replacementMode && !poolReplacementSourcePlayerId) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setReplacementMode(false);
      setReplacementSourcePlayerId(null);
      setPoolReplacementSourcePlayerId(null);
      setMessage(null);
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [poolReplacementSourcePlayerId, replacementMode]);

  function selectActiveRoundOffset(roundOffset: number) {
    setActiveRoundOffset(roundOffset);
    setReplacementMode(false);
    setReplacementSourcePlayerId(null);
    setPoolReplacementSourcePlayerId(null);
    setDraggedPlayerId(null);
  }

  const selectionsByPlayerId = useMemo(() => new Map(selections.map((selection) => [selection.playerId, selection])), [selections]);
  const playersById = useMemo(() => new Map(players.map((player) => [player.playerId, player])), [players]);
  const poolReplacementSource = poolReplacementSourcePlayerId ? playersById.get(poolReplacementSourcePlayerId) ?? null : null;
  const selectedPlayerIds = useMemo(() => new Set(selections.map((selection) => selection.playerId)), [selections]);
  const captainId = useMemo(() => selections.find((selection) => selection.isCaptain)?.playerId ?? null, [selections]);
  const viceCaptainId = useMemo(() => selections.find((selection) => selection.isViceCaptain)?.playerId ?? null, [selections]);
  const summary = useMemo(() => summarizeFantasySquad(players, selections, rules, horizon), [players, selections, rules, horizon]);
  const savedSummary = useMemo(() => summarizeFantasySquad(players, savedSelections, rules, horizon), [players, savedSelections, rules, horizon]);
  const transferBudget = useMemo(() => fantasyTransferBudget(rules), [rules]);
  const [transferBaselinePlayerIds, setTransferBaselinePlayerIds] = useState<string[]>(
    () => initialSquad.transferBaselinePlayerIds?.length ? initialSquad.transferBaselinePlayerIds : initialSelections.map((selection) => selection.playerId)
  );
  const [openingFreeTransfers, setOpeningFreeTransfers] = useState<number | null>(initialSquad.openingFreeTransfers ?? null);
  const transferBaselineSelections = useMemo(
    () => transferBaselinePlayerIds.map((playerId) => ({ playerId })),
    [transferBaselinePlayerIds]
  );
  const hasFullSquad = summary.selectedPlayers.length === rules.squadSize;
  const squadIsValid =
    hasFullSquad &&
    summary.starterPlayers.length === rules.starterSize &&
    summary.benchPlayers.length === rules.benchSize &&
    summary.violations.length === 0;
  const transferRows = useMemo(
    () => availableTransfersByRound({
      roundPlans,
      baselineSelections: transferBaselineSelections.length === rules.squadSize ? transferBaselineSelections : roundPlans[0]?.selections ?? [],
      budget: transferBudget,
      openingAvailable: openingFreeTransfers
    }),
    [openingFreeTransfers, roundPlans, rules.squadSize, transferBaselineSelections, transferBudget]
  );
  const activeTransferRow = transferRows[activeRoundOffset] ?? { used: 0, available: transferBudget.perRound };
  const transferLimit = activeTransferRow.available;
  const usesUnpricedTransfers = transferBudget.paidPointCost === 0;
  const transferLimitIsActive = (transferBaselineSelections.length === rules.squadSize || (activeRoundOffset > 0 && (roundPlans[activeRoundOffset - 1]?.selections.length ?? 0) === rules.squadSize));
  const plannedTransferCount = transferLimitIsActive ? activeTransferRow.used : 0;
  const availableSuggestionCount = transferLimitIsActive ? Math.max(0, transferLimit - plannedTransferCount) : transferLimit;
  const squadIsDirty = useMemo(() => fantasyRoundPlansFingerprint(roundPlans) !== fantasyRoundPlansFingerprint(savedRoundPlans), [roundPlans, savedRoundPlans]);
  const [suggestionCalculation, setSuggestionCalculation] = useState<TransferSuggestionCalculation | null>(null);
  const [failedSuggestionCalculation, setFailedSuggestionCalculation] = useState<TransferSuggestionCalculation | null>(null);
  const [suggestionRetry, setSuggestionRetry] = useState(0);
  const suggestionsAreCurrent =
    suggestionCalculation?.players === players &&
    suggestionCalculation.selections === selections &&
    suggestionCalculation.rules === rules &&
    suggestionCalculation.horizon === transferSuggestionHorizon &&
    suggestionCalculation.forecastSource === transferSuggestionForecastSource &&
    suggestionCalculation.availableSuggestionCount === availableSuggestionCount;
  const suggestions = suggestionsAreCurrent ? suggestionCalculation.suggestions : [];
  const suggestionsPending = transferSuggestionsReady && !suggestionsAreCurrent;
  const suggestionsFailed =
    failedSuggestionCalculation?.players === players &&
    failedSuggestionCalculation.selections === selections &&
    failedSuggestionCalculation.rules === rules &&
    failedSuggestionCalculation.horizon === transferSuggestionHorizon &&
    failedSuggestionCalculation.forecastSource === transferSuggestionForecastSource &&
    failedSuggestionCalculation.availableSuggestionCount === availableSuggestionCount;
  const displayedSuggestions = suggestions.slice(0, 2);
  const activeRoundBookmakerFavorites = useMemo(() => {
    const roundId = rounds[activeRoundOffset]?.id;
    return roundId ? bookmakerFavorites.filter((row) => row.roundId === roundId) : [];
  }, [activeRoundOffset, bookmakerFavorites, rounds]);
  const teamFilterOptions = useMemo(() => [...new Map(players
    .filter((player) => !player.isProviderPlaceholder && player.teamId)
    .map((player) => [player.teamId!, { id: player.teamId!, name: player.teamName }])).values()]
    .sort((left, right) => left.name.localeCompare(right.name)), [players]);
  const priceFilterOptions = useMemo(() => [...new Set(players.filter((player) => !player.isProviderPlaceholder).map((player) => player.price))].sort((left, right) => left - right), [players]);
  const playerPoolColumns = useMemo(() => playerPoolOptionalColumns(players, tableHorizon, language, provider), [language, players, provider, tableHorizon]);
  const advancedFilterColumns = useMemo(() => playerPoolColumns.map(({ key, label, title, numeric }) => ({ key, label, title, numeric })), [playerPoolColumns]);
  const deferredAdvancedTableFilters = useDeferredValue(advancedTableFilters);
  const activeAdvancedFilterColumns = useMemo(() => advancedFilterColumns.filter((column) =>
    squadTableValueFilterIsActive(deferredAdvancedTableFilters[column.key] ?? emptySquadTableValueFilter, column.numeric)
  ), [advancedFilterColumns, deferredAdvancedTableFilters]);
  const activeAdvancedFilterCount = activeAdvancedFilterColumns.length;
  const fantasyAddEvaluator = useMemo(() => createFantasyAddEvaluator(players, selections, rules), [players, rules, selections]);
  const poolReplacementEvaluator = useMemo(
    () => createFantasyAddEvaluator(
      players,
      poolReplacementSourcePlayerId
        ? selections.filter((selection) => selection.playerId !== poolReplacementSourcePlayerId)
        : selections,
      rules
    ),
    [players, poolReplacementSourcePlayerId, rules, selections]
  );
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
      .filter((player) => !player.isProviderPlaceholder)
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
  const filteredPlayers = useMemo(
    () => filterPlayerPoolByNameQuery(matchingPlayers, deferredPlayerNameQuery),
    [deferredPlayerNameQuery, matchingPlayers]
  );
  const displayedPoolPlayers = useMemo(() => poolReplacementSource
    ? filteredPlayers.filter((player) => (
        player.playerId !== poolReplacementSource.playerId
        && !selectionsByPlayerId.has(player.playerId)
        && player.positionGroup === poolReplacementSource.positionGroup
      ))
    : filteredPlayers,
  [filteredPlayers, poolReplacementSource, selectionsByPlayerId]);

  useEffect(() => {
    void recordBetaMilestone("PLANNER_OPENED");
  }, []);

  useEffect(() => {
    const media = window.matchMedia("(min-width: 1280px)");
    const update = () => setWidePlannerViewport(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
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
    function stopOldLeagueDownloads(event: Event) {
      const targetLeagueId = fantasySquadLeagueNavigationTarget(event);
      if (!targetLeagueId || targetLeagueId === leagueId) return;
      foregroundPlayerPoolCancelRef.current?.();
      backgroundPlayerPoolCancelRef.current?.();
      if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    }

    window.addEventListener(fantasySquadLeagueNavigationEvent, stopOldLeagueDownloads);
    return () => window.removeEventListener(fantasySquadLeagueNavigationEvent, stopOldLeagueDownloads);
  }, [leagueId]);

  useEffect(() => {
    if (leagueNavigationPending || !postLoadContentReady || !playerPoolRequestHref) return;

    playerPoolInitialLoadCompleteRef.current = false;
    activePlayerPoolSnapshotIdRef.current = playerPoolSnapshotIdFromHref(playerPoolRequestHref);
    let lifecycleCancelled = false;
    let requestCompleted = false;
    let retryAfterBfcacheRestore = false;
    const controller = new AbortController();
    const cancelPlayerPoolLoad = () => {
      lifecycleCancelled = true;
      if (!requestCompleted) controller.abort();
    };
    foregroundPlayerPoolCancelRef.current = cancelPlayerPoolLoad;
    const handlePageHide = (event: PageTransitionEvent) => {
      retryAfterBfcacheRestore = event.persisted && !requestCompleted;
      cancelPlayerPoolLoad();
    };
    const handlePageShow = (event: PageTransitionEvent) => {
      if (!event.persisted || !retryAfterBfcacheRestore) return;
      retryAfterBfcacheRestore = false;
      setPlayerPoolFailed(false);
      setPlayerPoolPending(true);
      setPlayerPoolProgress(emptyPlayerPoolProgress(sourcePlayersRef.current.length));
      setPlayerPoolRetry((value) => value + 1);
    };
    window.addEventListener("pagehide", handlePageHide);
    window.addEventListener("pageshow", handlePageShow);

    async function loadPlayerPool() {
      let cursor: string | null = null;
      let pinnedSnapshotId = playerPoolSnapshotIdFromHref(playerPoolRequestHref);
      let stage: PlayerPoolPageInfo["stage"] | null = pinnedSnapshotId ? "DETAILS" : null;
      let expiredSnapshotRetries = 0;
      let accumulatedBasePlayers: FantasyPlannerPlayer[] = [];
      let accumulatedDetailPlayers: FantasyPlannerPlayer[] = [];
      const seenPages = new Set<string>();

      while (!lifecycleCancelled) {
        const batchUrl = new URL(playerPoolRequestHref!, window.location.origin);
        if (cursor !== null) batchUrl.searchParams.set("cursor", cursor);
        else batchUrl.searchParams.delete("cursor");
        if (stage) batchUrl.searchParams.set("stage", stage);
        else batchUrl.searchParams.delete("stage");
        if (pinnedSnapshotId) batchUrl.searchParams.set("snapshotId", pinnedSnapshotId);
        else batchUrl.searchParams.delete("snapshotId");
        if (stage === "DETAILS" && (cursor === null || cursor === "0") && (
          !fixtureCalendarRef.current || fixtureCalendarSnapshotIdRef.current !== pinnedSnapshotId
        )) batchUrl.searchParams.set("fixtureCalendar", "1");
        else batchUrl.searchParams.delete("fixtureCalendar");
        const requestedPage = `${pinnedSnapshotId ?? "live"}:${stage ?? "BASE"}:${cursor ?? "0"}`;
        if (seenPages.has(requestedPage)) throw new Error("PLAYER_POOL_CURSOR_DID_NOT_ADVANCE");
        seenPages.add(requestedPage);
        const response = await fetch(batchUrl, {
          cache: "no-store",
          headers: { Accept: "application/json" },
          signal: controller.signal
        });
        const payload = await response.json().catch(() => ({})) as {
          players?: FantasyPlannerPlayer[];
          pageInfo?: unknown;
          error?: { code?: string };
          fixtureCalendar?: unknown;
        };
        if (response.status === 409 && payload.error?.code === "SNAPSHOT_EXPIRED" && expiredSnapshotRetries < 2) {
          expiredSnapshotRetries += 1;
          pinnedSnapshotId = null;
          cursor = "0";
          stage = "DETAILS";
          accumulatedDetailPlayers = [];
          seenPages.clear();
          // Keep the visible roster and unsaved selections while restarting
          // enrichment from the newest retained revision.
          await yieldToPlayerPoolUi();
          continue;
        }
        if (!response.ok || !Array.isArray(payload.players)) throw new Error("PLAYER_POOL_LOAD_FAILED");
        const batchPlayers = payload.players;
        const progressive = batchUrl.searchParams.get("progressive") === "1";
        const pageInfo = parsePlayerPoolPageInfo(payload.pageInfo);
        if (progressive && !pageInfo) throw new Error("PLAYER_POOL_PAGE_INFO_INVALID");
        const effectivePageInfo = pageInfo ?? {
          nextCursor: null,
          nextStage: null,
          visiblePlayers: batchPlayers.length,
          enrichedPlayers: batchPlayers.length,
          totalPlayers: batchPlayers.length,
          complete: true,
          batchSize: Math.max(1, batchPlayers.length),
          priorityPlayers: batchPlayers.length,
          strategy: "ACTIVE_SQUADS_THEN_POPULARITY" as const,
          stage: "DETAILS" as const,
          snapshotId: null
        };
        if (effectivePageInfo.snapshotId) {
          if (pinnedSnapshotId && pinnedSnapshotId !== effectivePageInfo.snapshotId) {
            throw new Error("PLAYER_POOL_SNAPSHOT_CHANGED_DURING_LOAD");
          }
          pinnedSnapshotId = effectivePageInfo.snapshotId;
        }
        if (effectivePageInfo.stage === "BASE") {
          accumulatedBasePlayers = mergeFantasyPlayerPools(accumulatedBasePlayers, batchPlayers);
        } else {
          accumulatedDetailPlayers = mergeFantasyPlayerPools(accumulatedDetailPlayers, batchPlayers);
        }
        if (lifecycleCancelled) return;

        const basePlayersForRender = accumulatedBasePlayers;
        const detailPlayersForRender = accumulatedDetailPlayers;
        const batchCalendar = parseFantasyFixtureCalendar(payload.fixtureCalendar);
        startPlayerPoolTransition(() => {
          if (batchCalendar) {
            fixtureCalendarRef.current = batchCalendar;
            fixtureCalendarSnapshotIdRef.current = pinnedSnapshotId;
            setFixtureCalendar(batchCalendar);
          }
          setSourcePlayers((current) => {
            let merged: FantasyPlannerPlayer[];
            if (effectivePageInfo.complete) {
              const canonical = mergeFantasyPlayerPools(basePlayersForRender, detailPlayersForRender);
              const canonicalIds = new Set(canonical.map((player) => player.playerId));
              merged = mergeFantasyPlayerPools(
                canonical,
                current.filter((player) => player.isProviderPlaceholder && !canonicalIds.has(player.playerId))
              );
            } else if (effectivePageInfo.stage === "BASE") {
              // The SSR/current-squad copy wins over lightweight base rows while
              // the accumulated base order still controls the visual list.
              merged = mergeFantasyPlayerPools(basePlayersForRender, current);
            } else {
              merged = mergeFantasyPlayerPools(current, batchPlayers);
            }
            sourcePlayersRef.current = merged;
            return merged;
          });
          setPlayerPoolAvailable(true);
          setPlayerPoolProgress({
            visiblePlayers: Math.max(basePlayersForRender.length, detailPlayersForRender.length),
            enrichedPlayers: effectivePageInfo.enrichedPlayers,
            totalPlayers: effectivePageInfo.totalPlayers,
            priorityPlayers: effectivePageInfo.priorityPlayers,
            stage: effectivePageInfo.stage
          });

          if (effectivePageInfo.complete) {
            setPlayerPoolFailed(false);
            setPlayerPoolPending(false);
            setHistoryApplying(false);
          }
        });

        if (effectivePageInfo.complete) {
          requestCompleted = true;
          activePlayerPoolSnapshotIdRef.current = pinnedSnapshotId;
          playerPoolInitialLoadCompleteRef.current = true;
          return;
        }

        const nextCursor = effectivePageInfo.nextCursor;
        const nextStage = effectivePageInfo.nextStage;
        if (nextCursor === null || nextStage === null) {
          throw new Error("PLAYER_POOL_CURSOR_DID_NOT_ADVANCE");
        }
        cursor = nextCursor;
        stage = nextStage;
        await yieldToPlayerPoolUi();
      }
    }

    void loadPlayerPool().catch((error: unknown) => {
        if (lifecycleCancelled || controller.signal.aborted || (error instanceof Error && error.name === "AbortError")) return;
        requestCompleted = true;
        playerPoolInitialLoadCompleteRef.current = false;
        console.error("Failed to load fantasy player pool.", error);
        void recordBetaClientError("PLAYER_POOL_LOAD_FAILED");
        setPlayerPoolFailed(true);
        setPlayerPoolPending(false);
        setHistoryApplying(false);
      });

    return () => {
      window.removeEventListener("pagehide", handlePageHide);
      window.removeEventListener("pageshow", handlePageShow);
      cancelPlayerPoolLoad();
      if (foregroundPlayerPoolCancelRef.current === cancelPlayerPoolLoad) {
        foregroundPlayerPoolCancelRef.current = null;
      }
    };
  }, [leagueNavigationPending, playerPoolRequestHref, playerPoolRetry, postLoadContentReady]);

  useEffect(() => {
    if (
      leagueNavigationPending ||
      provider !== "SPORTS_RU" ||
      !postLoadContentReady ||
      !playerPoolRequestHref ||
      fantasyHistorySettingsKey(appliedHistorySettings) !== fantasyHistorySettingsKey(defaultFantasyHistorySettings)
    ) return;
    const statusHref = playerPoolSnapshotStatusHref(playerPoolRequestHref);
    if (!statusHref) return;

    let cancelled = false;
    const controller = new AbortController();
    const cancelBackgroundPlayerPoolLoad = () => {
      cancelled = true;
      controller.abort();
    };
    backgroundPlayerPoolCancelRef.current = cancelBackgroundPlayerPoolLoad;

    async function refreshSnapshot(targetSnapshotId: string) {
      playerPoolBackgroundRefreshRunningRef.current = true;
      try {
        let cursor = "0";
        let refreshedPlayers: FantasyPlannerPlayer[] = [];
        let refreshedCalendar: FixtureCalendarData | null = null;
        const seenCursors = new Set<string>();
        while (!cancelled) {
          if (seenCursors.has(cursor)) throw new Error("PLAYER_POOL_BACKGROUND_CURSOR_DID_NOT_ADVANCE");
          seenCursors.add(cursor);
          const batchUrl = new URL(playerPoolRequestHref!, window.location.origin);
          batchUrl.searchParams.set("stage", "DETAILS");
          batchUrl.searchParams.set("cursor", cursor);
          batchUrl.searchParams.set("snapshotId", targetSnapshotId);
          if (cursor === "0") batchUrl.searchParams.set("fixtureCalendar", "1");
          else batchUrl.searchParams.delete("fixtureCalendar");
          const response = await fetch(batchUrl, {
            cache: "no-store",
            headers: { Accept: "application/json" },
            signal: controller.signal
          });
          if (!response.ok) return;
          const payload = await response.json().catch(() => ({})) as {
            players?: FantasyPlannerPlayer[];
            pageInfo?: unknown;
            fixtureCalendar?: unknown;
          };
          const pageInfo = parsePlayerPoolPageInfo(payload.pageInfo);
          if (
            !Array.isArray(payload.players) ||
            !pageInfo ||
            pageInfo.stage !== "DETAILS" ||
            pageInfo.snapshotId !== targetSnapshotId
          ) return;
          if (cursor === "0") refreshedCalendar = parseFantasyFixtureCalendar(payload.fixtureCalendar);
          refreshedPlayers = mergeFantasyPlayerPools(refreshedPlayers, payload.players);
          if (pageInfo.complete) break;
          if (pageInfo.nextStage !== "DETAILS" || pageInfo.nextCursor === null) return;
          cursor = pageInfo.nextCursor;
          await yieldToPlayerPoolUi();
        }
        if (cancelled || refreshedPlayers.length === 0) return;
        startPlayerPoolTransition(() => {
          setSourcePlayers((current) => {
            const merged = mergeFantasyPlayerPools(current, refreshedPlayers);
            sourcePlayersRef.current = merged;
            return merged;
          });
          if (refreshedCalendar) {
            fixtureCalendarRef.current = refreshedCalendar;
            fixtureCalendarSnapshotIdRef.current = targetSnapshotId;
            setFixtureCalendar(refreshedCalendar);
          }
        });
        activePlayerPoolSnapshotIdRef.current = targetSnapshotId;
      } finally {
        playerPoolBackgroundRefreshRunningRef.current = false;
      }
    }

    async function checkForSnapshotUpdate() {
      if (
        cancelled ||
        document.visibilityState !== "visible" ||
        !playerPoolInitialLoadCompleteRef.current ||
        playerPoolBackgroundRefreshRunningRef.current ||
        !activePlayerPoolSnapshotIdRef.current
      ) return;
      try {
        const response = await fetch(statusHref!, {
          cache: "no-store",
          headers: { Accept: "application/json" },
          signal: controller.signal
        });
        if (!response.ok) return;
        const payload = await response.json().catch(() => ({})) as { snapshot?: { id?: unknown } | null };
        const snapshotId = typeof payload.snapshot?.id === "string" ? payload.snapshot.id : null;
        if (
          !snapshotId ||
          snapshotId === activePlayerPoolSnapshotIdRef.current ||
          playerPoolBackgroundRefreshRunningRef.current
        ) return;
        await refreshSnapshot(snapshotId);
      } catch (error) {
        if (cancelled || controller.signal.aborted || (error instanceof Error && error.name === "AbortError")) return;
        console.error("Failed to refresh the fantasy player pool snapshot in background.", error);
      }
    }

    const interval = window.setInterval(() => void checkForSnapshotUpdate(), 15_000);
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") void checkForSnapshotUpdate();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      cancelBackgroundPlayerPoolLoad();
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      playerPoolBackgroundRefreshRunningRef.current = false;
      if (backgroundPlayerPoolCancelRef.current === cancelBackgroundPlayerPoolLoad) {
        backgroundPlayerPoolCancelRef.current = null;
      }
    };
  }, [appliedHistorySettings, leagueNavigationPending, playerPoolRequestHref, postLoadContentReady, provider]);

  function applyQuickHistoryScope(scope: FantasyHistoryScope) {
    if (scope === appliedHistorySettings.scope) return;
    requestHistorySettings({ ...appliedHistorySettings, scope });
  }

  function requestHistorySettings(nextSettings: FantasyHistorySettings) {
    if (!playerPoolHref) return;
    setAppliedHistorySettings(nextSettings);
    setHistoryApplying(true);
    setPlayerPoolFailed(false);
    setPlayerPoolPending(true);
    setPlayerPoolProgress(emptyPlayerPoolProgress(sourcePlayersRef.current.length));

    const pageUrl = new URL(window.location.href);
    applyFantasyHistorySearchParams(pageUrl.searchParams, nextSettings);
    window.history.replaceState(window.history.state, "", `${pageUrl.pathname}?${pageUrl.searchParams.toString()}`);

    const poolUrl = new URL(playerPoolHref, window.location.origin);
    applyFantasyHistorySearchParams(poolUrl.searchParams, nextSettings);
    poolUrl.searchParams.delete("snapshotId");
    activePlayerPoolSnapshotIdRef.current = null;
    playerPoolInitialLoadCompleteRef.current = false;
    setPlayerPoolRequestHref(`${poolUrl.pathname}?${poolUrl.searchParams.toString()}`);
  }

  function currentFilterPresetValue(): SquadFilterPresetFilters {
    return {
      version: 1,
      query: playerNameQuery,
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
    setPlayerNameQuery(filters.query);
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
    if (!postLoadContentReady || !playerPoolReady || !transferSuggestionsReady) return;

    let cancelled = false;
    const task = buildTransferSuggestionsOffThread({
      pool: players,
      selections,
      rules,
      horizon: transferSuggestionHorizon,
      forecastSource: transferSuggestionForecastSource,
      transferCount: availableSuggestionCount,
      maximumPlans: 2,
      freeTransfers: availableSuggestionCount,
      paidTransferPointCost: transferBudget.paidPointCost
    });
    void task.promise
      .then((nextSuggestions) => {
        if (cancelled) return;
        setFailedSuggestionCalculation(null);
        setSuggestionCalculation({ players, selections, rules, horizon: transferSuggestionHorizon, forecastSource: transferSuggestionForecastSource, availableSuggestionCount, suggestions: nextSuggestions });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        console.error("Failed to calculate fantasy transfer suggestions.", error);
        setSuggestionCalculation({ players, selections, rules, horizon: transferSuggestionHorizon, forecastSource: transferSuggestionForecastSource, availableSuggestionCount, suggestions: [] });
        setFailedSuggestionCalculation({ players, selections, rules, horizon: transferSuggestionHorizon, forecastSource: transferSuggestionForecastSource, availableSuggestionCount, suggestions: [] });
      });

    return () => {
      cancelled = true;
      task.cancel();
    };
  }, [availableSuggestionCount, players, selections, rules, playerPoolReady, postLoadContentReady, suggestionRetry, transferBudget.paidPointCost, transferSuggestionForecastSource, transferSuggestionHorizon, transferSuggestionsReady]);

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
    const previous = activeRoundOffset === 0
      ? (transferBaselineSelections.length === rules.squadSize ? transferBaselineSelections : [])
      : roundPlans[activeRoundOffset - 1]?.selections ?? [];
    if (previous.length !== rules.squadSize) return null;
    if (countFantasySquadTransfers(previous, nextSelections) <= transferLimit) return null;

    return localizedText(
      language,
      `Transfer limit reached: ${transferLimit} available this round.`,
      `Лимит замен на этот тур: ${transferLimit}.`
    );
  }

  function rollbackToLastSavedSquad() {
    if (interactionPending || autoPickPending || !squadIsDirty) return;
    setRoundPlans(cloneFantasyRoundPlans(savedRoundPlans));
    setReplacementMode(false);
    setReplacementSourcePlayerId(null);
    setPoolReplacementSourcePlayerId(null);
    setDraggedPlayerId(null);
    setMessage(localizedText(language, "Squad restored to the last save on this page.", "Состав откатан к последнему сохранению здесь."));
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

  function playerPoolActionBlockReason(player: FantasyPlannerPlayer) {
    if (!poolReplacementSource) return fantasyAddEvaluator.reason(player);
    if (player.positionGroup !== poolReplacementSource.positionGroup) return "Same position required";
    return poolReplacementEvaluator.reason(player);
  }

  function startPoolReplacement(playerId: string) {
    const player = playersById.get(playerId);
    if (!player) return;

    setReplacementMode(false);
    setReplacementSourcePlayerId(null);
    setPoolReplacementSourcePlayerId(playerId);
    setPlayerNameQuery("");
    setTeamFilter("ALL");
    setPositionFilter(player.positionGroup);
    setMinimumPrice(null);
    setMaximumPrice(null);
    setAdvancedTableFilters({});
    setOnlyAffordable(false);
    setFitCalculation(null);
    setMobileTab("pool");
    setMessage(localizedText(
      language,
      `Choose a replacement for ${player.name}. The change is applied in one step.`,
      `Выберите замену для ${player.name}. Изменение применится одним действием.`
    ));
    window.requestAnimationFrame(() => playerPoolSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }

  function cancelPoolReplacement() {
    setPoolReplacementSourcePlayerId(null);
    setMessage(null);
  }

  function replacePlayerFromPool(player: FantasyPlannerPlayer) {
    if (!poolReplacementSource) {
      addPlayer(player);
      return;
    }

    const blockReason = playerPoolActionBlockReason(player);
    if (blockReason) {
      setMessage(localizeAddBlockReason(blockReason, language));
      return;
    }

    const result = replaceSquadSelectionPlayer(selections, poolReplacementSource.playerId, player);
    if (!result.ok) {
      setMessage(localizedText(language, "This player cannot be used for the replacement.", "Этого игрока нельзя использовать для замены."));
      return;
    }

    const nextSelections = sanitizeCaptainRoles(result.selections);
    const limitReason = transferLimitBlockReason(nextSelections);
    if (limitReason) {
      setMessage(limitReason);
      return;
    }
    if (summarizeFantasySquad(players, nextSelections, rules, horizon).violations.length > 0) {
      setMessage(localizedText(language, "This replacement breaks the squad rules.", "Эта замена нарушает правила состава."));
      return;
    }

    const outgoingName = poolReplacementSource.name;
    setSelections(nextSelections);
    setPoolReplacementSourcePlayerId(null);
    setMobileTab("squad");
    setMessage(localizedText(
      language,
      `${outgoingName} was replaced by ${player.name}. Review the squad and save it.`,
      `${outgoingName} заменён на ${player.name}. Проверьте состав и сохраните его.`
    ));
    window.requestAnimationFrame(() => squadSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
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

  function swapPlayers(sourcePlayerId: string, targetPlayerId: string) {
    const result = swapSquadSelectionCards(selections, players, sourcePlayerId, targetPlayerId);
    setDraggedPlayerId(null);
    if (!result.ok) {
      setMessage(result.reason === "GOALKEEPER_MISMATCH"
        ? localizedText(language, "A goalkeeper can only swap with another goalkeeper.", "Вратаря можно менять местами только с другим вратарём.")
        : localizedText(language, "Could not find both players in the squad.", "Не удалось найти обоих игроков в составе."));
      return false;
    }

    const nextSelections = sanitizeCaptainRoles(result.selections);
    if (summarizeFantasySquad(players, nextSelections, rules, horizon).violations.length > 0) {
      setMessage(localizedText(
        language,
        "This swap would break the starting XI formation rules.",
        "Такая перестановка нарушит правила расстановки стартового состава."
      ));
      return false;
    }

    setSelections(nextSelections);
    setMessage(null);
    return true;
  }

  function handleDropOnPlayer(sourcePlayerId: string, targetPlayerId: string) {
    swapPlayers(sourcePlayerId, targetPlayerId);
  }

  function toggleReplacementMode() {
    setPoolReplacementSourcePlayerId(null);
    setReplacementMode((current) => !current);
    setReplacementSourcePlayerId(null);
    setDraggedPlayerId(null);
    setMessage(replacementMode
      ? null
      : localizedText(
          language,
          "Select a player in the starting XI or on the bench, then select a player in the other group.",
          "Выберите игрока основы или запаса, затем игрока из другой части состава."
        ));
  }

  function handleReplacementPlayerClick(playerId: string) {
    const clickedSelection = selectionsByPlayerId.get(playerId);
    if (!replacementMode || !clickedSelection) return;

    if (!replacementSourcePlayerId) {
      setReplacementSourcePlayerId(playerId);
      setMessage(clickedSelection.isStarter
        ? localizedText(language, "Now select a bench player.", "Теперь выберите игрока запаса.")
        : localizedText(language, "Now select a starting XI player.", "Теперь выберите игрока основы."));
      return;
    }

    if (replacementSourcePlayerId === playerId) {
      setReplacementSourcePlayerId(null);
      setMessage(localizedText(
        language,
        "Selection cleared. Choose the first player again.",
        "Выбор снят. Выберите первого игрока заново."
      ));
      return;
    }

    const sourceSelection = selectionsByPlayerId.get(replacementSourcePlayerId);
    if (!sourceSelection) {
      setReplacementSourcePlayerId(playerId);
      return;
    }
    if (sourceSelection.isStarter === clickedSelection.isStarter) {
      setMessage(sourceSelection.isStarter
        ? localizedText(language, "The second player must be on the bench.", "Второй игрок должен быть в запасе.")
        : localizedText(language, "The second player must be in the starting XI.", "Второй игрок должен быть в основе."));
      return;
    }

    if (swapPlayers(replacementSourcePlayerId, playerId)) {
      setReplacementMode(false);
      setReplacementSourcePlayerId(null);
    }
  }

  function startLineupReplacement(playerId: string) {
    const selection = selectionsByPlayerId.get(playerId);
    if (!selection) return;
    setPoolReplacementSourcePlayerId(null);
    setReplacementMode(true);
    setReplacementSourcePlayerId(playerId);
    setDraggedPlayerId(null);
    setMessage(selection.isStarter
      ? localizedText(language, "Choose a bench player below.", "Выберите игрока запаса ниже.")
      : localizedText(language, "Choose a starting XI player below.", "Выберите игрока основы ниже."));
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
    if (!transferSuggestionsReady) return;
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

    const nextSummary = summarizeFantasySquad(players, nextSelections, rules, horizon);
    if (nextSummary.spent > rules.budgetLimit) {
      setMessage(localizedText(
        language,
        `This recommendation would exceed the budget: ${formatNumber(nextSummary.spent, 1)} / ${formatNumber(rules.budgetLimit, 1)}.`,
        `Эта рекомендация превышает бюджет: ${formatNumber(nextSummary.spent, 1)} / ${formatNumber(rules.budgetLimit, 1)}.`
      ));
      return;
    }
    if (nextSummary.violations.length > 0) {
      setMessage(localizedText(
        language,
        "This recommendation no longer fits the current squad rules. Recalculate the suggestions.",
        "Эта рекомендация больше не соответствует текущим правилам состава. Пересчитайте подсказки."
      ));
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

  async function saveSquad() {
    if (savePending) return;
    setSavePending(true);
    try {
      setMessage(null);
      const selectionsToSave = sanitizeCaptainRoles(selections);
      const roundPlansToSave = cloneFantasyRoundPlans(roundPlans);
      roundPlansToSave[activeRoundOffset].selections = selectionsToSave;
      let response: Response;
      try {
        response = await fetch(squadApiPath, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            leagueId,
            season,
            squadId: activeSquadId,
            horizonRounds: horizon,
            historyScope: appliedHistorySettings.scope,
            historyWindow: appliedHistorySettings.window,
            historySeasons: appliedHistorySettings.selectedSeasons,
            provider,
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
      if (!savedSquadId) {
        void recordBetaClientError("SQUAD_SAVE_FAILED");
        setMessage(localizedText(language, "The server did not return the saved squad ID.", "Сервер не вернул ID сохранённого состава."));
        return;
      }
      setRoundPlans(roundPlansToSave);
      setSavedRoundPlans(cloneFantasyRoundPlans(roundPlansToSave));
      setActiveSquadId(savedSquadId);
      const savedPlayers = payload.squad?.savedPlayers ?? selectionsToSave.length;
      setMessage(localizedText(language, `Saved ${savedPlayers} players.`, `Сохранено игроков: ${savedPlayers}.`));
      void recordBetaMilestone("SQUAD_SAVED");
      window.dispatchEvent(new CustomEvent("machete:squad-saved"));
      router.replace(squadVariantHref(squadRoutePath, leagueId, season, savedSquadId, appliedHistorySettings));
    } finally {
      setSavePending(false);
    }
  }

  async function importStoredSportsRuSquad() {
    if (interactionPending || autoPickPending) return;
    setSportsImportPending(true);
    setSportsImportNotice({
      tone: "progress",
      text: localizedText(
        language,
        "Requesting the published Sports.ru squad and matching its players…",
        "Запрашиваем опубликованный состав Sports.ru и сопоставляем игроков…"
      )
    });
    setMessage(null);
    try {
      const response = await fetch("/api/machete/squads/import-sports-ru", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          leagueId,
          season,
          squadId: activeSquadId
        })
      });
      const payload = await response.json().catch(() => ({})) as {
        error?: { code?: string; message?: string };
        code?: string;
        message?: string;
        pending?: boolean;
        snapshot?: SportsRuSquadSnapshotStatus | null;
        squad?: {
          id?: string;
          name?: string;
          savedPlayers?: number;
          horizonRounds?: number;
          selections?: FantasySquadSelection[];
          roundPlans?: FantasySquadRoundPlan[];
          importedPlayers?: FantasyPlannerPlayer[];
          placeholderPlayers?: FantasyPlannerPlayer[];
        };
      };
      if (payload.snapshot) setSportsSnapshotStatus(payload.snapshot);
      if (response.status === 202 && payload.pending) {
        setSportsImportNotice({
          tone: "waiting",
          text: localizedSportsRuPendingStatus(language, payload.snapshot ?? null)
        });
        return;
      }
      if (!response.ok) {
        const code = payload.error?.code ?? payload.code ?? "SPORTS_IMPORT_FAILED";
        const fallback = payload.error?.message ?? payload.message ?? null;
        setSportsImportNotice({
          tone: "error",
          text: localizedSportsRuImportError(language, code, fallback)
        });
        return;
      }
      const savedSquadId = payload.squad?.id;
      const importedResponsePlayers = Array.isArray(payload.squad?.importedPlayers)
        ? payload.squad.importedPlayers
        : Array.isArray(payload.squad?.placeholderPlayers)
          ? payload.squad.placeholderPlayers
          : [];
      const importedPlayerPool = mergeFantasyPlayerPools(sourcePlayersRef.current, importedResponsePlayers);
      const importedSelections = Array.isArray(payload.squad?.selections)
        ? normalizeInitialSelections(payload.squad.selections, importedPlayerPool, rules)
        : [];
      const importedRoundPlans = Array.isArray(payload.squad?.roundPlans)
        ? normalizePlannerRoundPlans(payload.squad.roundPlans, importedSelections, importedPlayerPool, rules)
        : [];
      if (
        !savedSquadId
        || importedSelections.length !== rules.squadSize
        || importedRoundPlans.length !== 5
        || importedRoundPlans[0]?.selections.length !== rules.squadSize
      ) {
        setSportsImportNotice({
          tone: "error",
          text: localizedText(language, "The server returned an incomplete imported squad.", "Сервер вернул неполный импортированный состав.")
        });
        return;
      }
      const savedPlayers = payload.squad?.savedPlayers ?? importedSelections.length;
      const placeholderPlayersCount = payload.squad?.placeholderPlayers?.length ?? 0;
      const importedHorizon = normalizeFantasyHorizon(payload.squad?.horizonRounds ?? horizon, rules.horizonOptions);
      setActiveRoundOffset(0);
      sourcePlayersRef.current = importedPlayerPool;
      setSourcePlayers(importedPlayerPool);
      setRoundPlans(importedRoundPlans);
      setSavedRoundPlans(cloneFantasyRoundPlans(importedRoundPlans));
      setTransferBaselinePlayerIds(importedSelections.map((selection) => selection.playerId));
      setActiveSquadId(savedSquadId);
      setHorizon(importedHorizon);
      setReplacementMode(false);
      setReplacementSourcePlayerId(null);
      setDraggedPlayerId(null);
      setSportsImportNotice({
        tone: "success",
        text: localizedText(
          language,
          `Sports.ru squad loaded and saved: ${savedPlayers} players${placeholderPlayersCount ? `, ${placeholderPlayersCount} provider placeholders` : ""}.`,
          `Состав Sports.ru загружен и сохранён: ${savedPlayers} игроков${placeholderPlayersCount ? `, пустышек для игроков не из базы: ${placeholderPlayersCount}` : ""}.`
        )
      });
      void recordBetaMilestone("SQUAD_SAVED");
      window.dispatchEvent(new CustomEvent("machete:squad-saved"));
      window.history.replaceState(
        window.history.state,
        "",
        squadVariantHref(squadRoutePath, leagueId, season, savedSquadId, appliedHistorySettings)
      );
    } catch {
      setSportsImportNotice({
        tone: "error",
        text: localizedText(language, "Could not request the Sports.ru squad.", "Не удалось запросить состав Sports.ru.")
      });
    } finally {
      setSportsImportPending(false);
    }
  }

  async function importFplSquad() {
    if (interactionPending || autoPickPending || provider !== "FPL") return;
    setMessage(null);
    setFplImportPending(true);
    try {
      const response = await fetch("/api/machete/squads/import-fpl", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leagueId, season, squadId: activeSquadId, horizonRounds: horizon })
      });
      const payload = await response.json().catch(() => ({})) as {
        result?: {
          squadId?: string;
          selections?: FantasySquadSelection[];
          roundPlans?: FantasySquadRoundPlan[];
          gameweek?: number;
          bankedFreeTransfers?: number;
        };
        message?: string;
      };
      if (!response.ok || !payload.result?.squadId || !Array.isArray(payload.result.selections) || !Array.isArray(payload.result.roundPlans)) {
        setMessage(payload.message ?? "FPL published squad is unavailable or could not be mapped; the current squad was not changed.");
        return;
      }
      const importedSelections = normalizeInitialSelections(payload.result.selections, sourcePlayers, rules);
      const importedPlans = normalizePlannerRoundPlans(payload.result.roundPlans, importedSelections, sourcePlayers, rules);
      setActiveRoundOffset(0);
      setRoundPlans(importedPlans);
      setSavedRoundPlans(cloneFantasyRoundPlans(importedPlans));
      setTransferBaselinePlayerIds(importedSelections.map((selection) => selection.playerId));
      if (typeof payload.result.bankedFreeTransfers === "number") setOpeningFreeTransfers(payload.result.bankedFreeTransfers);
      setActiveSquadId(payload.result.squadId);
      setMessage(`FPL GW${payload.result.gameweek ?? ""} published squad imported: ${importedSelections.length} players.`);
    } finally {
      setFplImportPending(false);
    }
  }

  const mobileTabs: SegmentedOption<MobileTab>[] = [
    { value: "squad", label: <span className="inline-flex items-center gap-1"><Users className="h-3.5 w-3.5" /><I18nText en="Squad" ru="Состав" /></span> },
    { value: "pool", label: <span className="inline-flex items-center gap-1"><Layers3 className="h-3.5 w-3.5" /><I18nText en="Pool" ru="Пул" /></span> },
    { value: "suggestions", label: <span className="inline-flex items-center gap-1"><ListChecks className="h-3.5 w-3.5" /><I18nText en="Tips" ru="Советы" /></span> }
  ];
  const transferSuggestionForecastSourceOptions: SegmentedOption<TransferSuggestionForecastSource>[] = [
    { value: "FO", label: "FO", ariaLabel: localizedText(language, "FO transfer forecasts", "Трансферные прогнозы FO") },
    { value: "ALT", label: "ALT", ariaLabel: localizedText(language, "ALT transfer forecasts", "Трансферные прогнозы ALT") },
    { value: "FFO", label: "FFO", ariaLabel: localizedText(language, "Foontasy transfer forecasts", "Трансферные прогнозы Foontasy") }
  ];
  const nextRoundFoontasy = startingXiFoontasyPoints(summary.starterPlayers, captainId);
  const nextRoundFoontasyTotal = provider === "FPL" || summary.starterPlayers.length !== rules.starterSize ? null : nextRoundFoontasy.total;
  const previewNextRound = provider === "FPL"
    ? fantasyRoundPointsWithActiveChip(summary.starterPlayers, summary.benchPlayers, 0, captainId, activeFplChip)
    : summary.projectedNext;
  const previewHorizon = provider === "FPL"
    ? Array.from({ length: Math.max(0, Math.floor(horizon)) }, (_, roundIndex) => fantasyRoundPointsWithActiveChip(summary.starterPlayers, summary.benchPlayers, roundIndex, captainId, activeFplChip)).reduce((total, value) => total + value, 0)
    : summary.projectedHorizon;
  const nextRoundAlternative = startingXiAlternativeRoundPoints(summary.starterPlayers, 0, captainId);
  const horizonAlternative = startingXiAlternativeHorizonPoints(summary.starterPlayers, horizon, captainId);
  const previewNextRoundAlternative = provider === "FPL"
    ? fantasyAlternativeRoundPointsWithActiveChip(summary.starterPlayers, summary.benchPlayers, 0, captainId, activeFplChip)
    : nextRoundAlternative;
  const previewHorizonAlternative = provider === "FPL"
    ? Array.from({ length: Math.max(0, Math.floor(horizon)) }, (_, roundIndex) => fantasyAlternativeRoundPointsWithActiveChip(summary.starterPlayers, summary.benchPlayers, roundIndex, captainId, activeFplChip)).reduce((total, value) => total + value, 0)
    : horizonAlternative;

  return (
    <div
      className="relative mt-4"
      data-fantasy-squad-planner
      data-league-id={leagueId}
      data-season={season}
      aria-busy={leagueNavigationPending}
    >
      {leagueNavigationPending ? (
        <div className="fixed inset-x-4 top-20 z-50 mx-auto max-w-xl rounded border border-sky-300 bg-sky-50 px-4 py-3 text-center text-sm font-semibold text-sky-950 shadow-lg" role="status" aria-live="assertive">
          <I18nText
            en="Switching league. The previous player download has been stopped."
            ru="Переключаю лигу. Выгрузка игроков прошлой лиги остановлена."
          />
        </div>
      ) : null}
      <div className={cn("flex flex-col gap-4 transition-opacity", leagueNavigationPending && "pointer-events-none select-none opacity-[0.35]")}>
      <div ref={plannerTabsRef} className="sticky top-14 z-30 order-1 -mx-1 rounded border border-slate-200 bg-white/95 p-1 shadow-sm backdrop-blur xl:hidden">
        <SegmentedControl value={mobileTab} onChange={setMobileTab} options={mobileTabs} className="w-full justify-between border-0 bg-transparent p-0 [&>button]:min-h-12 [&>button]:flex-1" size="sm" />
      </div>
      <section className="contents">
        <div className={cn(mobileTab === "squad" ? "block" : "hidden xl:block", "order-2 ui-card p-4")}>
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
                      onClick={() => selectActiveRoundOffset(plan.roundOffset)}
                      title={round?.label ?? localizedText(language, `Round +${plan.roundOffset}`, `Тур +${plan.roundOffset}`)}
                      className={cn(
                        "min-h-12 min-w-[5.25rem] rounded px-2.5 py-2 text-left text-xs font-semibold transition",
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
                  <button type="button" onClick={inheritPreviousRound} className="min-h-11 shrink-0 rounded border border-slate-200 bg-white px-2 py-1 font-semibold text-slate-700 hover:bg-slate-100">
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

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => void autoPickSquad()}
                disabled={interactionPending || autoPickPending || !playerPoolReady || !plannerForecastReady}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded border border-sky-200 bg-sky-50 px-3 py-2 text-sm font-semibold text-sky-800 hover:bg-sky-100 disabled:opacity-60"
              >
                <Sparkles className="h-4 w-4" />
                {autoPickPending ? <I18nText en="Optimizing…" ru="Подбираем…" /> : <I18nText en="Auto-pick squad" ru="Автоподбор состава" />}
              </button>
              <button
                type="button"
                onClick={autoPickStarters}
                disabled={interactionPending || autoPickPending || !plannerForecastReady}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
              >
                <Sparkles className="h-4 w-4" />
                <I18nText en="Auto-pick XI" ru="Автостарт" />
              </button>
            </div>
          </div>

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

        <div ref={suggestionPanelRef} className={cn(mobileTab === "suggestions" ? "block" : "hidden xl:block", "order-5 ui-card p-2")}>
          <div className="flex flex-wrap items-center justify-between gap-1.5">
            <h3 className="min-w-0 truncate text-xs font-semibold uppercase tracking-wide text-slate-500"><I18nText en="Transfer suggestions" ru="Подсказки трансферов" /></h3>
            <div className="flex shrink-0 items-center gap-2">
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-1 text-[11px] font-semibold text-amber-800 num-tabular">
                <Sparkles className="h-3.5 w-3.5" />
                {suggestions.length}
              </span>
              <SegmentedControl
                name={localizedText(language, "Transfer forecast formula", "Формула прогноза трансферов")}
                value={transferSuggestionForecastSource}
                onChange={setTransferSuggestionForecastSource}
                options={transferSuggestionForecastSourceOptions}
                size="sm"
              />
            </div>
          </div>
          {transferSuggestionForecastSource === "FFO" ? (
            <p className="mt-1.5 rounded border border-cyan-200 bg-cyan-50 px-2 py-1 text-[10px] text-cyan-900">
              <I18nText en="FFO is published only for the current round, so these suggestions are ranked over 1 round." ru="FFO публикуется только на текущий тур, поэтому эти подсказки ранжированы на 1 тур." />
            </p>
          ) : null}
          {usesUnpricedTransfers ? (
            <p className="mt-1.5 text-[10px] text-slate-500">
              <I18nText en="Sports.ru allows 3 transfers per round; unused transfers bank up to 6." ru="В Sports.ru — 3 замены за тур, неиспользованные копятся до 6." />
            </p>
          ) : (
            <p className="mt-1.5 text-[10px] text-slate-500">
              <I18nText en="FPL banks unused free transfers, up to 5. Extra transfers cost 4 points." ru="В FPL неиспользованные бесплатные трансферы копятся до 5. Лишние стоят 4 очка." />
            </p>
          )}
          <div className="mt-1.5 grid items-start gap-2 xl:grid-cols-[minmax(0,1fr)_minmax(18rem,22rem)]">
            <div className="grid min-w-0 gap-1.5 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
            {displayedSuggestions.map((suggestion) => {
              const captain = suggestion.captainPlayerId ? playersById.get(suggestion.captainPlayerId) ?? null : null;
              return (
                <button
                  key={suggestion.id}
                  type="button"
                  onClick={() => applySuggestion(suggestion)}
                  className="block w-full rounded border border-slate-200 bg-white p-1.5 text-left shadow-sm transition hover:border-sky-200 hover:bg-sky-50/30"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-ink">
                        <I18nText en={`${suggestion.transferCount} transfer${suggestion.transferCount === 1 ? "" : "s"}`} ru={`${suggestion.transferCount} трансфер${suggestion.transferCount === 1 ? "" : suggestion.transferCount < 5 ? "а" : "ов"}`} />
                      </p>
                    </div>
                    <span className="whitespace-nowrap rounded bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700 num-tabular">
                      {signedScore(suggestion.round1Delta)}
                    </span>
                  </div>

                  {suggestion.priorityReplacementCount > 0 ? (
                    <p className="mt-1 rounded bg-amber-50 px-1.5 py-0.5 text-[9px] font-semibold text-amber-800">
                      <I18nText
                        en={`Priority: ${suggestion.priorityReplacementCount} starting outfield player with 0 projected FP.`}
                        ru={`В приоритете: ${suggestion.priorityReplacementCount} полевой игрок основы с прогнозом 0 ФО.`}
                      />
                    </p>
                  ) : null}

                  <div className="mt-1.5 space-y-1">
                    {suggestion.moves.map((move) => {
                      const outPlayer = playersById.get(move.outPlayerId);
                      const inPlayer = playersById.get(move.inPlayerId);
                      const outSelection = selectionsByPlayerId.get(move.outPlayerId);
                      const outForecast = outPlayer ? transferSuggestionForecastNextPoints(outPlayer, suggestion.forecastSource) : null;
                      const isPriorityReplacement = Boolean(outSelection?.isStarter && outPlayer?.positionGroup !== "GK" && outForecast === 0);
                      const isStartingGoalkeeperZero = Boolean(outSelection?.isStarter && outPlayer?.positionGroup === "GK" && outForecast === 0);

                      return (
                        <div key={`${move.outPlayerId}:${move.inPlayerId}`} className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-stretch gap-1">
                          {outPlayer ? (
                            <TransferSuggestionPlayerCard
                              player={outPlayer}
                              direction="out"
                              source={suggestion.forecastSource}
                              language={language}
                              isPriorityReplacement={isPriorityReplacement}
                              isStartingGoalkeeperZero={isStartingGoalkeeperZero}
                            />
                          ) : (
                            <TransferSuggestionPlayerFallback name={move.outName} teamName={move.outTeamName} positionGroup={move.positionGroup} direction="out" />
                          )}
                          <span aria-hidden="true" className="flex items-center justify-center text-slate-400"><ArrowRight className="h-3.5 w-3.5" /></span>
                          {inPlayer ? (
                            <TransferSuggestionPlayerCard player={inPlayer} direction="in" source={suggestion.forecastSource} language={language} />
                          ) : (
                            <TransferSuggestionPlayerFallback name={move.inName} teamName={move.inTeamName} positionGroup={move.positionGroup} direction="in" />
                          )}
                        </div>
                      );
                    })}
                  </div>

                  <dl className="mt-1.5 grid grid-cols-2 gap-x-1.5 gap-y-0.5 rounded bg-slate-50 px-1.5 py-1 text-[9px] sm:grid-cols-4">
                    <div>
                      <dt className="text-slate-500">{transferSuggestionRoundLabel(suggestion.forecastSource, 1, language)}</dt>
                      <dd className="font-semibold text-ink num-tabular">{signedScore(suggestion.round1Delta)}</dd>
                    </div>
                    <div>
                      <dt className="text-slate-500">{transferSuggestionRoundLabel(suggestion.forecastSource, transferSuggestionHorizon, language)}</dt>
                      <dd className="font-semibold text-ink num-tabular">{signedScore(suggestion.horizonDelta)}</dd>
                    </div>
                    <div>
                      <dt className="text-slate-500"><I18nText en="Squad" ru="Состав" /></dt>
                      <dd className="font-semibold text-ink num-tabular">{formatNumber(suggestion.squadCostAfter, 1)} / {formatNumber(rules.budgetLimit, 1)}</dd>
                    </div>
                    <div>
                      <dt className="text-slate-500"><I18nText en="Bank" ru="В банке" /></dt>
                      <dd className="font-semibold text-emerald-700 num-tabular">{formatNumber(suggestion.bankAfter, 1)}</dd>
                    </div>
                  </dl>

                  {captain ? <TransferSuggestionCaptain player={captain} source={suggestion.forecastSource} /> : null}

                  <span className="sr-only"><I18nText en={`${suggestion.reason}. Click to apply.`} ru={`Прогнозный выигрыш ${signedScore(suggestion.horizonDelta)} по ${suggestion.forecastSource} за ${transferSuggestionHorizon} тур. Нажмите, чтобы применить.`} /></span>
                </button>
              );
            })}
            {!transferSuggestionsReady ? (
              <p className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900" role="status">
                <I18nText
                  en={transferSuggestionsBlockedByReadiness
                    ? "Transfer recommendations are unavailable until this league season has fresh player and fixture data."
                    : transferSuggestionForecastSource === "FFO" && activeRoundOffset > 0
                      ? "FFO transfer recommendations are available only for the current round. Choose FO or ALT for a later round."
                      : `Transfer recommendations are unavailable until this league season has fresh non-zero ${transferSuggestionForecastSource} forecasts.`}
                  ru={transferSuggestionsBlockedByReadiness
                    ? "Трансферные рекомендации недоступны, пока для сезона лиги нет свежих данных по игрокам и календарю."
                    : transferSuggestionForecastSource === "FFO" && activeRoundOffset > 0
                      ? "Подсказки FFO доступны только для текущего тура. Для следующего тура выберите FO или ALT."
                      : `Трансферные рекомендации недоступны, пока для сезона лиги нет свежих ненулевых прогнозов ${transferSuggestionForecastSource}.`}
                />
              </p>
            ) : playerPoolFailed ? (
              <div className="space-y-2 rounded border border-rose-200 bg-rose-50 px-3 py-3 text-sm text-rose-700" role="alert">
                <I18nText en="The player pool could not be loaded, so transfer recommendations are unavailable." ru="Не удалось загрузить пул игроков, поэтому трансферные рекомендации недоступны." />
                <button
                  type="button"
                  onClick={() => {
                    setPlayerPoolFailed(false);
                    setPlayerPoolPending(true);
                    setPlayerPoolProgress(emptyPlayerPoolProgress(sourcePlayersRef.current.length));
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
                  en={playerPoolPending
                    ? playerPoolLoadingMessage.en
                    : "Calculating transfer recommendations..."}
                  ru={playerPoolPending
                    ? playerPoolLoadingMessage.ru
                    : "Рассчитываем трансферные рекомендации..."}
                />
              </p>
            ) : suggestions.length === 0 ? (
              <p className="text-sm text-slate-500"><I18nText en="No clean upgrade found for the selected filters." ru="Для выбранных фильтров чистое улучшение не найдено." /></p>
            ) : null}
            </div>

            <div className="min-w-0 xl:sticky xl:top-16">
              <BookmakerFavoritesTable
                rows={activeRoundBookmakerFavorites}
                roundLabel={rounds[activeRoundOffset]?.label ?? null}
                language={language}
              />
            </div>
          </div>
        </div>
      </section>

      <section className={cn(mobileTab === "suggestions" ? "hidden xl:block" : "block", "order-3 min-w-0 rounded border border-slate-200 bg-white p-3 shadow-soft sm:p-4 xl:order-4")}>
        <div className="grid min-w-0 grid-cols-1 gap-4 xl:grid-cols-[minmax(360px,0.76fr)_minmax(620px,1.24fr)] 2xl:grid-cols-[minmax(400px,0.62fr)_minmax(860px,1.38fr)] 3xl:grid-cols-[minmax(460px,0.5fr)_minmax(1100px,1.5fr)]">
          <div ref={squadSectionRef} className={cn(mobileTab === "squad" ? "block" : "hidden xl:block", "scroll-mt-28")}>
            <div ref={budgetForecastRef} className="mb-3 grid grid-cols-2 overflow-hidden rounded border border-slate-200 bg-slate-50 text-[13px] [&>dl:nth-child(odd)]:border-r [&>dl:nth-child(n+5)]:border-b-0 [&>dl:last-child]:col-span-2 [&>dl:last-child]:border-r-0 sm:grid-cols-5 sm:divide-x sm:divide-slate-200 sm:[&>dl]:border-b-0 sm:[&>dl]:border-r-0 sm:[&>dl:last-child]:col-span-1">
              <Metric
                label={<I18nText en="Next round" ru="След. тур" />}
                value={formatScore(previewNextRound)}
                secondaryLabel={<I18nText en="Alt" ru="Альт" />}
                secondaryValue={formatAlternativeScore(previewNextRoundAlternative)}
                tertiaryLabel="FFO"
                tertiaryValue={formatScore(nextRoundFoontasyTotal)}
                tone="good"
              />
              <Metric
                label={<I18nText en={`Horizon ${horizon}R`} ru={`Горизонт ${horizon}т`} />}
                value={formatScore(previewHorizon)}
                secondaryLabel={<I18nText en="Alt" ru="Альт" />}
                secondaryValue={formatAlternativeScore(previewHorizonAlternative)}
                tone="accent"
              />
              <Metric label={<I18nText en="Budget" ru="Бюджет" />} value={`${formatNumber(summary.spent, 1)} / ${formatNumber(rules.budgetLimit, 1)}`} tone={summary.spent > rules.budgetLimit || summary.bank < 0 ? "bad" : "default"} />
              <Metric label={<I18nText en="Bank" ru="Банк" />} value={formatNumber(summary.bank, 1)} tone={summary.bank < 0 ? "bad" : "good"} />
              <Metric
                label={<I18nText en="Transfers" ru="Замены" />}
                value={`${plannedTransferCount}/${transferLimit}`}
                tone={transferLimitIsActive && plannedTransferCount >= transferLimit ? "bad" : "accent"}
                title={localizedText(
                  language,
                  usesUnpricedTransfers
                    ? "Used / available this round. Sports.ru grants 3 per round and banks unused transfers up to 6."
                    : "Used / available this round. FPL banks unused free transfers up to 5.",
                  usesUnpricedTransfers
                    ? "Использовано / доступно в этом туре. В Sports.ru 3 замены за тур, неиспользованные копятся до 6."
                    : "Использовано / доступно в этом туре. В FPL неиспользованные бесплатные трансферы копятся до 5."
                )}
              />
            </div>
            <div className="mb-3">
              <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
                <h3 className="truncate text-xs font-semibold uppercase tracking-wide text-slate-500 sm:text-sm"><I18nText en="Your squad" ru="Ваш состав" /></h3>
                <div className="flex shrink-0 items-center gap-1.5">
                  <button
                    type="button"
                    onClick={importStoredSportsRuSquad}
                    disabled={interactionPending || autoPickPending}
                    title={sportsRuSquadButtonTitle(language, sportsSnapshotStatus)}
                    aria-label={sportsRuSquadButtonTitle(language, sportsSnapshotStatus)}
                    aria-describedby={sportsImportNotice ? "sports-ru-import-status" : undefined}
                    className={cn("inline-flex h-11 w-11 shrink-0 items-center justify-center rounded border border-sky-200 bg-sky-50 text-sky-800 hover:bg-sky-100 disabled:opacity-60", provider === "FPL" && "hidden")}
                  >
                    {sportsImportPending
                      ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
                      : <Download className="h-4 w-4" aria-hidden="true" />}
                    <span className="sr-only">{sportsImportPending ? <I18nText en="Loading Sports squad" ru="Загрузка состава Sports" /> : <I18nText en="Import Sports squad" ru="Импортировать состав Sports" />}</span>
                  </button>
                  {provider === "FPL" ? (
                    <button
                      type="button"
                      onClick={importFplSquad}
                      disabled={interactionPending || autoPickPending}
                      title={localizedText(language, "Import the latest published FPL gameweek squad", "Импортировать последний опубликованный состав FPL")}
                      aria-label={localizedText(language, "Import the latest published FPL gameweek squad", "Импортировать последний опубликованный состав FPL")}
                      className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded border border-violet-200 bg-violet-50 text-violet-800 hover:bg-violet-100 disabled:opacity-60"
                    >
                      {fplImportPending ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Download className="h-4 w-4" aria-hidden="true" />}
                      <span className="sr-only"><I18nText en={fplImportPending ? "Loading FPL squad" : "Import FPL squad"} ru={fplImportPending ? "Загрузка состава FPL" : "Импортировать состав FPL"} /></span>
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={rollbackToLastSavedSquad}
                    disabled={interactionPending || autoPickPending || !squadIsDirty}
                    title={localizedText(language, "Roll back to the last save on this page", "Откатить к последнему сохранению здесь")}
                    aria-label={localizedText(language, "Roll back to the last save on this page", "Откатить к последнему сохранению здесь")}
                    className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded border border-amber-200 bg-amber-50 text-amber-900 hover:bg-amber-100 disabled:opacity-60"
                  >
                    <Undo2 className="h-4 w-4" aria-hidden="true" />
                    <span className="sr-only"><I18nText en="Roll back squad" ru="Откатить состав" /></span>
                  </button>
                  <button
                    type="button"
                    onClick={() => void saveSquad()}
                    disabled={interactionPending || autoPickPending || !squadIsValid}
                    title={localizedText(language, "Save squad", "Сохранить состав")}
                    aria-label={localizedText(language, "Save squad", "Сохранить состав")}
                    className="btn-brand inline-flex h-11 w-11 shrink-0 items-center justify-center rounded disabled:opacity-60"
                  >
                    {savePending ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Save className="h-4 w-4" aria-hidden="true" />}
                    <span className="sr-only">{savePending ? <I18nText en="Saving squad" ru="Сохраняем состав" /> : <I18nText en="Save squad" ru="Сохранить состав" />}</span>
                  </button>
                </div>
              </div>
              {sportsImportNotice ? (
                <div
                  id="sports-ru-import-status"
                  role="status"
                  aria-live="polite"
                  className={cn(
                    "mt-2 flex items-start gap-2 rounded border px-2.5 py-2 text-xs",
                    sportsImportNotice.tone === "error"
                      ? "border-rose-200 bg-rose-50 text-rose-800"
                      : sportsImportNotice.tone === "success"
                          ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                      : sportsImportNotice.tone === "waiting"
                          ? "border-amber-200 bg-amber-50 text-amber-800"
                          : "border-sky-200 bg-sky-50 text-sky-800"
                  )}
                >
                  {sportsImportNotice.tone === "progress" ? <LoaderCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 animate-spin" aria-hidden="true" /> : null}
                  <span>{sportsImportNotice.text}</span>
                </div>
              ) : null}
            </div>
            <div className="xl:hidden">
              <SquadTouchRoster
                summary={summary}
                selectionsByPlayerId={selectionsByPlayerId}
                horizon={horizon}
                language={language}
                replacementMode={replacementMode}
                replacementSourcePlayerId={replacementSourcePlayerId}
                onRemove={removePlayer}
                onToggleCaptain={toggleCaptain}
                onToggleVice={toggleViceCaptain}
                onStartLineupReplacement={startLineupReplacement}
                onSelectLineupReplacement={handleReplacementPlayerClick}
                onCancelLineupReplacement={() => {
                  setReplacementMode(false);
                  setReplacementSourcePlayerId(null);
                  setMessage(null);
                }}
                onStartPoolReplacement={startPoolReplacement}
              />
            </div>
            <div className="hidden xl:block">
              <SquadPitch
                summary={summary}
                selectionsByPlayerId={selectionsByPlayerId}
                horizon={horizon}
                language={language}
                captainId={captainId}
                viceCaptainId={viceCaptainId}
                draggedPlayerId={draggedPlayerId}
                replacementMode={replacementMode}
                replacementSourcePlayerId={replacementSourcePlayerId}
                onRemove={removePlayer}
                onToggleCaptain={toggleCaptain}
                onToggleVice={toggleViceCaptain}
                onDragStart={setDraggedPlayerId}
                onDragEnd={() => setDraggedPlayerId(null)}
                onDropToStarter={handleDropToStarter}
                onDropToBench={handleDropToBench}
                onDropOnPlayer={handleDropOnPlayer}
                onToggleReplacementMode={toggleReplacementMode}
                onReplacementPlayerClick={handleReplacementPlayerClick}
              />
            </div>
          </div>

          <div ref={playerPoolSectionRef} className={cn(mobileTab === "pool" ? "block" : "hidden xl:block", "min-w-0 scroll-mt-28")}>
            {poolReplacementSource ? (
              <div className="mb-3 rounded border border-sky-300 bg-sky-50 p-3" role="status" data-testid="pool-replacement-banner">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold uppercase tracking-wide text-sky-700"><I18nText en="One-step replacement" ru="Замена в один шаг" /></p>
                    <p className="mt-0.5 truncate text-sm font-bold text-sky-950">
                      <I18nText en="Replacing" ru="Меняем" />: {poolReplacementSource.name}
                    </p>
                    <p className="mt-1 text-xs leading-5 text-sky-800">
                      <I18nText
                        en={`Showing available ${poolReplacementSource.positionGroup} players. Tap Replace — no need to remove the current player first.`}
                        ru={`Показаны доступные игроки ${poolReplacementSource.positionGroup}. Нажмите «Заменить» — отдельно удалять текущего игрока не нужно.`}
                      />
                    </p>
                  </div>
                  <button type="button" onClick={cancelPoolReplacement} className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded border border-sky-300 bg-white px-3 text-sm font-semibold text-sky-800">
                    <X className="h-4 w-4" />
                    <I18nText en="Cancel" ru="Отмена" />
                  </button>
                </div>
              </div>
            ) : null}
            <details
              open={widePlannerViewport || poolSecondaryControlsOpen}
              onToggle={(event) => {
                if (!widePlannerViewport) setPoolSecondaryControlsOpen(event.currentTarget.open);
              }}
              className="relative z-30 mb-3 rounded border border-slate-200 bg-slate-50/70 xl:contents"
            >
              <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-3 text-sm font-semibold text-slate-700 [&::-webkit-details-marker]:hidden xl:hidden">
                <span className="inline-flex items-center gap-2"><SlidersHorizontal className="h-4 w-4" /><I18nText en="More filters and export" ru="Ещё фильтры и выгрузка" /></span>
                {activeAdvancedFilterCount > 0 ? <span className="rounded-full bg-sky-700 px-2 py-0.5 text-xs text-white">{activeAdvancedFilterCount}</span> : null}
              </summary>
            <div className="relative z-30 flex flex-wrap items-center justify-between gap-2 overflow-visible border-t border-slate-200 p-2 xl:!flex xl:border-0 xl:p-0 xl:pb-1">
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <div className="inline-flex rounded border border-slate-200 bg-slate-50 p-0.5" aria-label={localizedText(language, "Player match scope", "Какие матчи учитывать")}>
                  <button
                    type="button"
                    onClick={() => applyQuickHistoryScope("ALL_LOADED")}
                    disabled={historyApplying}
                    className={cn("min-h-11 rounded px-3 py-1.5 text-xs font-semibold", appliedHistorySettings.scope !== "ALL_PLAYER_MATCHES" ? "bg-white text-sky-800 shadow-sm" : "text-slate-600")}
                  >
                    <I18nText en="Clubs only" ru="Только клубы" />
                  </button>
                  <button
                    type="button"
                    onClick={() => applyQuickHistoryScope("ALL_PLAYER_MATCHES")}
                    disabled={historyApplying}
                    className={cn("min-h-11 rounded px-3 py-1.5 text-xs font-semibold", appliedHistorySettings.scope === "ALL_PLAYER_MATCHES" ? "bg-white text-sky-800 shadow-sm" : "text-slate-600")}
                  >
                    <I18nText en="All matches" ru="Все матчи" />
                  </button>
                </div>
                <select
                  value={minimumPrice ?? "ALL"}
                  onChange={(event) => setMinimumPrice(event.target.value === "ALL" ? null : Number(event.target.value))}
                  aria-label={localizedText(language, "Minimum price", "Минимальная цена")}
                  className="min-h-11 rounded border border-slate-200 px-2 py-1.5 text-xs font-semibold text-slate-700 [@media(pointer:coarse)]:text-base"
                >
                  <option value="ALL">{localizedText(language, "Min price", "Цена от")}</option>
                  {priceFilterOptions.filter((price) => maximumPrice === null || price <= maximumPrice).map((price) => <option key={price} value={price}>{formatNumber(price, 1)}</option>)}
                </select>
                <select
                  value={maximumPrice ?? "ALL"}
                  onChange={(event) => setMaximumPrice(event.target.value === "ALL" ? null : Number(event.target.value))}
                  aria-label={localizedText(language, "Maximum price", "Максимальная цена")}
                  className="min-h-11 rounded border border-slate-200 px-2 py-1.5 text-xs font-semibold text-slate-700 [@media(pointer:coarse)]:text-base"
                >
                  <option value="ALL">{localizedText(language, "Max price", "Цена до")}</option>
                  {priceFilterOptions.filter((price) => minimumPrice === null || price >= minimumPrice).map((price) => <option key={price} value={price}>{formatNumber(price, 1)}</option>)}
                </select>
                <label className="inline-flex min-h-11 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded border border-slate-200 bg-white px-2 py-1.5 text-xs font-semibold text-slate-700">
                  <input
                    type="checkbox"
                    checked={onlyAffordable}
                    onChange={(event) => {
                      const enabled = event.target.checked;
                      setOnlyAffordable(enabled);
                      setFitsPreparing(enabled);
                      if (!enabled) setFitCalculation(null);
                    }}
                    className="h-4 w-4 shrink-0 rounded border-slate-300"
                  />
                  <span>{fitsPreparing ? <I18nText en="Calculating..." ru="Считаем..." /> : <I18nText en="Fits" ru="Проходит" />}</span>
                </label>
                <label className="hidden min-h-11 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded border border-slate-200 bg-white px-2 py-1.5 text-xs font-semibold text-slate-700 xl:inline-flex">
                  <input
                    type="checkbox"
                    checked={detailedFormulaTooltips}
                    onChange={(event) => setDetailedFormulaTooltips(event.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 text-sky-700"
                  />
                  <I18nText en="Detailed tooltips" ru="Подробные подсказки" />
                </label>
              </div>
              <div className="flex min-w-0 flex-wrap items-center justify-end gap-2">
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
                    const exportPlayers = filterPlayerPoolByNameQuery(matchingPlayers, playerNameQuery);
                    if (exportPlayers.length === 0) {
                      setMessage(localizedText(language, "No players match the selected filters.", "Нет игроков под выбранные фильтры."));
                      return;
                    }
                    setTableExportPending(true);
                    void downloadPlayerPoolXlsx(exportPlayers, tableHorizon, language, leagueId, season, exportColumnKeys, provider)
                      .catch(() => setMessage(localizedText(language, "Could not export the player table.", "Не удалось выгрузить таблицу игроков.")))
                      .finally(() => setTableExportPending(false));
                  }}
                  disabled={matchingPlayers.length === 0 || tableExportPending || fitsPreparing}
                  className="inline-flex min-h-11 items-center gap-2 whitespace-nowrap rounded border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-800 hover:bg-emerald-100 disabled:opacity-50"
                >
                  <Download className="h-4 w-4" />
                  {tableExportPending ? <I18nText en="Exporting…" ru="Выгрузка…" /> : <I18nText en="Export table" ru="Выгрузить таблицу" />}
                </button>
              </div>
            </div>
            </details>
            {playerPoolAvailable && postLoadContentReady ? (
              <>
                {playerPoolPending ? (
                  <p
                    data-player-pool-progress={`${playerPoolProgress.stage}:${playerPoolProgress.visiblePlayers}/${playerPoolProgress.totalPlayers ?? "?"}:${playerPoolProgress.enrichedPlayers}`}
                    className="mb-2 rounded border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-800"
                    role="status"
                    aria-live="polite"
                  >
                    <I18nText
                      en={playerPoolLoadingMessage.en}
                      ru={playerPoolLoadingMessage.ru}
                    />
                  </p>
                ) : playerPoolFailed ? (
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2 rounded border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700" role="alert">
                    <I18nText en="The remaining player batches could not be loaded. The loaded players are still available." ru="Остальные батчи игроков не загрузились. Уже загруженные игроки доступны." />
                    <button
                      type="button"
                      onClick={() => {
                        setPlayerPoolFailed(false);
                        setPlayerPoolPending(true);
                        setPlayerPoolProgress(emptyPlayerPoolProgress(sourcePlayersRef.current.length));
                        setPlayerPoolRetry((value) => value + 1);
                      }}
                      className="rounded border border-rose-300 bg-white px-3 py-1.5 font-semibold text-rose-700"
                    >
                      <I18nText en="Retry" ru="Повторить" />
                    </button>
                  </div>
                ) : null}
                <CustomizablePlayerPoolTable
                  players={displayedPoolPlayers}
                  availableColumns={playerPoolColumns}
                  horizon={tableHorizon}
                  language={language}
                  provider={provider}
                  addBlockReason={playerPoolActionBlockReason}
                  selectionsByPlayerId={selectionsByPlayerId}
                  onAdd={replacePlayerFromPool}
                  onRemove={removePlayer}
                  replacementSource={poolReplacementSource}
                  projectionDetailsSourceHref={playerPoolRequestHref}
                  detailedFormulaTooltips={detailedFormulaTooltips}
                  initialVisibleColumns={initialVisiblePlayerPoolColumns}
                  initialColumnWidths={initialPlayerPoolColumnWidths}
                  onVisibleColumnsChange={setExportColumnKeys}
                  toolbar={(
                    <>
                      <PlayerPoolNameSearch
                        language={language}
                        value={playerNameQuery}
                        onChange={setPlayerNameQuery}
                      />
                      <select value={teamFilter} onChange={(event) => setTeamFilter(event.target.value)} aria-label={localizedText(language, "Team filter", "Фильтр по команде")} className="min-h-12 min-w-0 rounded border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 [@media(pointer:coarse)]:text-base">
                        <option value="ALL">{localizedText(language, "All teams", "Все команды")}</option>
                        {teamFilterOptions.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}
                      </select>
                      <select value={positionFilter} onChange={(event) => setPositionFilter(event.target.value)} aria-label={localizedText(language, "Position filter", "Фильтр позиции")} className="min-h-12 min-w-0 rounded border border-slate-200 px-3 py-2 text-xs [@media(pointer:coarse)]:text-base">
                        <option value="ALL">{localizedText(language, "All positions", "Все позиции")}</option>
                        {fantasyPositionOrder.map((position) => <option key={position} value={position}>{position}</option>)}
                      </select>
                      <select value={tableHorizon} onChange={(event) => setTableHorizon(event.target.value === "3" ? 3 : 5)} aria-label={localizedText(language, "Player table forecast horizon", "Горизонт таблицы игроков")} className="min-h-12 min-w-0 rounded border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 [@media(pointer:coarse)]:text-base">
                        <option value="3">{localizedText(language, "3 rounds", "3 тура")}</option>
                        <option value="5">{localizedText(language, "5 rounds", "5 туров")}</option>
                      </select>
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
        <section className="order-6 overflow-hidden rounded border border-slate-200 bg-white shadow-soft">
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
                      {formatScore(provider === "FPL"
                        ? fantasyRoundPointsWithActiveChip(summary.starterPlayers, summary.benchPlayers, index, captainId, activeFplChip)
                        : startingXiRoundPoints(summary.starterPlayers, index, captainId))}
                    </td>
                  ))}
                </tr>
                <tr className="border-t border-slate-100">
                  <td className="px-4 py-3 font-semibold text-ink">
                    <I18nText en="Starting XI Alt FP" ru="Альт FP старта" />
                  </td>
                  {rounds.map((round, index) => (
                    <td key={round.id} className="px-4 py-3 text-right font-semibold text-amber-700 num-tabular">
                      {formatAlternativeScore(provider === "FPL"
                        ? fantasyAlternativeRoundPointsWithActiveChip(summary.starterPlayers, summary.benchPlayers, index, captainId, activeFplChip)
                        : startingXiAlternativeRoundPoints(summary.starterPlayers, index, captainId))}
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
      <FantasyFixtureCalendar calendar={fixtureCalendar} />
      </div>
    </div>
  );
}

function sportsRuSquadButtonTitle(language: UiLanguage, status: SportsRuSquadSnapshotStatus | null) {
  if (!status?.linked) {
    return localizedText(language, "Link a public Sports.ru profile in your profile settings first.", "Сначала привяжите публичный профиль Sports.ru в настройках профиля.");
  }
  if (status.available) {
    const tour = status.tourName ? ` · ${status.tourName}` : "";
    return localizedText(language, `Apply the stored Sports.ru squad${tour}.`, `Применить сохранённый состав Sports.ru${tour}.`);
  }
  if (status.inProgress) {
    return localizedText(language, "The server is downloading and matching this Sports.ru squad.", "Сервер скачивает и сопоставляет этот состав Sports.ru.");
  }
  if (status.status === "UNAVAILABLE") {
    return localizedText(language, "Start a fresh check for the current Sports.ru squad.", "Запустить новую проверку текущего состава Sports.ru.");
  }
  return localizedText(
    language,
    "Check for the squad now. Automatic loading starts 30 minutes after the first match.",
    "Проверить состав сейчас. Автоматическая загрузка начинается через 30 минут после первого матча."
  );
}

function localizedSportsRuPendingStatus(
  language: UiLanguage,
  status: SportsRuSquadSnapshotStatus | null
) {
  if (status?.inProgress) {
    return localizedText(
      language,
      "The server is already downloading this squad. Wait a few seconds and press the button again.",
      "Сервер уже скачивает этот состав. Подождите несколько секунд и нажмите кнопку ещё раз."
    );
  }
  if (status?.status === "WAITING_FOR_FIRST_MATCH") {
    return localizedText(
      language,
      "The first match has not started yet. The squad becomes public after the deadline; the first automatic request will run 30 minutes after kickoff.",
      "Первый матч ещё не начался. Состав станет публичным после дедлайна; первая автоматическая загрузка запустится через 30 минут после стартового свистка."
    );
  }
  if (status?.status === "MAPPING_INCOMPLETE") {
    return localizedText(
      language,
      `Sports.ru returned the squad. ${status.mappedPlayersCount}/${status.playersCount} players are matched; the server will retry the remaining mappings automatically.`,
      `Sports.ru вернул состав. Сопоставлено ${status.mappedPlayersCount} из ${status.playersCount} игроков; оставшиеся сопоставления сервер повторит автоматически.`
    );
  }
  const availableAfter = parseClientDate(status?.availableAfter);
  if (availableAfter && availableAfter.getTime() > Date.now()) {
    const formatted = localizedClientDateTime(language, availableAfter);
    return localizedText(
      language,
      `The squad is not public yet. The first automatic request is scheduled for ${formatted}, 30 minutes after the first match starts.`,
      `Состав ещё не открыт. Первая автоматическая загрузка запланирована на ${formatted} — через 30 минут после начала первого матча.`
    );
  }
  if (status?.status === "RETRY") {
    const nextAttempt = parseClientDate(status.nextAttemptAt);
    const suffix = nextAttempt
      ? localizedText(
          language,
          ` The next automatic attempt is scheduled for ${localizedClientDateTime(language, nextAttempt)}.`,
          ` Следующая автоматическая попытка запланирована на ${localizedClientDateTime(language, nextAttempt)}.`
        )
      : "";
    return localizedText(
      language,
      `The complete published squad has not been received from Sports.ru yet.${suffix}`,
      `Полный опубликованный состав от Sports.ru пока не получен.${suffix}`
    );
  }
  if (status?.status === "UNAVAILABLE") {
    return localizedText(
      language,
      "Sports.ru still does not expose this tour squad. Press the button later to start a fresh check.",
      "Sports.ru всё ещё не отдаёт состав этого тура. Нажмите кнопку позже — она запустит новую проверку."
    );
  }
  return localizedText(
    language,
    "The request is prepared, but no published squad is available yet. The server will keep checking automatically.",
    "Загрузка подготовлена, но опубликованного состава пока нет. Сервер продолжит автоматические проверки."
  );
}

function localizedSportsRuImportError(language: UiLanguage, code: string, fallback: string | null) {
  if (code === "SPORTS_PROFILE_REQUIRED") {
    return localizedText(language, "Link a public Sports.ru profile in your profile settings first.", "Сначала привяжите публичный профиль Sports.ru в настройках профиля.");
  }
  if (code === "SPORTS_SNAPSHOT_PENDING") {
    return localizedText(
      language,
      "The current Sports.ru squad has not been stored yet. The background loader starts 30 minutes after the first match.",
      "Текущий состав Sports ещё не сохранён. Фоновая загрузка запускается через 30 минут после начала первого матча."
    );
  }
  if (code === "SPORTS_TOURNAMENT_NOT_CONFIGURED") {
    return localizedText(
      language,
      "Sports.ru squad import is not configured for this league season.",
      "Импорт состава Sports.ru для этой лиги и сезона пока не настроен."
    );
  }
  if (["STORED_SPORTS_SQUAD_INVALID", "SPORTS_PLAYERS_UNMAPPED", "SPORTS_SQUAD_INVALID"].includes(code)) {
    return localizedText(language, "The stored Sports.ru squad is incomplete or cannot be mapped to the player pool.", "Сохранённый состав Sports неполный или не сопоставляется с пулом игроков.");
  }
  return fallback ?? localizedText(language, "Could not load the stored Sports squad.", "Не удалось загрузить сохранённый состав Sports.");
}

function parseClientDate(value: string | null | undefined) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function localizedClientDateTime(language: UiLanguage, value: Date) {
  return new Intl.DateTimeFormat(language === "ru" ? "ru-RU" : "en-GB", {
    dateStyle: "short",
    timeStyle: "short"
  }).format(value);
}

type PlayerPoolTableProps = {
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

function PlayerPoolAdvancedFilterMenu({ columns, filters, activeCount, language, onChange, onReset }: {
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

function normalizedPlayerPoolNameQuery(value: string) {
  return value.trim().toLowerCase();
}

export function filterPlayerPoolByNameQuery(players: FantasyPlannerPlayer[], query: string) {
  const normalizedQuery = normalizedPlayerPoolNameQuery(query);
  if (!normalizedQuery) return players;
  return players.filter((player) => player.name.toLowerCase().includes(normalizedQuery));
}

function PlayerPoolNameSearch({ language, value, onChange }: {
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

function CustomizablePlayerPoolTable({
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
        <details className="relative hidden shrink-0 md:block [@media(pointer:coarse)]:hidden">
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

      {compactViewport === null ? (
        <div className="col-span-full h-24 animate-pulse rounded border border-slate-200 bg-slate-50" aria-hidden="true" />
      ) : null}

      {compactViewport === true ? <div className="col-span-full">
        <PlayerPoolMobileList key={props.replacementSource?.playerId ?? "browse"} {...props} players={sortedPlayers} />
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
                <th data-sort-key="player" data-sort-default-direction="asc" className="sticky left-0 z-20 overflow-hidden border-r border-slate-200 bg-slate-50 px-2 py-2" title={fixedColumnTitles.player} style={{ width: widthFor("player", playerPoolFixedColumnWidths.player) }}><PlayerPoolHeaderLabel label={localizedText(language, "Player", "Игрок")} /><ColumnResizeHandle label={localizedText(language, "player", "игрока")} onPointerDown={(event) => startColumnResize(event, "player", playerPoolFixedColumnWidths.player)} onDoubleClick={() => resetColumnWidth("player")} /></th>
                <th data-sort-key="team" data-sort-default-direction="asc" className="relative overflow-hidden px-2 py-2" title={fixedColumnTitles.team} style={{ width: widthFor("team", playerPoolFixedColumnWidths.team) }}><PlayerPoolHeaderLabel label={localizedText(language, "Team", "Клуб")} /><ColumnResizeHandle label={localizedText(language, "team", "клуба")} onPointerDown={(event) => startColumnResize(event, "team", playerPoolFixedColumnWidths.team)} onDoubleClick={() => resetColumnWidth("team")} /></th>
                <th data-sort-key="position" data-sort-default-direction="asc" className="relative overflow-hidden px-1 py-2" title={fixedColumnTitles.position} style={{ width: widthFor("position", playerPoolFixedColumnWidths.position) }}><PlayerPoolHeaderLabel label={localizedText(language, "Pos", "Поз.")} /><ColumnResizeHandle label={localizedText(language, "position", "позиции")} onPointerDown={(event) => startColumnResize(event, "position", playerPoolFixedColumnWidths.position)} onDoubleClick={() => resetColumnWidth("position")} /></th>
                <th data-sort-key="price" data-sort-default-direction="desc" data-column-key="price" aria-label={localizedText(language, "Price", "Цена")} className="relative overflow-hidden px-1 py-2 text-right" title={fixedColumnTitles.price} style={{ width: widthFor("price", playerPoolFixedColumnWidths.price) }}><PlayerPoolHeaderLabel label={responsivePriceHeaderLabel(widthFor("price", playerPoolFixedColumnWidths.price), language)} numeric priceLabel fullLabel={localizedText(language, "Price", "Цена")} /><ColumnResizeHandle label={localizedText(language, "price", "цены")} onPointerDown={(event) => startColumnResize(event, "price", playerPoolFixedColumnWidths.price)} onDoubleClick={() => resetColumnWidth("price")} /></th>
                <th data-sort-disabled="true" className="relative overflow-hidden px-1 py-2 text-center" style={{ width: widthFor("action", playerPoolFixedColumnWidths.action) }} title={localizedText(language, "Add the player to the squad or remove a selected player. Disabled means a budget, position, or club limit would be exceeded.", "Добавить игрока в состав или убрать выбранного. Неактивная кнопка означает превышение бюджета, лимита позиции или клуба.")}><span aria-hidden="true">+</span><span className="sr-only"><I18nText en="Add or remove" ru="Добавить или убрать" /></span><ColumnResizeHandle label={localizedText(language, "squad action", "кнопки состава")} onPointerDown={(event) => startColumnResize(event, "action", playerPoolFixedColumnWidths.action)} onDoubleClick={() => resetColumnWidth("action")} /></th>
                {visibleColumns.map((column) => (
                  <th key={column.key} data-sort-key={column.key} data-sort-default-direction={column.numeric ? "desc" : "asc"} data-sort-disabled={column.key === "fixtures" ? "true" : undefined} className={cn("relative overflow-hidden px-1 py-2", column.numeric && "text-center")} title={column.title} style={{ width: widthFor(column.key, column.width) }}><PlayerPoolHeaderLabel label={column.label} numeric={column.numeric} /><ColumnResizeHandle label={column.label} onPointerDown={(event) => startColumnResize(event, column.key, column.width)} onDoubleClick={() => resetColumnWidth(column.key)} /></th>
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

function playerPoolFixedColumnTitles(language: UiLanguage, provider = "SPORTS_RU") {
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

function CustomPlayerPoolRow({ player, columns, horizon, language, provider, projectionDetailsSourceHref, detailedFormulaTooltips, addBlockReason, selectionsByPlayerId, onAdd, onRemove }: Omit<PlayerPoolTableProps, "players"> & { player: FantasyPlannerPlayer; columns: PlayerPoolOptionalColumn[] }) {
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

function playerPoolOptionalColumns(players: FantasyPlannerPlayer[], horizon: number, language: UiLanguage, provider = "SPORTS_RU"): PlayerPoolOptionalColumn[] {
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

function playerPoolAdvancedFilterColumns(players: FantasyPlannerPlayer[], horizon: number, language: UiLanguage, provider = "SPORTS_RU"): PlayerPoolAdvancedFilterColumn[] {
  const fixedTitles = playerPoolFixedColumnTitles(language, provider);
  return [
    { key: "player", label: localizedText(language, "Player", "Игрок"), title: fixedTitles.player, numeric: false },
    { key: "team", label: localizedText(language, "Club", "Клуб"), title: fixedTitles.team, numeric: false },
    { key: "position", label: localizedText(language, "Position", "Позиция"), title: fixedTitles.position, numeric: false },
    { key: "price", label: localizedText(language, "Price", "Цена"), title: fixedTitles.price, numeric: true },
    ...playerPoolOptionalColumns(players, horizon, language, provider)
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

function customPlayerPoolCell(
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

function playerPoolValueCellTitle(column: PlayerPoolOptionalColumn, player: FantasyPlannerPlayer, horizon: number, language: UiLanguage, rawValue: string | number | null) {
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

function comparePlayerPoolValues(
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

function useFixedVirtualRows<T>(
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

function customPlayerPoolColumnValue(key: string, player: FantasyPlannerPlayer, horizon: number): string | number | null {
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
  if (key.endsWith("PerPrice")) return formatNumber(value, 3);
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

function PlayerPoolMobileList({
  players,
  horizon,
  language,
  addBlockReason,
  selectionsByPlayerId,
  onAdd,
  onRemove,
  replacementSource
}: {
  players: FantasyPlannerPlayer[];
  horizon: number;
  language: UiLanguage;
  addBlockReason: (player: FantasyPlannerPlayer) => string | null;
  selectionsByPlayerId: Map<string, FantasySquadSelection>;
  onAdd: (player: FantasyPlannerPlayer) => void;
  onRemove: (playerId: string) => void;
  replacementSource?: FantasyPlannerPlayer | null;
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
                    {player.forecastConfidence !== null && player.forecastConfidence !== undefined
                      ? ` · ${Math.round(player.forecastConfidence * 100)}%`
                      : ""}
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

function Metric({
  label,
  value,
  secondaryLabel,
  secondaryValue,
  tertiaryLabel,
  tertiaryValue,
  tone = "default",
  title
}: {
  label: React.ReactNode;
  value: string;
  secondaryLabel?: React.ReactNode;
  secondaryValue?: string;
  tertiaryLabel?: React.ReactNode;
  tertiaryValue?: string;
  tone?: "default" | "good" | "bad" | "accent";
  title?: string;
}) {
  const color = tone === "good" ? "text-emerald-700" : tone === "bad" ? "text-rose-700" : tone === "accent" ? "text-sky-700" : "text-ink";
  return (
    <dl className="min-w-0 border-b border-slate-200 px-2 py-1.5 last:border-b-0 md:border-b-0" title={title}>
      <dt className="truncate text-[10px] font-semibold uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className={cn("mt-0.5 whitespace-nowrap text-sm font-bold leading-5 num-tabular", color)}>{value}</dd>
      {secondaryValue !== undefined ? (
        <dd className="mt-0.5 flex items-baseline gap-1 truncate text-[10px] font-semibold text-amber-700 num-tabular">
          <span className="uppercase tracking-wide text-slate-500">{secondaryLabel}</span>
          <span>{secondaryValue}</span>
        </dd>
      ) : null}
      {tertiaryValue !== undefined ? (
        <dd className="mt-0.5 flex items-baseline gap-1 truncate text-[10px] font-semibold text-cyan-700 num-tabular">
          <span className="uppercase tracking-wide text-slate-500">{tertiaryLabel}</span>
          <span>{tertiaryValue}</span>
        </dd>
      ) : null}
    </dl>
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

function SquadTouchRoster({
  summary,
  selectionsByPlayerId,
  horizon,
  language,
  replacementMode,
  replacementSourcePlayerId,
  onRemove,
  onToggleCaptain,
  onToggleVice,
  onStartLineupReplacement,
  onSelectLineupReplacement,
  onCancelLineupReplacement,
  onStartPoolReplacement
}: {
  summary: ReturnType<typeof summarizeFantasySquad>;
  selectionsByPlayerId: Map<string, FantasySquadSelection>;
  horizon: number;
  language: UiLanguage;
  replacementMode: boolean;
  replacementSourcePlayerId: string | null;
  onRemove: (playerId: string) => void;
  onToggleCaptain: (playerId: string) => void;
  onToggleVice: (playerId: string) => void;
  onStartLineupReplacement: (playerId: string) => void;
  onSelectLineupReplacement: (playerId: string) => void;
  onCancelLineupReplacement: () => void;
  onStartPoolReplacement: (playerId: string) => void;
}) {
  const [actionPlayerId, setActionPlayerId] = useState<string | null>(null);
  const allPlayers = [...summary.starterPlayers, ...summary.benchPlayers];
  const playersById = new Map(allPlayers.map((player) => [player.playerId, player]));
  const actionPlayer = actionPlayerId ? playersById.get(actionPlayerId) ?? null : null;
  const actionSelection = actionPlayerId ? selectionsByPlayerId.get(actionPlayerId) : undefined;
  const replacementSource = replacementSourcePlayerId ? playersById.get(replacementSourcePlayerId) ?? null : null;
  const replacementSourceSelection = replacementSourcePlayerId ? selectionsByPlayerId.get(replacementSourcePlayerId) : undefined;
  const replacementTargets = replacementSource && replacementSourceSelection
    ? allPlayers.filter((player) => isSquadReplacementTarget(
        replacementSourceSelection,
        selectionsByPlayerId.get(player.playerId),
        replacementSource.positionGroup,
        player.positionGroup
      ))
    : [];
  const orderedStarters = [...summary.starterPlayers].sort((left, right) => {
    const positionDelta = fantasyPositionRank(left.positionGroup) - fantasyPositionRank(right.positionGroup);
    if (positionDelta !== 0) return positionDelta;
    return (selectionsByPlayerId.get(left.playerId)?.slotIndex ?? 0) - (selectionsByPlayerId.get(right.playerId)?.slotIndex ?? 0);
  });
  const orderedBench = [...summary.benchPlayers].sort((left, right) => {
    const positionDelta = fantasyPositionRank(left.positionGroup) - fantasyPositionRank(right.positionGroup);
    if (positionDelta !== 0) return positionDelta;
    return (selectionsByPlayerId.get(left.playerId)?.slotIndex ?? 0) - (selectionsByPlayerId.get(right.playerId)?.slotIndex ?? 0);
  });

  useEffect(() => {
    if (!actionPlayerId) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setActionPlayerId(null);
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [actionPlayerId]);

  const actionSheet = actionPlayer && actionSelection && typeof document !== "undefined"
    ? createPortal(
        <div className="fixed inset-0 z-[100] flex items-end bg-slate-950/45" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setActionPlayerId(null);
        }}>
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="touch-player-actions-title"
            className="max-h-[min(82vh,42rem)] w-full overflow-y-auto rounded-t-2xl bg-white px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-3 shadow-elev sm:mx-auto sm:mb-4 sm:max-w-lg sm:rounded-2xl"
          >
            <div className="mx-auto mb-3 h-1 w-12 rounded-full bg-slate-300 sm:hidden" aria-hidden="true" />
            <div className="flex items-center gap-3 border-b border-slate-200 pb-3">
              <SquadPlayerPhoto player={actionPlayer} large />
              <div className="min-w-0 flex-1">
                <h4 id="touch-player-actions-title" className="truncate text-base font-bold text-ink">{actionPlayer.name}</h4>
                <p className="truncate text-sm text-slate-500">{fantasyPlayerTeamDisplayName(actionPlayer)} · {actionPlayer.positionGroup}</p>
              </div>
              <button type="button" autoFocus onClick={() => setActionPlayerId(null)} aria-label={localizedText(language, "Close player actions", "Закрыть действия игрока")} className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-700">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="mt-3 grid gap-2">
              <button type="button" onClick={() => { setActionPlayerId(null); onStartPoolReplacement(actionPlayer.playerId); }} className="inline-flex min-h-14 items-center gap-3 rounded border border-emerald-200 bg-emerald-50 px-4 py-3 text-left text-sm font-bold text-emerald-800">
                <Search className="h-5 w-5 shrink-0" />
                <span>
                  <span className="block"><I18nText en="Find a replacement" ru="Найти замену" /></span>
                  <span className="mt-0.5 block text-xs font-normal"><I18nText en="Pick from the pool and replace in one step" ru="Выбрать из пула и заменить одним действием" /></span>
                </span>
              </button>
              <button type="button" onClick={() => { setActionPlayerId(null); onStartLineupReplacement(actionPlayer.playerId); }} className="inline-flex min-h-14 items-center gap-3 rounded border border-sky-200 bg-sky-50 px-4 py-3 text-left text-sm font-bold text-sky-800">
                <ArrowLeftRight className="h-5 w-5 shrink-0" />
                <span>
                  <span className="block"><I18nText en="Swap XI / bench" ru="Поменять основу / запас" /></span>
                  <span className="mt-0.5 block text-xs font-normal"><I18nText en="Valid targets will appear in this squad" ru="Допустимые варианты появятся прямо в составе" /></span>
                </span>
              </button>
              {actionSelection.isStarter ? (
                <div className="grid grid-cols-2 gap-2">
                  <button type="button" onClick={() => { onToggleCaptain(actionPlayer.playerId); setActionPlayerId(null); }} aria-pressed={actionSelection.isCaptain} className={cn("inline-flex min-h-12 items-center justify-center gap-2 rounded border px-3 text-sm font-semibold", actionSelection.isCaptain ? "border-amber-400 bg-amber-100 text-amber-950" : "border-slate-200 bg-white text-slate-700")}>
                    <Crown className="h-4 w-4" /> C
                  </button>
                  <button type="button" onClick={() => { onToggleVice(actionPlayer.playerId); setActionPlayerId(null); }} aria-pressed={actionSelection.isViceCaptain} className={cn("inline-flex min-h-12 items-center justify-center gap-2 rounded border px-3 text-sm font-semibold", actionSelection.isViceCaptain ? "border-sky-400 bg-sky-100 text-sky-950" : "border-slate-200 bg-white text-slate-700")}>
                    VC
                  </button>
                </div>
              ) : null}
              <button type="button" onClick={() => { setActionPlayerId(null); onRemove(actionPlayer.playerId); }} className="inline-flex min-h-12 items-center justify-center gap-2 rounded border border-rose-200 bg-rose-50 px-4 text-sm font-semibold text-rose-800">
                <Trash2 className="h-4 w-4" />
                <I18nText en="Remove from squad" ru="Убрать из состава" />
              </button>
            </div>
          </div>
        </div>,
        document.body
      )
    : null;

  return (
    <div className="space-y-3" data-testid="squad-touch-roster">
      {replacementMode && replacementSource ? (
        <section className="rounded border-2 border-sky-400 bg-sky-50 p-3" aria-labelledby="lineup-replacement-title" data-testid="lineup-replacement-panel">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p id="lineup-replacement-title" className="text-xs font-semibold uppercase tracking-wide text-sky-700"><I18nText en="Choose the second player" ru="Выберите второго игрока" /></p>
              <p className="mt-1 truncate text-sm font-bold text-sky-950">{replacementSource.name} →</p>
            </div>
            <button type="button" onClick={onCancelLineupReplacement} className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded border border-sky-300 bg-white px-3 text-sm font-semibold text-sky-800">
              <X className="h-4 w-4" /><I18nText en="Cancel" ru="Отмена" />
            </button>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            {replacementTargets.map((player) => (
              <button key={player.playerId} type="button" onClick={() => onSelectLineupReplacement(player.playerId)} className="min-h-14 min-w-0 rounded border border-sky-200 bg-white px-3 py-2 text-left shadow-sm">
                <span className="block truncate text-sm font-bold text-ink">{compactPlayerDisplayName(player.name)}</span>
                <span className="mt-0.5 block truncate text-xs text-slate-500">{player.positionGroup} · {fantasyPlayerTeamDisplayName(player)}</span>
              </button>
            ))}
          </div>
        </section>
      ) : null}

      <div className="grid gap-3 md:grid-cols-2 md:items-start">
        <TouchSquadGroup
          title={<I18nText en="Starting XI" ru="Основа" />}
          players={orderedStarters}
          selectionsByPlayerId={selectionsByPlayerId}
          horizon={horizon}
          language={language}
          tone="starter"
          onActions={setActionPlayerId}
        />
        <TouchSquadGroup
          title={<I18nText en="Bench" ru="Запас" />}
          players={orderedBench}
          selectionsByPlayerId={selectionsByPlayerId}
          horizon={horizon}
          language={language}
          tone="bench"
          onActions={setActionPlayerId}
        />
      </div>
      {actionSheet}
    </div>
  );
}

function TouchSquadGroup({ title, players, selectionsByPlayerId, horizon, language, tone, onActions }: {
  title: ReactNode;
  players: FantasyPlannerPlayer[];
  selectionsByPlayerId: Map<string, FantasySquadSelection>;
  horizon: number;
  language: UiLanguage;
  tone: "starter" | "bench";
  onActions: (playerId: string) => void;
}) {
  return (
    <section className={cn("overflow-hidden rounded border", tone === "starter" ? "border-emerald-200 bg-emerald-50/50" : "border-slate-200 bg-slate-50")}>
      <div className={cn("flex min-h-11 items-center justify-between border-b px-3", tone === "starter" ? "border-emerald-200" : "border-slate-200")}>
        <h4 className="text-sm font-bold text-ink">{title}</h4>
        <span className="rounded-full bg-white px-2 py-0.5 text-xs font-bold text-slate-600">{players.length}</span>
      </div>
      <div className="divide-y divide-slate-200/80">
        {players.map((player) => {
          const selection = selectionsByPlayerId.get(player.playerId);
          return (
            <article key={player.playerId} className="flex min-h-[5.5rem] items-center gap-2.5 bg-white/80 p-2.5" data-player-id={player.playerId}>
              <SquadPlayerPhoto player={player} large />
              <div className="min-w-0 flex-1">
                <div className="flex min-w-0 items-center gap-1.5">
                  <h5 className="truncate text-sm font-bold text-ink">{compactPlayerDisplayName(player.name)}</h5>
                  {selection?.isCaptain ? <span className="shrink-0 rounded bg-amber-200 px-1.5 py-0.5 text-[10px] font-black text-amber-950">C</span> : null}
                  {selection?.isViceCaptain ? <span className="shrink-0 rounded bg-sky-200 px-1.5 py-0.5 text-[10px] font-black text-sky-950">VC</span> : null}
                </div>
                <p className="mt-0.5 truncate text-xs text-slate-500">{player.positionGroup} · {fantasyPlayerTeamDisplayName(player)}</p>
                <dl className="mt-1.5 flex items-center gap-3 text-xs">
                  <div><dt className="inline text-slate-500"><I18nText en="Price" ru="Цена" /> </dt><dd className="inline font-bold text-ink num-tabular">{formatNumber(player.price, 1)}</dd></div>
                  <div><dt className="inline text-slate-500"><I18nText en="Next" ru="След." /> </dt><dd className="inline font-bold text-emerald-700 num-tabular">{formatScore(nextFantasyPoints(player))}</dd></div>
                  <div><dt className="inline text-slate-500">{horizon}R </dt><dd className="inline font-bold text-sky-700 num-tabular">{formatScore(playerHorizonPoints(player, horizon))}</dd></div>
                </dl>
              </div>
              <button type="button" onClick={() => onActions(player.playerId)} aria-haspopup="dialog" aria-label={localizedText(language, `Actions for ${player.name}`, `Действия для ${player.name}`)} className="inline-flex min-h-12 shrink-0 items-center justify-center gap-1.5 rounded border border-slate-200 bg-white px-2.5 text-xs font-bold text-slate-700 shadow-sm">
                <MoreHorizontal className="h-4 w-4" />
                <I18nText en="Actions" ru="Действия" />
              </button>
            </article>
          );
        })}
        {players.length === 0 ? <p className="bg-white px-4 py-6 text-center text-sm text-slate-500"><I18nText en="No players" ru="Нет игроков" /></p> : null}
      </div>
    </section>
  );
}

function SquadPitch({
  summary,
  selectionsByPlayerId,
  horizon,
  language,
  captainId,
  viceCaptainId,
  draggedPlayerId,
  replacementMode,
  replacementSourcePlayerId,
  onRemove,
  onToggleCaptain,
  onToggleVice,
  onDragStart,
  onDragEnd,
  onDropToStarter,
  onDropToBench,
  onDropOnPlayer,
  onToggleReplacementMode,
  onReplacementPlayerClick
}: {
  summary: ReturnType<typeof summarizeFantasySquad>;
  selectionsByPlayerId: Map<string, FantasySquadSelection>;
  horizon: number;
  language: UiLanguage;
  captainId: string | null;
  viceCaptainId: string | null;
  draggedPlayerId: string | null;
  replacementMode: boolean;
  replacementSourcePlayerId: string | null;
  onRemove: (playerId: string) => void;
  onToggleCaptain: (playerId: string) => void;
  onToggleVice: (playerId: string) => void;
  onDragStart: (playerId: string) => void;
  onDragEnd: () => void;
  onDropToStarter: (playerId: string) => void;
  onDropToBench: (playerId: string) => void;
  onDropOnPlayer: (sourcePlayerId: string, targetPlayerId: string) => void;
  onToggleReplacementMode: () => void;
  onReplacementPlayerClick: (playerId: string) => void;
}) {
  const starterLines: Array<{ position: Exclude<FantasyPositionGroup, "UNK">; label: React.ReactNode }> = [
    { position: "DEF", label: <I18nText en="Defenders" ru="Защитники" /> },
    { position: "MID", label: <I18nText en="Midfielders" ru="Полузащитники" /> },
    { position: "FWD", label: <I18nText en="Forwards" ru="Нападающие" /> }
  ];
  const draggedSelection = draggedPlayerId ? selectionsByPlayerId.get(draggedPlayerId) : undefined;
  const replacementSourceSelection = replacementSourcePlayerId ? selectionsByPlayerId.get(replacementSourcePlayerId) : undefined;
  const replacementSourcePosition = replacementSourcePlayerId
    ? [...summary.starterPlayers, ...summary.benchPlayers].find((player) => player.playerId === replacementSourcePlayerId)?.positionGroup
    : undefined;
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
              replacementMode={replacementMode}
              replacementSourcePlayerId={replacementSourcePlayerId}
              replacementSourceSelection={replacementSourceSelection}
              replacementSourcePosition={replacementSourcePosition}
              onRemove={onRemove}
              onToggleCaptain={onToggleCaptain}
              onToggleVice={onToggleVice}
              onDragStart={onDragStart}
              onDragEnd={onDragEnd}
              onDropOnPlayer={onDropOnPlayer}
              onDropToStarter={onDropToStarter}
              onReplacementPlayerClick={onReplacementPlayerClick}
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
                replacementMode={replacementMode}
                replacementSourcePlayerId={replacementSourcePlayerId}
                replacementSourceSelection={replacementSourceSelection}
                replacementSourcePosition={replacementSourcePosition}
                onRemove={onRemove}
                onToggleCaptain={onToggleCaptain}
                onToggleVice={onToggleVice}
                onDragStart={onDragStart}
                onDragEnd={onDragEnd}
                onDropOnPlayer={onDropOnPlayer}
                onDropToStarter={onDropToStarter}
                onReplacementPlayerClick={onReplacementPlayerClick}
              />
            ))}
          </div>
        </div>
      </div>

      <div className="h-px bg-slate-300" />

      <div className="rounded border border-slate-200 bg-slate-50 p-2">
        <div className="mb-2 flex items-center justify-between gap-2">
          <h4 className="text-xs font-bold uppercase tracking-wide text-slate-500"><I18nText en="Bench" ru="Запас" /></h4>
          <button
            type="button"
            onClick={onToggleReplacementMode}
            aria-pressed={replacementMode}
            title={replacementMode
              ? localizedText(language, "Cancel replacement", "Отменить замену")
              : localizedText(language, "Replace", "Замена")}
            aria-label={replacementMode
              ? localizedText(language, "Cancel replacement", "Отменить замену")
              : localizedText(language, "Replace", "Замена")}
            className={cn(
              "inline-flex h-8 w-8 items-center justify-center rounded border transition",
              replacementMode
                ? "border-sky-400 bg-sky-100 text-sky-900"
                : "border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
            )}
          >
            {replacementMode ? <X className="h-3.5 w-3.5" /> : <ArrowLeftRight className="h-3.5 w-3.5" />}
            <span className="sr-only">{replacementMode ? <I18nText en="Cancel" ru="Отмена" /> : <I18nText en="Replace" ru="Замена" />}</span>
          </button>
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
              replacementMode={replacementMode}
              replacementSourcePlayerId={replacementSourcePlayerId}
              replacementSourceSelection={replacementSourceSelection}
              replacementSourcePosition={replacementSourcePosition}
              compact
              onRemove={onRemove}
              onToggleCaptain={onToggleCaptain}
              onToggleVice={onToggleVice}
              onDragStart={onDragStart}
              onDragEnd={onDragEnd}
              onDropOnPlayer={onDropOnPlayer}
              onReplacementPlayerClick={onReplacementPlayerClick}
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
  replacementMode,
  replacementSourcePlayerId,
  replacementSourceSelection,
  replacementSourcePosition,
  onRemove,
  onToggleCaptain,
  onToggleVice,
  onDragStart,
  onDragEnd,
  onDropOnPlayer,
  onDropToStarter,
  onReplacementPlayerClick
}: {
  label: React.ReactNode;
  players: FantasyPlannerPlayer[];
  selectionsByPlayerId: Map<string, FantasySquadSelection>;
  horizon: number;
  language: UiLanguage;
  captainId: string | null;
  viceCaptainId: string | null;
  draggedPlayerId: string | null;
  replacementMode: boolean;
  replacementSourcePlayerId: string | null;
  replacementSourceSelection: FantasySquadSelection | undefined;
  replacementSourcePosition: FantasyPositionGroup | undefined;
  onRemove: (playerId: string) => void;
  onToggleCaptain: (playerId: string) => void;
  onToggleVice: (playerId: string) => void;
  onDragStart: (playerId: string) => void;
  onDragEnd: () => void;
  onDropOnPlayer: (sourcePlayerId: string, targetPlayerId: string) => void;
  onDropToStarter: (playerId: string) => void;
  onReplacementPlayerClick: (playerId: string) => void;
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
            replacementMode={replacementMode}
            replacementSourcePlayerId={replacementSourcePlayerId}
            replacementSourceSelection={replacementSourceSelection}
            replacementSourcePosition={replacementSourcePosition}
            onRemove={onRemove}
            onToggleCaptain={onToggleCaptain}
            onToggleVice={onToggleVice}
            onDragStart={onDragStart}
            onDragEnd={onDragEnd}
            onDropOnPlayer={onDropOnPlayer}
            onReplacementPlayerClick={onReplacementPlayerClick}
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
  replacementMode = false,
  replacementSourcePlayerId = null,
  replacementSourceSelection,
  replacementSourcePosition,
  onRemove,
  onToggleCaptain,
  onToggleVice,
  onDragStart,
  onDragEnd,
  onDropOnPlayer,
  onReplacementPlayerClick
}: {
  player: FantasyPlannerPlayer;
  selection: FantasySquadSelection | undefined;
  horizon: number;
  language: UiLanguage;
  isCaptain?: boolean;
  isVice?: boolean;
  isDragging?: boolean;
  compact?: boolean;
  replacementMode?: boolean;
  replacementSourcePlayerId?: string | null;
  replacementSourceSelection?: FantasySquadSelection;
  replacementSourcePosition?: FantasyPositionGroup;
  onRemove: (playerId: string) => void;
  onToggleCaptain: (playerId: string) => void;
  onToggleVice: (playerId: string) => void;
  onDragStart: (playerId: string) => void;
  onDragEnd: () => void;
  onDropOnPlayer: (sourcePlayerId: string, targetPlayerId: string) => void;
  onReplacementPlayerClick: (playerId: string) => void;
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
  const isReplacementSource = replacementSourcePlayerId === player.playerId;
  const replacementTargetAllowed = !replacementSourcePlayerId
    || isReplacementSource
    || isSquadReplacementTarget(replacementSourceSelection, selection, replacementSourcePosition, player.positionGroup);
  const replacementActionLabel = !replacementSourcePlayerId
    ? localizedText(language, `Select ${player.name} for replacement`, `Выбрать ${player.name} для замены`)
    : isReplacementSource
      ? localizedText(language, `Clear ${player.name} selection`, `Снять выбор с ${player.name}`)
      : localizedText(language, `Swap with ${player.name}`, `Заменить на ${player.name}`);
  const cardPrimaryNextForecast = nextFantasyPoints(player);
  const cardPrimaryHorizonForecast = playerHorizonPoints(player, 3);
  const cardAlternativeNextForecast = nextAlternativeFantasyPoints(player);
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
      draggable={Boolean(selection) && !replacementMode}
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
        compact ? "w-[3.6rem] sm:w-[3.8rem] 2xl:w-16 3xl:w-[4.5rem]" : "w-[3.6rem] sm:w-[3.8rem] 2xl:w-[4.25rem] 3xl:w-20",
        "relative rounded border bg-white px-1 py-0.5 text-center shadow-sm transition [@media(pointer:fine)]:pb-5",
        replacementMode ? "cursor-pointer" : "cursor-grab active:cursor-grabbing",
        isCaptain ? "border-amber-400 ring-2 ring-amber-200" : player.isProviderPlaceholder ? "border-amber-300 bg-amber-50/70" : "border-white/70",
        isDragging && "opacity-55 ring-2 ring-sky-300"
      )}
    >
      {replacementMode ? (
        <button
          type="button"
          onClick={() => onReplacementPlayerClick(player.playerId)}
          aria-label={replacementActionLabel}
          title={replacementActionLabel}
          className={cn(
            "absolute inset-0 z-30 rounded border-2 transition",
            isReplacementSource
              ? "border-amber-400 bg-amber-100/20 ring-2 ring-amber-200"
              : replacementTargetAllowed
                ? "border-sky-400 bg-sky-100/10 hover:bg-sky-100/25"
                : "border-rose-300 bg-rose-100/20"
          )}
        >
          <span className="sr-only">{replacementActionLabel}</span>
        </button>
      ) : null}
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
      {player.isProviderPlaceholder ? (
        <p className="mt-1 rounded bg-amber-100 px-1 py-0.5 text-[7px] font-bold uppercase leading-tight text-amber-900">
          <I18nText en="not in database" ru="нет в базе" />
        </p>
      ) : <dl className="mt-0.5 text-[7px] leading-tight num-tabular">
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
      </dl>}
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

function BookmakerFavoritesTable({
  rows,
  roundLabel,
  language
}: {
  rows: FantasyBookmakerFavorite[];
  roundLabel: string | null;
  language: UiLanguage;
}) {
  const newestOddsAt = rows.reduce<string | null>((latest, row) => (
    !latest || new Date(row.oddsFetchedAt).getTime() > new Date(latest).getTime() ? row.oddsFetchedAt : latest
  ), null);
  const selectionExplanation = localizedText(
    language,
    "The favorite in each fixture is the team with the higher bookmaker probability of scoring over 1.5 goals. Clean-sheet probability is shown independently.",
    "Фаворит каждого матча — команда с большей букмекерской вероятностью забить больше 1.5 голов. Вероятность сухаря показана отдельно."
  );

  return (
    <section className="min-w-0 overflow-hidden rounded border border-slate-200 bg-white" aria-label={localizedText(language, "Bookmaker favorites", "Рыночные фавориты")} title={selectionExplanation}>
      <div className="flex items-center justify-between gap-1.5 border-b border-slate-200 bg-slate-50/80 px-2 py-1">
        <h4 className="min-w-0 truncate text-[10px] font-semibold uppercase tracking-wide text-slate-600"><I18nText en="Bookmaker favorites" ru="Рыночные фавориты" /></h4>
        <p className="shrink-0 text-right text-[9px] font-semibold text-slate-600" title={newestOddsAt ? `${localizedText(language, "Latest bookmaker update", "Последнее обновление линии")}: ${formatDateTime(newestOddsAt)}` : undefined}>
          Fonbet{roundLabel ? ` · ${roundLabel}` : ""}
        </p>
      </div>

      {rows.length > 0 ? (
        <table className="w-full table-fixed">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-[9px] font-semibold text-slate-500">
              <th scope="col" className="px-2 py-0.5 text-left font-semibold"><I18nText en="Favorite" ru="Фаворит" /></th>
              <th scope="col" className="w-12 px-0.5 py-0.5 text-right font-semibold leading-tight"><I18nText en="Clean sheet" ru="Сухарь" /></th>
              <th scope="col" className="w-14 px-0.5 py-0.5 text-right font-semibold leading-tight"><I18nText en="Team O1.5" ru="ИТБ 1.5" /></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.fixtureId} className="border-b border-slate-100 last:border-b-0">
                <td className="max-w-0 truncate px-2 py-0.5 text-[10px] font-semibold leading-4 text-ink" title={`${row.teamFullName} ${row.side === "H" ? "vs" : "@"} ${row.opponentFullName}`}>
                  {row.teamName}
                  <span className="ml-1 font-medium text-slate-500">{row.side === "H" ? "vs" : "@"} {row.opponentName}</span>
                </td>
                <td className="px-0.5 py-0.5 text-right">
                  <MarketProbabilityCell probability={row.cleanSheetProbability} tone="sky" label={localizedText(language, `Clean-sheet chance for ${row.teamFullName}`, `Шанс сухаря: ${row.teamFullName}`)} />
                </td>
                <td className="px-0.5 py-0.5 text-right">
                  <MarketProbabilityCell probability={row.teamOver15Probability} tone="emerald" label={localizedText(language, `Chance ${row.teamFullName} scores over 1.5`, `Шанс ${row.teamFullName} забить больше 1.5`)} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="px-2 py-3 text-center text-[11px] text-slate-500" role="status">
          <I18nText en="No fresh complete bookmaker lines for this round." ru="На этот тур нет свежих полных букмекерских линий." />
        </p>
      )}
    </section>
  );
}

function MarketProbabilityCell({ probability, tone, label }: { probability: number; tone: "sky" | "emerald"; label: string }) {
  const percent = Math.round(probability * 100);
  return (
    <span className={cn("inline-block rounded px-0.5 text-[11px] font-bold leading-4 num-tabular", tone === "sky" ? "bg-sky-50 text-sky-700" : "bg-emerald-50 text-emerald-700")} aria-label={`${label}: ${percent}%`} title={`${label}: ${percent}%`}>
      {percent}%
    </span>
  );
}

function transferSuggestionRoundLabel(source: TransferSuggestionForecastSource, rounds: number, language: UiLanguage) {
  return localizedText(language, `${source} ${rounds}R`, `${source === "FO" ? "ФО" : source} ${rounds}Т`);
}

function TransferSuggestionPlayerCard({
  player,
  direction,
  source,
  language,
  isPriorityReplacement = false,
  isStartingGoalkeeperZero = false
}: {
  player: FantasyPlannerPlayer;
  direction: "out" | "in";
  source: TransferSuggestionForecastSource;
  language: UiLanguage;
  isPriorityReplacement?: boolean;
  isStartingGoalkeeperZero?: boolean;
}) {
  const selectedNext = transferSuggestionForecastNextPoints(player, source);
  const selectedThreeRounds = transferSuggestionForecastHorizonPoints(player, source, 3);
  const fixtures = fixtureChipPresentations(player.fixtures, player.fixtureDifficulties ?? [], 2, player.fixtureFullNames).slice(0, 2);
  const selectedNextLabel = transferSuggestionRoundLabel(source, 1, language);
  const selectedThreeRoundsLabel = transferSuggestionRoundLabel(source, 3, language);
  const directionLabel = direction === "out"
    ? localizedText(language, "Out", "Убрать")
    : localizedText(language, "In", "Взять");

  return (
    <article className={cn("min-w-0 rounded border p-1", direction === "out" ? "border-rose-200 bg-rose-50/50" : "border-emerald-200 bg-emerald-50/50")}>
      <div className="flex min-w-0 items-center gap-1">
        <span className={cn("inline-flex shrink-0 rounded px-1 py-px text-[8px] font-bold uppercase tracking-wide", direction === "out" ? "bg-rose-100 text-rose-700" : "bg-emerald-100 text-emerald-700")}>{directionLabel}</span>
        <p className="min-w-0 flex-1 truncate text-[10px] font-bold text-ink" title={player.name}>{compactPlayerDisplayName(player.name)}</p>
        <span className={cn("inline-flex shrink-0 rounded px-1 py-px text-[8px] font-bold", positionPillClass(player.positionGroup))}>{player.positionGroup}</span>
      </div>
      <p className="mt-0.5 truncate text-[9px] text-slate-600 num-tabular" title={player.teamName}>
        {player.teamShortName ?? player.teamName} · {player.priceSource === "ESTIMATED" ? "~" : ""}{formatNumber(player.price, 1)} · {selectedNextLabel} <strong className="text-ink">{formatScore(selectedNext)}</strong>{selectedThreeRounds === null ? "" : <> · {selectedThreeRoundsLabel} <strong className="text-ink">{formatScore(selectedThreeRounds)}</strong></>}
      </p>
      {isPriorityReplacement || isStartingGoalkeeperZero ? (
        <p className={cn("mt-0.5 truncate rounded px-1 py-px text-[8px] font-bold", isPriorityReplacement ? "bg-amber-100 text-amber-900" : "bg-slate-200 text-slate-700")}>
          {isPriorityReplacement
            ? <I18nText en={`0 ${source} FP · priority`} ru={`0 ФО ${source} · приоритет`} />
            : <I18nText en={`GK 0 ${source} FP`} ru={`ВР 0 ФО ${source}`} />}
        </p>
      ) : null}
      {fixtures.length > 0 ? (
        <div className="mt-0.5 min-w-0 overflow-hidden">
          <FdrRow fixtures={fixtures} className="flex-nowrap gap-0.5 overflow-hidden [&_.fdr-pill]:max-w-[3rem] [&_.fdr-pill]:px-1 [&_.fdr-pill]:text-[8px]" />
        </div>
      ) : null}
    </article>
  );
}

function TransferSuggestionPlayerFallback({
  name,
  teamName,
  positionGroup,
  direction
}: {
  name: string;
  teamName: string;
  positionGroup: FantasyPositionGroup;
  direction: "out" | "in";
}) {
  return (
    <div className={cn("min-w-0 rounded border p-1", direction === "out" ? "border-rose-200 bg-rose-50/50" : "border-emerald-200 bg-emerald-50/50")}>
      <p className="truncate text-[10px] font-bold text-ink" title={name}>{compactPlayerDisplayName(name)}</p>
      <p className="truncate text-[9px] text-slate-600" title={teamName}>{teamName} · {positionGroup}</p>
    </div>
  );
}

function TransferSuggestionCaptain({ player, source }: { player: FantasyPlannerPlayer; source: TransferSuggestionForecastSource }) {
  const selectedNext = transferSuggestionForecastNextPoints(player, source);
  const captainPoints = selectedNext === null ? null : selectedNext * 2;

  return (
    <div className="mt-1 flex min-w-0 items-center gap-1 rounded border border-amber-200 bg-amber-50 px-1.5 py-1 text-left text-[9px] text-amber-950">
      <Crown className="h-3 w-3 shrink-0 fill-amber-500 text-amber-600" />
      <strong className="truncate" title={player.name}><I18nText en="Captain" ru="Капитан" />: {compactPlayerDisplayName(player.name)}</strong>
      <span className="ml-auto shrink-0 font-bold num-tabular">{source} ×2 {formatScore(captainPoints)}</span>
    </div>
  );
}

function SquadPlayerPhoto({ player, large = false }: { player: FantasyPlannerPlayer; large?: boolean }) {
  const [failed, setFailed] = useState(false);
  if (!player.photoUrl || failed) {
    return (
      <div aria-hidden="true" className={cn("flex shrink-0 items-center justify-center rounded-full bg-slate-200 font-black text-slate-500 ring-1 ring-white", large ? "h-12 w-12 text-sm" : "mx-auto mt-0.5 h-7 w-7 text-[9px]")}>
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
      className={cn("shrink-0 rounded-full bg-slate-100 object-cover object-top ring-1 ring-white", large ? "h-12 w-12" : "mx-auto mt-0.5 h-7 w-7")}
    />
  );
}

function fantasyForecastTitle(player: FantasyPlannerPlayer, language: UiLanguage) {
  const lines = [
    player.name,
    localizedText(language, `Next-round forecast: ${formatScore(nextFantasyPoints(player))} FP`, `Прогноз на следующий тур: ${formatScore(nextFantasyPoints(player))} FP`)
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
    "Penalty save FP": "ФО за отражённые пенальти",
    "Penalty miss FP": "ФО за незабитые пенальти",
    "Own goal FP": "ФО за автоголы",
    "Bonus FP": "Бонусные ФО",
    "Defensive contribution FP": "ФО за защитные действия",
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
  const lines = [localizedText(
    language,
    `Transfer fallback: ${formatNumber(currentMatches, 0)} current-club matches + ${formatNumber(previousMatches, 0)} matches for ${previousTeam}. Previous-club minutes and forecast event volumes are weighted by ${formatNumber(factor, 2)} until five current-club matches are available.`,
    `Резервная выборка трансфера: ${formatNumber(currentMatches, 0)} матчей за текущий клуб + ${formatNumber(previousMatches, 0)} матчей за ${previousTeam}. Минуты и объёмы прогнозных событий прошлого клуба учитываются с коэффициентом ${formatNumber(factor, 2)}, пока не накопится пять матчей за текущий клуб.`
  )];
  if (inputs.transferRatePenalty !== null && inputs.transferRatePenalty !== undefined && inputs.transferRatePenalty < 0.999) {
    lines.push(localizedText(
      language,
      `Effective per-90 transfer penalty: raw forecast rates × ${formatNumber(inputs.transferRatePenalty, 3)}. Unlike the old calculation, this factor no longer cancels between event totals and minutes.`,
      `Итоговый трансферный штраф per 90: исходные прогнозные темпы × ${formatNumber(inputs.transferRatePenalty, 3)}. В отличие от старого расчёта, коэффициент больше не сокращается между объёмом событий и минутами.`
    ));
  }
  return lines;
}

function sparseTeamAttackAllocationLines(
  inputs: FantasyProjectionFixtureInputs | null | undefined,
  language: UiLanguage
) {
  if (!inputs?.sparseTeamAttackAllocationGuard) return [];
  const meaningfulPlayers = inputs.teamAttackMeaningfulPlayers ?? 0;
  const candidates = inputs.teamAttackAllocationCandidates ?? 0;
  const eventMinutes = inputs.teamAttackEventExposureMinutes ?? 0;
  const coverage = (inputs.teamAttackMinuteCoverage ?? 0) * 100;
  const goalReserve = inputs.teamAttackGoalReserveWeight ?? 0;
  const assistReserve = inputs.teamAttackAssistReserveWeight ?? 0;
  return [localizedText(
    language,
    `Sparse team-history guard: only ${formatNumber(meaningfulPlayers, 0)} of ${formatNumber(candidates, 0)} candidates have at least 15 event minutes; known roster exposure is ${formatNumber(eventMinutes, 1)} of 990 minutes (${formatNumber(coverage, 1)}%). Unmodelled teammates reserve goal-allocation weight ${formatNumber(goalReserve, 3)} and assist-allocation weight ${formatNumber(assistReserve, 3)}, so this player receives only the evidenced share of team xG/xA instead of inheriting the missing players' share.`,
    `Защита от неполной истории команды: только ${formatNumber(meaningfulPlayers, 0)} из ${formatNumber(candidates, 0)} кандидатов имеют хотя бы 15 минут экспозиции событий; известная экспозиция состава — ${formatNumber(eventMinutes, 1)} из 990 минут (${formatNumber(coverage, 1)}%). Неописанные игроки резервируют вес распределения голов ${formatNumber(goalReserve, 3)} и ассистов ${formatNumber(assistReserve, 3)}, поэтому футболист получает только подтверждённую долю командных xG/xA, а не долю отсутствующих в истории партнёров.`
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
  const minuteFloor = inputs.rosterStarterMinuteFloor ?? 60;
  const finalReliability = inputs.per90UpliftReliability ?? 0;
  const sampleReliability = inputs.per90SampleReliability ?? finalReliability;
  const roleReliability = inputs.starterRoleReliability ?? finalReliability;
  const historicalStartProbability = inputs.historicalStartProbability ?? 0;
  const baseMinuteReliability = inputs.starterBaseMinuteReliability ?? (
    minuteFloor > 0 ? Math.min(1, Math.max(0, inputs.baseExpectedMinutes / minuteFloor)) : 1
  );
  const lines = [localizedText(
    language,
    `Nearest-fixture starter floor: max(base ${formatNumber(inputs.baseExpectedMinutes, 1)}, ${formatNumber(minuteFloor, 0)}) = ${formatNumber(inputs.expectedMinutes, 1)} expected minutes; adjustment ${adjustment >= 0 ? "+" : ""}${formatNumber(adjustment, 1)}. Goalkeepers marked as starters use 90 minutes; outfield starters use at least 60. It is not applied to later fixtures.`,
    `Минимум основы только на ближайший матч: max(базовые ${formatNumber(inputs.baseExpectedMinutes, 1)}, ${formatNumber(minuteFloor, 0)}) = ${formatNumber(inputs.expectedMinutes, 1)} ожидаемых минут; корректировка ${adjustment >= 0 ? "+" : ""}${formatNumber(adjustment, 1)}. У отмеченного вратаря используются 90 минут, у полевого — минимум 60. На последующие матчи правило не переносится.`
  )];
  if (
    inputs.eventExposureMinutes !== null &&
    inputs.eventExposureMinutes !== undefined &&
    inputs.eventExposureMinutes < inputs.expectedMinutes - 0.01
  ) {
    lines.push(localizedText(
      language,
      `Cautious per-90 exposure: base ${formatNumber(inputs.baseExpectedMinutes, 1)} + starter uplift ${formatNumber(adjustment, 1)} × final reliability min(sample ${formatNumber(sampleReliability * 100, 1)}% from ${formatNumber(inputs.per90SampleMinutes ?? 0, 0)} historical minutes; role ${formatNumber(roleReliability * 100, 1)}% from max(historical starts ${formatNumber(historicalStartProbability * 100, 1)}%, base/floor ${formatNumber(baseMinuteReliability * 100, 1)}%)) = ${formatNumber(finalReliability * 100, 1)}% = ${formatNumber(inputs.eventExposureMinutes, 1)} event minutes. Appearance and 60-minute points still use ${formatNumber(inputs.expectedMinutes, 1)} minutes; xG/xA, recoveries, saves and cards use the cautious exposure.`,
      `Осторожная экспозиция per 90: базовые ${formatNumber(inputs.baseExpectedMinutes, 1)} + прибавка старта ${formatNumber(adjustment, 1)} × итоговая надёжность min(выборка ${formatNumber(sampleReliability * 100, 1)}% по ${formatNumber(inputs.per90SampleMinutes ?? 0, 0)} минутам истории; роль ${formatNumber(roleReliability * 100, 1)}% из max(исторические старты ${formatNumber(historicalStartProbability * 100, 1)}%, базовые минуты/минимум ${formatNumber(baseMinuteReliability * 100, 1)}%)) = ${formatNumber(finalReliability * 100, 1)}% = ${formatNumber(inputs.eventExposureMinutes, 1)} минуты событий. Очки за выход и 60 минут по-прежнему используют ${formatNumber(inputs.expectedMinutes, 1)} минуты; xG/xA, возвраты, сейвы и карточки используют осторожную экспозицию.`
    ));
    if (
      inputs.preRoleXgRatePer90 != null && inputs.roleAdjustedXgRatePer90 != null && inputs.positionXgPriorPer90 != null &&
      inputs.preRoleXaRatePer90 != null && inputs.roleAdjustedXaRatePer90 != null && inputs.positionXaPriorPer90 != null
    ) {
      lines.push(localizedText(
        language,
        `Starter-role rate blend (${formatNumber(roleReliability * 100, 1)}% historical-role reliability): xG/90 ${formatNumber(inputs.preRoleXgRatePer90, 3)} → ${formatNumber(inputs.roleAdjustedXgRatePer90, 3)} toward the ${formatNumber(inputs.positionXgPriorPer90, 3)} position prior; xA/90 ${formatNumber(inputs.preRoleXaRatePer90, 3)} → ${formatNumber(inputs.roleAdjustedXaRatePer90, 3)} toward ${formatNumber(inputs.positionXaPriorPer90, 3)}. This prevents substitute per-90 production from being copied unchanged into a new starter role.`,
        `Смешивание темпа при смене роли (${formatNumber(roleReliability * 100, 1)}% надёжности исторической роли): xG/90 ${formatNumber(inputs.preRoleXgRatePer90, 3)} → ${formatNumber(inputs.roleAdjustedXgRatePer90, 3)} к позиционному prior ${formatNumber(inputs.positionXgPriorPer90, 3)}; xA/90 ${formatNumber(inputs.preRoleXaRatePer90, 3)} → ${formatNumber(inputs.roleAdjustedXaRatePer90, 3)} к ${formatNumber(inputs.positionXaPriorPer90, 3)}. Так темп запасного per 90 не переносится без изменений в новую роль стартера.`
      ));
    }
  }
  return lines;
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

function forecastEfficiencyTitle(
  player: FantasyPlannerPlayer,
  language: UiLanguage,
  forecastLabel: string,
  forecast: number | null,
  efficiency: number | null
) {
  const price = typeof player.price === "number" && Number.isFinite(player.price) && player.price > 0 ? player.price : null;
  const lines = [
    localizedText(
      language,
      `${player.name} · ${forecastLabel} asset efficiency: ${efficiency === null ? "—" : formatNumber(efficiency, 3)} points per price unit.`,
      `${player.name} · эффективность ${forecastLabel}: ${efficiency === null ? "—" : formatNumber(efficiency, 3)} очка на единицу стоимости.`
    )
  ];
  if (forecast === null || !Number.isFinite(forecast)) {
    lines.push(localizedText(language, `No ${forecastLabel} forecast is available.`, `Прогноз ${forecastLabel} отсутствует.`));
  } else if (price === null) {
    lines.push(localizedText(language, "A positive verified Sports.ru price is required.", "Нужна положительная подтверждённая цена Sports.ru."));
  } else {
    lines.push(`${formatNumber(forecast, 2)} ÷ ${formatNumber(price, 2)} = ${formatNumber(efficiency, 3)}`);
    lines.push(localizedText(
      language,
      "This is a relative asset-value indicator for the next round, not an additional points forecast.",
      "Это относительный показатель выгодности ассета на следующий тур, а не дополнительный прогноз очков."
    ));
  }
  return lines.join("\n");
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

function compactFormulaArithmeticLines(
  language: UiLanguage,
  formulaData: NonNullable<FantasyPlannerPlayer["projectionFormula"]> | NonNullable<FantasyPlannerPlayer["alternativeProjectionFormula"]>,
  totalOverride: number | null
) {
  const total = totalOverride === null ? formulaData.total : totalOverride;
  const lines = [`${language === "ru" ? "Итого" : "Total"}: ${formatNumber(total, 3)}`];
  for (const term of formulaData.terms) {
    const expression = readableResolvedFormulaExpression(term.resolvedExpression, language);
    const sign = term.sign < 0 ? "−" : "+";
    const fixturePrefix = term.fixtureLabel ? `[${term.fixtureLabel}] ` : "";
    lines.push(`${sign} ${fixturePrefix}${expression} = ${formatNumber(term.value, 3)}`);
  }
  return lines;
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
  lines.push(...sparseTeamAttackAllocationLines(fixtureInputs, language));

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

function buildFplForecastBreakdownLines(
  player: FantasyPlannerPlayer,
  language: UiLanguage,
  breakdown: NonNullable<FantasyPlannerPlayer["fplForecastBreakdown"]>,
  totalLabel: string
) {
  const lines: string[] = [];
  if ((breakdown.fixtureCount ?? 1) > 1) {
    lines.push(localizedText(
      language,
      `- Provider-round total: ${breakdown.fixtureCount} fixtures scored independently and summed.`,
      `- Итог provider-тура: ${breakdown.fixtureCount} матча рассчитаны отдельно и сложены.`
    ));
  }
  const defensiveThreshold = player.positionGroup === "DEF" ? 10
    : player.positionGroup === "MID" || player.positionGroup === "FWD" ? 12
    : null;
  const defensiveMetric = player.positionGroup === "DEF" ? "CBIT" : "CBIRT";
  const explanation = (en: string, ru: string) => localizedText(language, en, ru);
  const componentRows: Array<[string, number, string]> = [
    ["Appearance FP", breakdown.appearance, explanation("official FPL appearance probabilities", "официальные правила FPL и вероятности выхода")],
    ["Goal FP", breakdown.goals, explanation("expected goals × official position weight", "ожидаемые голы × официальный вес позиции")],
    ["Assist FP", breakdown.assists, explanation("expected assists × 3", "ожидаемые ассисты × 3")],
    ["Clean sheet FP", breakdown.cleanSheets, explanation("expected clean sheets × official position weight", "ожидаемые сухие матчи × официальный вес позиции")],
    ["Save FP", breakdown.saves, player.positionGroup === "GK" ? explanation("expected complete groups of 3 saves", "ожидаемые полные группы по 3 сейва") : "not applicable for this position"],
    ["Goals conceded FP", breakdown.goalsConceded, player.positionGroup === "GK" || player.positionGroup === "DEF" ? explanation("negative expected complete groups of 2 conceded", "штраф за ожидаемые полные группы по 2 пропущенных гола") : "not applicable for this position"],
    ["Yellow card FP", breakdown.yellowCards, explanation("expected yellow cards × −1", "ожидаемые жёлтые карточки × −1")],
    ["Red card FP", breakdown.redCards, explanation("expected red cards × −3", "ожидаемые красные карточки × −3")],
    ["Penalty save FP", breakdown.penaltySaves, player.positionGroup === "GK" ? explanation("not forecast without official event probability", "нет прогноза без официальной вероятности события") : "not applicable for this position"],
    ["Penalty miss FP", breakdown.penaltyMisses, explanation("not forecast without official event probability", "нет прогноза без официальной вероятности события")],
    ["Own goal FP", breakdown.ownGoals, explanation("not forecast without official event probability", "нет прогноза без официальной вероятности события")],
    ["Bonus FP", breakdown.bonus, explanation("appearance probability × official finalized bonus mean", "вероятность выхода × среднее официальных итоговых бонусов")],
    ["Defensive contribution FP", breakdown.defensiveContributions, defensiveThreshold === null
      ? "not applicable for this position"
      : explanation(
          `appearance probability × official finalized ${defensiveThreshold}-${defensiveMetric} threshold outcomes; capped at +2`,
          `вероятность выхода × доля официальных матчей с порогом ${defensiveThreshold} ${defensiveMetric}; максимум +2`
        )]
  ];
  componentRows.forEach(([label, value, formula]) => addProjectionTermLine(lines, language, label, value, formula));
  lines.push(formulaContributionTotalLine(language, totalLabel, componentRows.map(([, value]) => value), breakdown.total));
  lines.push(localizedText(
    language,
    "Generic recoveries are excluded: FPL does not award one point per three recoveries.",
    "Обычные возвраты исключены: в FPL нет начисления одного очка за три возврата."
  ));
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
  lines.push(...sparseTeamAttackAllocationLines(fixtureInputs, language));

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
  if (player.projectionFormula) {
    return compactFormulaArithmeticLines(language, player.projectionFormula, nextForecast).join("\n");
  }
  const fixtureCount = player.roundFixtureCounts?.[0] ?? 0;
  const lines = [localizedText(
    language,
    `Primary forecast for next provider round${fixtureCount > 1 ? ` (${fixtureCount} fixtures)` : ""}: ${formatScore(nextForecast)} FP`,
    `Основной прогноз на следующий тур провайдера${fixtureCount > 1 ? ` (${fixtureCount} матча)` : ""}: ${formatScore(nextForecast)} ФО`
  )];
  if (player.fplForecastBreakdown) {
    lines.push(...buildFplForecastBreakdownLines(player, language, player.fplForecastBreakdown, "Total"));
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
  const nextAlternative = nextAlternativeFantasyPoints(player);
  if (player.alternativeProjectionFormula) {
    return compactFormulaArithmeticLines(language, player.alternativeProjectionFormula, nextAlternative).join("\n");
  }
  const fixtureCount = player.roundFixtureCounts?.[0] ?? 0;
  const lines = [localizedText(
    language,
    `Alternative forecast for next provider round${fixtureCount > 1 ? ` (${fixtureCount} fixtures)` : ""}: ${formatScore(nextAlternative)} FP`,
    `Альтернативный прогноз на следующий тур провайдера${fixtureCount > 1 ? ` (${fixtureCount} матча)` : ""}: ${formatScore(nextAlternative)} ФО`
  )];
  if (player.alternativeFplForecastBreakdown) {
    lines.push(...buildFplForecastBreakdownLines(player, language, player.alternativeFplForecastBreakdown, "Alternative total"));
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
  const values = player.alternativeRoundPoints?.slice(0, horizon) ?? [];
  const lines = [localizedText(language, `Alternative forecast total over ${horizon} rounds: ${formatScore(alternativeTotal)} FP`, `Альтернативный прогноз на ${horizon} тура: ${formatScore(alternativeTotal)} ФО`)];
  lines.push(localizedText(language, "Round-by-round values:", "По турам:"));
  for (let index = 0; index < horizon; index += 1) {
    const value = values[index];
    lines.push(
      typeof value === "number" && Number.isFinite(value)
        ? localizedText(language, `Round ${index + 1}: ${formatScore(value)} FP`, `Тур ${index + 1}: ${formatScore(value)} ФО`)
        : localizedText(language, `Round ${index + 1}: unavailable`, `Тур ${index + 1}: нет прогноза`)
    );
  }
  if (alternativeTotal === null) {
    lines.push(localizedText(
      language,
      "The horizon total is withheld because at least one requested round has no valid Alt projection. Missing rounds are not silently treated as zero.",
      "Итог горизонта не показывается: хотя бы для одного выбранного тура нет корректного прогноза Alt. Пропущенные туры не подменяются нулём."
    ));
  }
  if (horizon > 1) {
    lines.push(localizedText(
      language,
      "The manual starting-XI minute floor affects only Round 1; later rounds use the player's ordinary expected minutes.",
      "Ручная отметка основы повышает минуты только в туре 1; дальнейшие туры используют обычный прогноз минут игрока."
    ));
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
    "Alternative forecast for the next provider round; double-round fixtures are projected independently and summed.",
    "Альтернативный прогноз FP на следующий тур провайдера; матчи двойного тура считаются отдельно и складываются. Только для просмотра: не используется в автоподборе, ценности, трансферах и очках тура."
  );
}

function alternativeFiveRoundFpTitle(language: UiLanguage, horizon = 5) {
  return localizedText(
    language,
    `Total alternative forecast over ${horizon} rounds.`,
    "Суммарный альтернативный прогноз FP на следующие пять туров, рассчитанный по матчам каждого тура."
  );
}

function playerPoolColumnTitles(language: UiLanguage, horizon: number) {
  return {
    player: localizedText(language, "Player name and primary fantasy-points forecast.", "Имя игрока и основной прогноз fantasy-очков."),
    team: localizedText(language, "Player's club. The compact code is shown; hover a row value for the full name.", "Клуб игрока. Показан короткий код; полное название доступно при наведении на значение."),
    position: localizedText(language, "Fantasy position: goalkeeper, defender, midfielder, or forward.", "Фэнтези-позиция: вратарь, защитник, полузащитник или нападающий."),
    price: localizedText(language, "Current fantasy price. A tilde marks an estimated price.", "Текущая фэнтези-цена. Тильда означает оценочную цену."),
    next: localizedText(language, "Primary fantasy-points forecast for the next provider round; double-round fixtures are summed.", "Основной прогноз fantasy-очков на следующий тур провайдера; матчи двойного тура складываются."),
    foontasyNext: localizedText(language, "Foontasy current-round forecast (FFO).", "Прогноз Foontasy на текущий тур (FFO)."),
    alternative: alternativePredictedFpTitle(language),
    alternativeFive: alternativeFiveRoundFpTitle(language, horizon),
    horizon: localizedText(language, `Total primary forecast over the selected ${horizon}-round horizon.`, `Суммарный основной прогноз на выбранном горизонте в ${horizon} туров.`),
    fixtures: localizedText(language, "Upcoming opponents. Home fixtures are bold; fill colour shows difficulty from blue (easy) to red (hard). Hover an opponent for the full club name.", "Ближайшие соперники. Домашние матчи выделены жирным; цвет заливки показывает сложность от синего (легко) до красного (сложно). Полное название клуба доступно при наведении."),
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
        "Consensus of three forecasts weighted by minutes, starts and confidence; caps rotation risks and estimated prices.",
        "Консенсус трёх прогнозов с весами по минутам, стартам и уверенности; режет ротационные риски и оценочные цены."
      )
    };
  }
  if (strategy === "upside") {
    return {
      label: localizedText(language, "Upside", "Потенциал"),
      description: localizedText(
        language,
        "Chases the consensus ceiling and useful variance (capped), for captains and differentials.",
        "Гонится за потолком консенсуса и полезным (ограниченным) разбросом — под капитанов и дифференциалы."
      )
    };
  }
  return {
    label: localizedText(language, "Balanced", "Баланс"),
    description: localizedText(
      language,
      "Maximizes the blended forecast (own model + alt formula + Foontasy) over the selected horizon.",
      "Максимизирует смешанный прогноз (своя модель + альт-формула + Foontasy) на выбранном горизонте."
    )
  };
}

function signedScore(value: number) {
  if (value > 0) return `+${formatScore(value)}`;
  return formatScore(value);
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
    projectedFixtureComponents: null,
    projectionComponents: null,
    fplForecastBreakdown: null,
    projectionFormula: null,
    alternativeProjectedFixtureComponents: null,
    alternativeProjectionComponents: null,
    alternativeFplForecastBreakdown: null,
    alternativeProjectionFormula: null,
    expectedMinutes: null,
    startProbability: null,
    alternativeRoundPoints: player.alternativeRoundPoints?.slice(roundOffset),
    roundPoints: player.roundPoints.slice(roundOffset),
    roundFixtureCounts: player.roundFixtureCounts?.slice(roundOffset),
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

function fantasyRoundPlansFingerprint(plans: FantasySquadRoundPlan[]) {
  return JSON.stringify(plans.map((plan) => ({
    roundOffset: plan.roundOffset,
    linkedToPrevious: plan.linkedToPrevious,
    selections: plan.selections.map((selection) => [
      selection.playerId,
      selection.isStarter,
      selection.isCaptain,
      selection.isViceCaptain,
      selection.slotIndex
    ])
  })));
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

function squadVariantHref(routePath: string, leagueId: string, season: string, squadId: string | null, historySettings: FantasyHistorySettings) {
  const params = new URLSearchParams({ leagueId, season });
  applyFantasyHistorySearchParams(params, historySettings);
  if (squadId) params.set("squadId", squadId);
  return `${routePath}?${params.toString()}`;
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
  visibleColumnKeys: string[],
  provider = "SPORTS_RU"
) {
  const optionalColumnsByKey = new Map(playerPoolOptionalColumns(players, horizon, language, provider).map((column) => [column.key, column]));
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
      provider,
      language,
      horizon,
      columns,
      rows: players.map((player) => ({
        player: provider === "FPL" ? player.name : player.fotmobName ?? player.name,
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
