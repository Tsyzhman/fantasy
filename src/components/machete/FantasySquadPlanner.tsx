"use client";
import { downloadPlayerPoolXlsx, loadSquadFilterPresets, saveSquadFilterPreset, removeSquadFilterPreset, recordGlobalRecommendation } from "./planner-data";

import { readStoredSquadCaptains, writeStoredSquadCaptains, withCaptainState, sanitizeCaptainRoles, normalizeInitialSelections, fantasyPlayerAtRoundOffset, cloneFantasyRoundPlans, fantasyRoundPlansFingerprint, normalizePlannerRoundPlans, promoteStarter } from "./planner-squad-commands";

import { type UiLanguage, fantasyForecastTitle, foontasyForecastTitle, playerPrimaryNextForecastTitle, playerPrimaryHorizonForecastTitle, alternativePlayerForecastTitle, alternativePlayerHorizonForecastTitle, squadCardForecastTitle } from "./planner-explanations";
import { type PlayerPoolOptionalColumn, PlayerPoolFilterPresets, PlayerPoolAdvancedFilterMenu, filterPlayerPoolByNameQuery, PlayerPoolNameSearch, CustomizablePlayerPoolTable, playerPoolOptionalColumns, playerPoolFilterValue, sortPlayerPoolRows, customPlayerPoolColumnValue, PlayerPoolTable, SquadPlayerPhoto, localizeAddBlockReason, fantasyPlayerTeamDisplayName, positionPillClass } from "./PlayerPool";

export { filterPlayerPoolByNameQuery, sortPlayerPoolRows, PlayerPoolTable } from "./PlayerPool";



import { GlobalStrategyPanel } from "./GlobalStrategyPanel";
import { draftPrefix } from "./planner-draft";
import { usePlannerDraft } from "./use-planner-draft";
import { ColumnResizeHandle } from "./ColumnResizeHandle";
/** @spec spec://modules/machete/FEAT-004-rotation-risk#scenarios */
import { currentRotationRisk, rotationRiskDescription } from "@/machete/rotation-risk";
import type { GlobalStrategyAnalysis, GlobalSquadResult } from "@/machete/global-strategy-planner";
import { globalStrategyPoolEvaluation, isGlobalRecommendationCurrent } from "@/machete/global-strategy-planner";
import type { GlobalStrategyRequestContext } from "@/machete/global-strategy";

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
import { SportsTrendsPanel } from "@/components/machete/SportsTrendsPanel";
import { PlatformTransferTrendsPanel } from "@/components/machete/PlatformTransferTrendsPanel";
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
import { fantasyPlayerMatchesNameQuery } from "@/machete/player-identity";
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
  userId: string;
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
  contestId?: string | null;
  historySettings: FantasyHistorySettings;
  initialVisiblePlayerPoolColumns: string[];
  initialPlayerPoolColumnWidths: Record<string, number>;
};

const squadDragDataType = "application/x-fantasy-player-id";
const fantasySquadOptimizationSafetyTimeoutMs = 15_000;
type MobileTab = "squad" | "pool" | "suggestions";
type SportsImportNotice = {
  tone: "progress" | "waiting" | "success" | "error";
  text: string;
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

function optimizeFantasySquadOffThread(input: FantasySquadOptimizationInput, startersOnly = false, signal?: AbortSignal) {
  if (typeof Worker === "undefined") return input.strategy === "GLOBAL_AUTO" ? Promise.reject(new Error("WORKER_REQUIRED")) : Promise.resolve({ selections: optimizeFantasySquad(input), analysis: null });

  return new Promise<GlobalSquadResult>((resolve, reject) => {
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
      signal?.removeEventListener("abort", abort);
    };
    const abort = () => { finish(); reject(new Error("OPTIMIZER_CANCELLED")); };
    if (signal?.aborted) { abort(); return; }
    signal?.addEventListener("abort", abort, { once: true });

    worker.onmessage = (event: MessageEvent<FantasySquadWorkerResponse>) => {
      finish();
      if (event.data.error || event.data.kind !== "OPTIMIZE_SQUAD") {
        reject(new Error("FANTASY_SQUAD_OPTIMIZER_FAILED"));
        return;
      }
      resolve({ selections: event.data.optimized, analysis: event.data.analysis ?? null });
    };
    worker.onerror = () => {
      finish();
      reject(new Error("FANTASY_SQUAD_OPTIMIZER_FAILED"));
    };
    const request: FantasySquadWorkerRequest = { kind: "OPTIMIZE_SQUAD", input, startersOnly };
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

/** @spec spec://modules/machete/FEAT-001-global-ranking-strategy#scenarios */
export function FantasySquadPlanner({ userId, leagueId, season, provider, rules, rounds, bookmakerFavorites, initialFixtureCalendar = null, players: initialPlayers, playerPoolHref, squadApiPath = "/api/machete/squads", squadRoutePath = "/machete/squad", initialSquad, readiness, sportsRuSquadStatus, contestId = null, historySettings, initialVisiblePlayerPoolColumns, initialPlayerPoolColumnWidths }: FantasySquadPlannerProps) {
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
  const [autoPickStrategy, setAutoPickStrategy] = useState<FantasySquadStrategy>(initialSquad.strategy ?? "balanced");
  const [globalStrategyContext, setGlobalStrategy] = useState<GlobalStrategyRequestContext | null>(null);
  const globalStrategy = useMemo(() => globalStrategyContext ? { ...globalStrategyContext, forecastRevision: globalForecastRevision(players) } : null, [globalStrategyContext, players]);
  const globalPoolEvaluation = useMemo(() => globalStrategy ? globalStrategyPoolEvaluation(players, globalStrategy, Date.parse(globalStrategy.context.observedAt)) : null, [players, globalStrategy]);
  const [globalAnalysis, setGlobalAnalysis] = useState<GlobalStrategyAnalysis | null>(null);
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
  const autoPickAbortRef = useRef<AbortController | null>(null);
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
    autoPickAbortRef.current?.abort();
    return () => autoPickAbortRef.current?.abort();
  }, [autoPickStrategy, globalStrategy, activeSquadId, provider, horizon, players, rules, selections]);

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
  const draftKey = `${draftPrefix}${userId}:${provider}:${leagueId}:${season}:${initialSquad.id ?? "new"}`;
  usePlannerDraft({ draftKey, language, savedRoundPlans, roundPlans, horizon, activeRoundOffset, transferBaselinePlayerIds, openingFreeTransfers,
    setRoundPlans, setHorizon, setActiveRoundOffset, setTransferBaselinePlayerIds, setOpeningFreeTransfers, setMessage });
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
      strategy: autoPickStrategy,
      globalStrategy,
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
  }, [autoPickStrategy, globalStrategy, availableSuggestionCount, players, selections, rules, playerPoolReady, postLoadContentReady, suggestionRetry, transferBudget.paidPointCost, transferSuggestionForecastSource, transferSuggestionHorizon, transferSuggestionsReady]);

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

  function applySuggestion(suggestion: TransferPlanSuggestion, now: number) {
    if (!transferSuggestionsReady) return;
    if (suggestion.globalStrategy && !isGlobalRecommendationCurrent(suggestion.globalStrategy, globalStrategy, now)) {
      setMessage(localizedText(language, "Strategy inputs changed. Recalculate suggestions.", "Данные стратегии изменились. Пересчитайте подсказки."));
      return;
    }
    const replacements = new Map(suggestion.moves.map((move) => [move.outPlayerId, players.find((player) => player.playerId === move.inPlayerId)]));
    if ([...replacements.values()].some((player) => !player)) return;
    const nextSelections = suggestion.selections ?? selections.map((selection) => {
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
    setGlobalAnalysis(suggestion.globalStrategy ?? null);
    if (suggestion.globalStrategy) void recordGlobalRecommendation(activeSquadId, suggestion.globalStrategy);
    setSelections(nextSelections);
    setMessage(null);
  }

  async function autoPickStarters() {
    if (!plannerForecastReady) {
      setMessage(localizedText(language, "Auto-pick is unavailable until this league season has fresh forecast data.", "Автоподбор недоступен, пока для сезона лиги нет свежих прогнозных данных."));
      return;
    }
    const revision = autoPickRevisionRef.current;
    const controller = new AbortController();
    autoPickAbortRef.current = controller;
    const globalResult = autoPickStrategy === "GLOBAL_AUTO" ? await optimizeFantasySquadOffThread({ pool: players, selections, rules, horizon, strategy: autoPickStrategy, globalStrategy }, true, controller.signal).catch(() => null) : null;
    if (revision !== autoPickRevisionRef.current) return;
    if (globalResult?.analysis && !isGlobalRecommendationCurrent(globalResult.analysis, globalStrategy, Date.now())) {
      setMessage(localizedText(language, "Strategy inputs expired. Refresh and try again.", "Данные стратегии устарели. Обновите их и повторите подбор.")); return;
    }
    if (autoPickStrategy === "GLOBAL_AUTO" && !globalResult) { setMessage(localizedText(language, "Selection did not finish. Try again.", "Подбор не завершился. Повторите запрос.")); return; }
    const optimized = globalResult ? globalResult.selections : optimizeFantasyStarters({
      pool: players,
      selections,
      rules,
      horizon,
      basis: "horizon",
      strategy: autoPickStrategy,
      globalStrategy,
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
    setGlobalAnalysis(globalResult?.analysis ?? null);
    if (globalResult?.analysis) void recordGlobalRecommendation(activeSquadId, globalResult.analysis);
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
    const controller = new AbortController();
    autoPickAbortRef.current = controller;
    const optimizerInput: FantasySquadOptimizationInput = {
      pool: players,
      selections,
      rules,
      horizon,
      basis: "horizon",
      strategy: autoPickStrategy,
      globalStrategy,
      maximumTransfers: transferLimitIsActive ? availableSuggestionCount : undefined,
      freeTransfers: availableSuggestionCount,
      paidTransferPointCost: transferBudget.paidPointCost ?? 0
    };
    setAutoPickPending(true);
    setMessage(localizedText(language, "Optimizing a valid squad…", "Подбираем допустимый состав…"));

    try {
      const result = await optimizeFantasySquadOffThread(optimizerInput, false, controller.signal);
      const optimized = result.selections;
      if (result.analysis && !isGlobalRecommendationCurrent(result.analysis, globalStrategy, Date.now())) {
        setMessage(localizedText(language, "Strategy inputs expired. Refresh and try again.", "Данные стратегии устарели. Обновите их и повторите подбор.")); return;
      }
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
      setGlobalAnalysis(result.analysis);
      if (result.analysis) void recordGlobalRecommendation(activeSquadId, result.analysis);
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
            strategy: autoPickStrategy,
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
      window.dispatchEvent(new CustomEvent("machete:squad-saved"));
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
          {/* @spec spec://modules/machete/FEAT-001-global-ranking-strategy#transfer-rules */}
          {usesUnpricedTransfers ? (
            <p className="mt-1.5 text-[10px] text-slate-500">
              <I18nText en="Sports.ru allows 3 transfers per round." ru="В Sports.ru — 3 замены за тур." />
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
                  onClick={() => applySuggestion(suggestion, Date.now())}
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
              {/* @spec spec://modules/machete/FEAT-008-platform-transfer-trends#ui */}
              <PlatformTransferTrendsPanel contestId={contestId} />
              <BookmakerFavoritesTable
                rows={activeRoundBookmakerFavorites}
                roundLabel={rounds[activeRoundOffset]?.label ?? null}
                language={language}
              />
              <SportsTrendsPanel
                contestId={contestId}
                roundKey={rounds[activeRoundOffset]?.id ?? null}
                roundLabel={rounds[activeRoundOffset]?.label ?? null}
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
              {/* @spec spec://modules/machete/FEAT-001-global-ranking-strategy#transfer-rules */}
              <Metric
                label={<I18nText en="Transfers" ru="Замены" />}
                value={`${plannedTransferCount}/${transferLimit}`}
                tone={transferLimitIsActive && plannedTransferCount >= transferLimit ? "bad" : "accent"}
                title={localizedText(
                  language,
                  usesUnpricedTransfers
                    ? "Used / available this round. Sports.ru allows 3 transfers per round."
                    : "Used / available this round. FPL banks unused free transfers up to 5.",
                  usesUnpricedTransfers
                    ? "Использовано / доступно в этом туре. В Sports.ru 3 замены за тур."
                    : "Использовано / доступно в этом туре. В FPL неиспользованные бесплатные трансферы копятся до 5."
                )}
              />
            </div>
            <GlobalStrategyPanel squadId={activeSquadId} provider={provider} mode={autoPickStrategy} onMode={setAutoPickStrategy} onContext={setGlobalStrategy} analysis={globalAnalysis} poolEvaluation={globalPoolEvaluation} />
            <div className="mb-3">
              <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
                <h3 className="truncate text-xs font-semibold uppercase tracking-wide text-slate-500 sm:text-sm"><I18nText en="Your squad" ru="Ваш состав" /></h3>
                <div className="flex shrink-0 items-center gap-1.5">
                  <button
                    type="button"
                    onClick={importStoredSportsRuSquad}
                    disabled={interactionPending || autoPickPending}
                    title={sportsRuSquadButtonTitle(language, sportsSnapshotStatus)}
                    aria-label={localizedText(language, "Import Sports squad", "Импортировать состав Sports")}
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

/** @spec spec://modules/machete/FEAT-003-squad-player-card#root */
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
  onDragStart: (playerId: string) => void;
  onDragEnd: () => void;
  onDropOnPlayer: (sourcePlayerId: string, targetPlayerId: string) => void;
  onReplacementPlayerClick: (playerId: string) => void;
}) {
  const fixtureChips = fixtureChipPresentations(player.fixtures, player.fixtureDifficulties ?? [], Math.max(horizon, 3), player.fixtureFullNames);
  const captainActionLabel = isCaptain
    ? localizedText(language, "Remove captain", "Снять капитана")
    : localizedText(language, "Make captain x2", "Сделать капитаном x2");
  const removeActionLabel = localizedText(language, `Remove ${player.name}`, `Удалить ${player.name}`);
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
  return (
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
        "squad-contact-card",
        replacementMode ? "cursor-pointer" : "cursor-grab active:cursor-grabbing",
        isCaptain && "squad-contact-card--captain",
        player.isProviderPlaceholder && "squad-contact-card--placeholder",
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
            "absolute inset-0 z-30 rounded-[inherit] border-2 transition",
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
      <div className="squad-contact-card__portrait">
        <SquadPlayerPhoto player={player} contactSheet />
        <span className="squad-contact-card__club" title={player.teamName}>
          {fantasyPlayerTeamDisplayName(player)}
        </span>
        <span className="squad-contact-card__position">{player.positionGroup}</span>
        {isCaptain || isVice ? (
          <span className="squad-contact-card__role"
            title={isCaptain ? localizedText(language, "Captain", "Капитан") : localizedText(language, "Vice-captain", "Вице-капитан")}
            aria-label={isCaptain ? localizedText(language, "Captain", "Капитан") : localizedText(language, "Vice-captain", "Вице-капитан")}>
            {isCaptain ? "C" : "VC"}
          </span>
        ) : null}
        <span className="squad-contact-card__price num-tabular"
          title={localizedText(language, "Fantasy price: " + formatNumber(player.price, 1), "Фэнтези-цена: " + formatNumber(player.price, 1))}
          aria-label={localizedText(language, "Fantasy price " + formatNumber(player.price, 1), "Фэнтези-цена " + formatNumber(player.price, 1))}>
          {player.priceSource === "ESTIMATED" ? "~" : ""}{formatNumber(player.price, 1)}
        </span>
        <p className="squad-contact-card__name" title={player.name} aria-label={player.name}>{compactPlayerDisplayName(player.name)}</p>
      </div>
      {player.isProviderPlaceholder ? (
        <p className="squad-contact-card__missing">
          <I18nText en="not in database" ru="нет в базе" />
        </p>
      ) : <dl className="squad-contact-card__metrics num-tabular">
        <div className="grid grid-cols-3 gap-x-px">
          <div className="min-w-0">
            <dt className="squad-contact-card__metric-label"><I18nText en="FP1" ru="ФО1" /></dt>
            <dd className="squad-contact-card__metric-value" title={cardPrimaryNextTitle}>{formatCompactScore(cardPrimaryNextForecast * (isCaptain ? 2 : 1))}</dd>
          </div>
          <div className="min-w-0">
            <dt className="squad-contact-card__metric-label"><I18nText en="FP3" ru="ФО3" /></dt>
            <dd className="squad-contact-card__metric-value" title={cardPrimaryHorizonTitle}>{formatCompactScore(cardPrimaryHorizonForecast * (isCaptain ? 2 : 1))}</dd>
          </div>
          <div className="min-w-0" title={cardFoontasyTitle}>
            <dt className="squad-contact-card__metric-label">FFO</dt>
            <dd className="squad-contact-card__metric-value" title={cardFoontasyTitle}>{formatCompactScore(cardFoontasyForecast)}</dd>
          </div>
        </div>
        <div className="mt-px grid grid-cols-2 gap-x-px px-1">
          <div className="min-w-0">
            <dt className="squad-contact-card__metric-label">ALT1</dt>
            <dd className="squad-contact-card__metric-value" title={cardAlternativeNextTitle}>{formatCompactScore(scaleCaptainForecast(cardAlternativeNextForecast, isCaptain), "0")}</dd>
          </div>
          <div className="min-w-0">
            <dt className="squad-contact-card__metric-label">ALT3</dt>
            <dd className="squad-contact-card__metric-value" title={cardAlternativeHorizonTitle}>{formatCompactScore(scaleCaptainForecast(cardAlternativeHorizonForecast, isCaptain), "0")}</dd>
          </div>
        </div>
      </dl>}
      {fixtureChips.length > 0 ? (
        <div className="squad-contact-card__fixtures">
          <FdrRow
            fixtures={fixtureChips.slice(0, 3)}
            className="squad-contact-card__fixture-row"
          />
        </div>
      ) : null}
      <div className="squad-contact-card__actions">
        <button type="button" onClick={() => onToggleCaptain(player.playerId)}
          disabled={replacementMode} aria-pressed={isCaptain}
          className="squad-contact-card__captain" aria-label={captainActionLabel} title={captainActionLabel}>
          C
        </button>
        <button type="button" onClick={() => onRemove(player.playerId)}
          disabled={replacementMode} className="squad-contact-card__remove"
          aria-label={removeActionLabel} title={removeActionLabel}>
          <X aria-hidden="true" className="h-2.5 w-2.5" />
        </button>
      </div>
    </div>
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

/** @spec spec://modules/machete/FEAT-001-global-ranking-strategy#contracts */
function globalForecastRevision(players: FantasyPlannerPlayer[]) {
  const value = JSON.stringify(players.map((player) => [player.playerId, player.price, player.priceSource, player.roundPoints, player.predictedFp, player.alternativeRoundPoints, player.alternativePredictedFp, player.foontasyPoints]));
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) hash = Math.imul(hash ^ value.charCodeAt(i), 16777619);
  return `forecast-v1:${value.length}:${hash >>> 0}`;
}

function squadStrategyCopy(language: UiLanguage, strategy: FantasySquadStrategy) {
  if (strategy === "GLOBAL_AUTO") return { label: localizedText(language, "Global ranking", "По глобальному рейтингу"), description: "" };
  if (strategy === "reliable") {
    return {
      label: localizedText(language, "Reliable", "Надёжность"),
      description: localizedText(
        language,
        "Uses next-match RR from lineup history and rest, with confidence and price-source adjustments. Falls back to minutes and appearances when RR is unknown.",
        "Учитывает RR ближайшего матча по истории составов и отдыху, уверенность и источник цены. При неизвестном RR использует прежнюю оценку по минутам и выходам."
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

function squadVariantHref(routePath: string, leagueId: string, season: string, squadId: string | null, historySettings: FantasyHistorySettings) {
  const params = new URLSearchParams({ leagueId, season });
  applyFantasyHistorySearchParams(params, historySettings);
  if (squadId) params.set("squadId", squadId);
  return `${routePath}?${params.toString()}`;
}

function scaleCaptainForecast(value: number | null | undefined, isCaptain: boolean) {
  return typeof value === "number" && Number.isFinite(value) ? value * (isCaptain ? 2 : 1) : null;
}
