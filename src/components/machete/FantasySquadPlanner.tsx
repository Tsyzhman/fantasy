"use client";

import { Check, Crown, Layers3, ListChecks, Lock, Plus, Save, Search, Sparkles, Star, Trash2, Unlock, Users } from "lucide-react";
import { type DragEvent, useEffect, useMemo, useState, useTransition } from "react";

import { I18nText } from "@/components/i18n-text";
import { localizedText, useLanguage } from "@/components/localized-option";
import { SortableTable } from "@/components/sortable-table";
import { FdrRow } from "@/components/ui/fdr-pill";
import { SegmentedControl, type SegmentedOption } from "@/components/ui/segmented-control";
import { formatDate, formatNumber, formatScore } from "@/lib/format";
import { cn } from "@/lib/cn";
import {
  buildTransferSuggestions,
  canStartFantasyPlayer,
  countFantasySquadTransfers,
  fantasyAddBlockReason,
  fantasyTransferLimitForHorizon,
  nextFantasyPoints,
  normalizeFantasyHorizon,
  optimizeFantasyStarters,
  playerHorizonPoints,
  selectionForPlayer,
  selectionForNewPlayer,
  summarizeFantasySquad,
  type FantasyPlannerPlayer,
  type FantasyPositionGroup,
  type FantasyRoundProjection,
  type FantasySquadRules,
  type FantasySquadSelection,
  type TransferSuggestion
} from "@/machete/squad_logic";
import type { SavedFantasySquad } from "@/machete/squad_planner";

type FantasySquadPlannerProps = {
  leagueId: string;
  season: string;
  rules: FantasySquadRules;
  rounds: FantasyRoundProjection[];
  players: FantasyPlannerPlayer[];
  initialSquad: SavedFantasySquad;
  priceStatus: {
    sportsRuPrices: number;
    estimatedPrices: number;
    lastSyncedAt: string | null;
  };
};

const positionOrder: FantasyPositionGroup[] = ["GK", "DEF", "MID", "FWD", "UNK"];
const rosterPositions: Array<Exclude<FantasyPositionGroup, "UNK">> = ["GK", "DEF", "MID", "FWD"];
const squadDragDataType = "application/x-fantasy-player-id";

type UiLanguage = ReturnType<typeof useLanguage>;
type MobileTab = "squad" | "pool" | "suggestions";
type StoredSquadCaptains = {
  captainId: string | null;
  viceCaptainId: string | null;
};

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

export function FantasySquadPlanner({ leagueId, season, rules, rounds, players, initialSquad, priceStatus }: FantasySquadPlannerProps) {
  const language = useLanguage();
  const initialHorizon = normalizeFantasyHorizon(initialSquad.horizonRounds, rules.horizonOptions);
  const initialSelections = useMemo(() => normalizeInitialSelections(initialSquad.selections, players, rules), [initialSquad.selections, players, rules]);
  const captainStorageKey = `fantasy-squad-captains:${leagueId}:${season}`;
  const [selections, setSelections] = useState<FantasySquadSelection[]>(() => initialSelections);
  const [savedSelections, setSavedSelections] = useState<FantasySquadSelection[]>(() => initialSelections);
  const [horizon, setHorizon] = useState(initialHorizon);
  const [query, setQuery] = useState("");
  const [positionFilter, setPositionFilter] = useState("ALL");
  const [starterPoolFilter, setStarterPoolFilter] = useState("ALL");
  const [onlyAffordable, setOnlyAffordable] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [mobileTab, setMobileTab] = useState<MobileTab>("squad");
  const [draggedPlayerId, setDraggedPlayerId] = useState<string | null>(null);

  const selectionsByPlayerId = useMemo(() => new Map(selections.map((selection) => [selection.playerId, selection])), [selections]);
  const selectedPlayerIds = useMemo(() => new Set(selections.map((selection) => selection.playerId)), [selections]);
  const captainId = useMemo(() => selections.find((selection) => selection.isCaptain)?.playerId ?? null, [selections]);
  const viceCaptainId = useMemo(() => selections.find((selection) => selection.isViceCaptain)?.playerId ?? null, [selections]);
  const summary = useMemo(() => summarizeFantasySquad(players, selections, rules, horizon), [players, selections, rules, horizon]);
  const savedSummary = useMemo(() => summarizeFantasySquad(players, savedSelections, rules, horizon), [players, savedSelections, rules, horizon]);
  const squadDiff = useMemo(() => buildSquadDiff(savedSelections, selections, savedSummary, summary), [savedSelections, selections, savedSummary, summary]);
  const transferLimit = fantasyTransferLimitForHorizon(horizon);
  const transferLimitIsActive = savedSelections.length === rules.squadSize;
  const availableSuggestionCount = transferLimitIsActive ? Math.max(0, transferLimit - squadDiff.transferCount) : transferLimit;
  const suggestions = useMemo(
    () => buildTransferSuggestions({ pool: players, selections, rules, horizon, transferCount: availableSuggestionCount }),
    [availableSuggestionCount, players, selections, rules, horizon]
  );
  const filteredPlayers = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return players
      .filter((player) => (positionFilter === "ALL" ? true : player.positionGroup === positionFilter))
      .filter((player) =>
        normalizedQuery
          ? `${player.name} ${player.teamName} ${player.position ?? ""}`.toLowerCase().includes(normalizedQuery)
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
    if (countFantasySquadTransfers(savedSelections, nextSelections) <= transferLimit) return null;

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

  function toggleLock(playerId: string) {
    setSelections((current) => current.map((selection) => (selection.playerId === playerId ? { ...selection, isLocked: !selection.isLocked } : selection)));
  }

  function toggleStarter(playerId: string) {
    const selection = selectionsByPlayerId.get(playerId);
    if (!selection) return;
    if (selection.isStarter) {
      movePlayerToBench(playerId);
      return;
    }

    movePlayerToStarter(playerId);
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

  function applySuggestion(suggestion: TransferSuggestion) {
    const incoming = players.find((player) => player.playerId === suggestion.inPlayerId);
    if (!incoming) return;
    const outSelection = selections.find((selection) => selection.playerId === suggestion.outPlayerId);
    const slotIndex = outSelection?.slotIndex ?? selections.length;
    const nextSelections = [
      ...selections.filter((selection) => selection.playerId !== suggestion.outPlayerId),
      selectionForPlayer(incoming, slotIndex, outSelection?.isStarter ?? true)
    ].sort((left, right) => left.slotIndex - right.slotIndex);
    const limitReason = transferLimitBlockReason(nextSelections);
    if (limitReason) {
      setMessage(limitReason);
      return;
    }

    setSelections(nextSelections);
    setMessage(null);
  }

  function autoPickStarters() {
    const optimized = optimizeFantasyStarters({ pool: players, selections, rules, horizon, basis: "horizon", respectLocks: true });
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
        ? localizedText(language, `Auto-picked XI: ${signedScore(delta)} xFP over ${horizon} rounds.`, `Старт подобран автоматически: ${signedScore(delta)} xFP за ${horizon} тур.`)
        : localizedText(language, "Starting XI is already optimal for this horizon.", "Стартовый состав уже оптимален для этого горизонта.")
    );
  }

  function saveSquad() {
    startTransition(async () => {
      setMessage(null);
      const selectionsToSave = sanitizeCaptainRoles(selections);
      const response = await fetch("/api/machete/squads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          leagueId,
          season,
          name: initialSquad.name,
          horizonRounds: horizon,
          selections: selectionsToSave
        })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setMessage(language === "ru" ? localizedText(language, "Failed to save squad.", "Не удалось сохранить состав.") : payload?.error?.message ?? localizedText(language, "Failed to save squad.", "Не удалось сохранить состав."));
        return;
      }
      setSelections(selectionsToSave);
      setSavedSelections(selectionsToSave.map((selection) => ({ ...selection })));
      const savedPlayers = payload.squad?.savedPlayers ?? selectionsToSave.length;
      setMessage(localizedText(language, `Saved ${savedPlayers} players.`, `Сохранено игроков: ${savedPlayers}.`));
    });
  }

  const mobileTabs: SegmentedOption<MobileTab>[] = [
    { value: "squad", label: <span className="inline-flex items-center gap-1"><Users className="h-3.5 w-3.5" /><I18nText en="Squad" ru="Состав" /></span> },
    { value: "pool", label: <span className="inline-flex items-center gap-1"><Layers3 className="h-3.5 w-3.5" /><I18nText en="Pool" ru="Пул" /></span> },
    { value: "suggestions", label: <span className="inline-flex items-center gap-1"><ListChecks className="h-3.5 w-3.5" /><I18nText en="Tips" ru="Советы" /></span> }
  ];

  return (
    <div className="mt-6 space-y-5">
      <div className="lg:hidden">
        <SegmentedControl value={mobileTab} onChange={setMobileTab} options={mobileTabs} className="w-full justify-between" size="sm" />
      </div>
      <section className="grid grid-cols-1 gap-3 lg:grid-cols-[1.25fr_0.75fr]">
        <div className={cn(mobileTab === "squad" ? "block" : "hidden lg:block", "rounded border border-slate-200 bg-white p-4 shadow-soft lg:sticky lg:top-24 lg:self-start")}>
          <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                <I18nText en="Squad builder" ru="Конструктор состава" />
              </p>
              <h2 className="mt-1 text-2xl font-bold text-ink">{initialSquad.name}</h2>
              <p className="mt-1 text-sm text-slate-600 num-tabular">
                <I18nText
                  en={`${summary.selectedPlayers.length}/${rules.squadSize} players · ${summary.starterPlayers.length}/${rules.starterSize} starters · ${summary.benchPlayers.length}/${rules.benchSize} bench`}
                  ru={`${summary.selectedPlayers.length}/${rules.squadSize} игроков · ${summary.starterPlayers.length}/${rules.starterSize} в старте · ${summary.benchPlayers.length}/${rules.benchSize} на скамейке`}
                />
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={autoPickStarters}
                className="inline-flex items-center justify-center gap-2 rounded border border-sky-200 bg-sky-50 px-4 py-2 text-sm font-semibold text-sky-800 hover:bg-sky-100"
              >
                <Sparkles className="h-4 w-4" />
                <I18nText en="Auto-pick XI" ru="Автостарт" />
              </button>
              <button
                type="button"
                onClick={saveSquad}
                disabled={isPending}
                className="btn-brand inline-flex items-center justify-center gap-2 rounded px-4 py-2 text-sm font-semibold disabled:opacity-60"
              >
                <Save className="h-4 w-4" />
                {isPending ? <I18nText en="Saving" ru="Сохраняем" /> : <I18nText en="Save squad" ru="Сохранить состав" />}
              </button>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
            <Metric prominent label={<I18nText en="Next round" ru="След. тур" />} value={formatScore(summary.projectedNext + (captainBonus(summary, captainId)))} tone="good" />
            <Metric prominent label={<I18nText en={`Horizon ${horizon}R`} ru={`Горизонт ${horizon}т`} />} value={formatScore(summary.projectedHorizon)} tone="accent" />
            <Metric prominent label={<I18nText en="Budget" ru="Бюджет" />} value={`${formatNumber(summary.spent, 1)} / ${formatNumber(rules.budgetLimit, 1)}`} tone={summary.spent > rules.budgetLimit ? "bad" : summary.bank < 0 ? "bad" : "default"} />
            <Metric label={<I18nText en="Bank" ru="Банк" />} value={formatNumber(summary.bank, 1)} tone={summary.bank < 0 ? "bad" : "good"} />
          </div>
          <SquadDiffBadge diff={squadDiff} horizon={horizon} />

          <ol className="mt-4 grid grid-cols-1 gap-2 text-sm md:grid-cols-4">
            <PlannerStep index={1} title={<I18nText en="Choose league" ru="Выбрать лигу" />} state="done" />
            <PlannerStep index={2} title={<I18nText en="Build squad" ru="Собрать состав" />} state={summary.selectedPlayers.length >= rules.squadSize ? "done" : "active"} />
            <PlannerStep index={3} title={<I18nText en="Fix rules" ru="Исправить правила" />} state={summary.violations.length === 0 ? "done" : "active"} />
            <PlannerStep index={4} title={<I18nText en="Review upgrades" ru="Проверить апгрейды" />} state={suggestions.length > 0 ? "active" : "idle"} />
          </ol>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <label className="text-sm">
              <span className="mb-1 block text-xs font-semibold uppercase text-slate-500"><I18nText en="Forecast" ru="Прогноз" /></span>
              <select
                value={horizon}
                onChange={(event) => setHorizon(normalizeFantasyHorizon(event.target.value, rules.horizonOptions, horizon))}
                aria-label={localizedText(language, "Forecast horizon", "Горизонт прогноза")}
                className="rounded border border-slate-200 px-3 py-2"
              >
                {rules.horizonOptions.map((option) => (
                  <option key={option} value={option}>
                    {option} rounds
                  </option>
                ))}
              </select>
            </label>
            <div className="text-sm">
              <span className="mb-1 block text-xs font-semibold uppercase text-slate-500"><I18nText en="Transfers" ru="Трансферы" /></span>
              <div
                className={cn(
                  "rounded border px-3 py-2 font-semibold text-slate-700 num-tabular",
                  transferLimitIsActive && squadDiff.transferCount >= transferLimit ? "border-amber-200 bg-amber-50 text-amber-800" : "border-slate-200"
                )}
                aria-label={localizedText(language, "Transfer count", "Счетчик замен")}
              >
                {transferLimitIsActive ? `${squadDiff.transferCount}/${transferLimit}` : transferLimit}
              </div>
            </div>
            {priceStatus.lastSyncedAt ? (
              <span className="text-sm text-slate-500">
                <I18nText en={`Prices synced ${formatDate(priceStatus.lastSyncedAt)}`} ru={`Цены обновлены ${formatDate(priceStatus.lastSyncedAt)}`} />
              </span>
            ) : null}
            {priceStatus.sportsRuPrices > 0 || priceStatus.estimatedPrices > 0 ? (
              <span className="rounded border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700">
                <I18nText en={`Sports.ru prices ${priceStatus.sportsRuPrices}`} ru={`Цены Sports.ru ${priceStatus.sportsRuPrices}`} />
              </span>
            ) : null}
            {priceStatus.estimatedPrices > 0 ? (
              <span className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-800">
                <I18nText en={`Estimated prices ${priceStatus.estimatedPrices}`} ru={`Оценочные цены ${priceStatus.estimatedPrices}`} />
              </span>
            ) : null}
            {message ? <span role="status" aria-live="polite" className="rounded bg-amber-50 px-3 py-2 text-sm text-amber-800">{message}</span> : null}
          </div>

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

        <div className={cn(mobileTab === "suggestions" ? "block" : "hidden lg:block", "rounded border border-slate-200 bg-white p-4 shadow-soft")}>
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500"><I18nText en="Transfer suggestions" ru="Подсказки трансферов" /></h3>
            <Sparkles className="h-4 w-4 text-amber-600" />
          </div>
          <div className="mt-3 space-y-2">
            {suggestions.map((suggestion) => (
              <button
                key={`${suggestion.outPlayerId}:${suggestion.inPlayerId}`}
                type="button"
                onClick={() => applySuggestion(suggestion)}
                className="block w-full rounded border border-slate-200 bg-white px-3 py-2 text-left hover:bg-slate-50"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-ink">{suggestion.inName}</p>
                    <p className="truncate text-xs text-slate-500">
                      <I18nText en={`for ${suggestion.outName} / ${suggestion.positionGroup}`} ru={`за ${suggestion.outName} / ${suggestion.positionGroup}`} />
                    </p>
                  </div>
                  <span className="whitespace-nowrap rounded bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700">
                    +{formatScore(suggestion.nextDelta)}
                  </span>
                </div>
                <p className="mt-1 text-xs text-slate-500">
                  <I18nText
                    en={`+${formatScore(suggestion.nextDelta)} next round, +${formatScore(suggestion.horizonDelta)} over ${horizon} rounds; price ${signedNumber(suggestion.priceDelta)}`}
                    ru={`+${formatScore(suggestion.nextDelta)} в следующем туре, +${formatScore(suggestion.horizonDelta)} за ${horizon} туров; цена ${signedNumber(suggestion.priceDelta)}`}
                  />
                </p>
              </button>
            ))}
            {suggestions.length === 0 ? <p className="text-sm text-slate-500"><I18nText en="No clean upgrade found for the selected filters." ru="Для выбранных фильтров чистое улучшение не найдено." /></p> : null}
          </div>
        </div>
      </section>

      <section className="rounded border border-slate-200 bg-white p-3 shadow-soft sm:p-4">
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(320px,0.72fr)_minmax(560px,1.28fr)] 2xl:grid-cols-[minmax(340px,0.68fr)_minmax(680px,1.32fr)]">
          <div className={cn(mobileTab === "squad" ? "block" : "hidden xl:block")}>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500"><I18nText en="Your squad" ru="Ваш состав" /></h3>
              <PositionCounts summary={summary.byPosition} rules={rules} />
            </div>
            <SquadPitch
              summary={summary}
              rules={rules}
              selectionsByPlayerId={selectionsByPlayerId}
              horizon={horizon}
              language={language}
              captainId={captainId}
              viceCaptainId={viceCaptainId}
              draggedPlayerId={draggedPlayerId}
              onRemove={removePlayer}
              onToggleLock={toggleLock}
              onToggleStarter={toggleStarter}
              onToggleCaptain={toggleCaptain}
              onToggleVice={toggleViceCaptain}
              onDragStart={setDraggedPlayerId}
              onDragEnd={() => setDraggedPlayerId(null)}
              onDropToStarter={handleDropToStarter}
              onDropToBench={handleDropToBench}
            />
          </div>

          <div className={cn(mobileTab === "pool" ? "block" : "hidden xl:block")}>
            <div className="mb-3 grid grid-cols-1 gap-2 md:grid-cols-[1fr_auto_auto_auto]">
              <label className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder={localizedText(language, "Search player or team", "Игрок или команда")}
                  aria-label={localizedText(language, "Search player or team", "Поиск игрока или команды")}
                  className="w-full rounded border border-slate-200 py-2 pl-9 pr-3 text-xs"
                />
              </label>
              <select value={positionFilter} onChange={(event) => setPositionFilter(event.target.value)} aria-label={localizedText(language, "Position filter", "Фильтр позиции")} className="rounded border border-slate-200 px-3 py-2 text-xs">
                <option value="ALL">{localizedText(language, "All positions", "Все позиции")}</option>
                {positionOrder.map((position) => (
                  <option key={position} value={position}>
                    {position}
                  </option>
                ))}
              </select>
              <select value={starterPoolFilter} onChange={(event) => setStarterPoolFilter(event.target.value)} aria-label={localizedText(language, "Starter pool filter", "Фильтр старта")} className="rounded border border-slate-200 px-3 py-2 text-xs">
                <option value="ALL">{localizedText(language, "All players", "Все игроки")}</option>
                <option value="STARTER">{localizedText(language, "In starting XI", "В старте")}</option>
                <option value="BENCH">{localizedText(language, "On bench", "На скамейке")}</option>
              </select>
              <label className="flex items-center gap-2 rounded border border-slate-200 px-3 py-2 text-xs text-slate-700">
                <input type="checkbox" checked={onlyAffordable} onChange={(event) => setOnlyAffordable(event.target.checked)} className="h-4 w-4 rounded border-slate-300" />
                <I18nText en="Fits" ru="Проходит" />
              </label>
            </div>
            <PlayerPoolTable
              players={filteredPlayers}
              horizon={horizon}
              language={language}
              addBlockReason={(player) => fantasyAddBlockReason(player, players, selections, rules)}
              selectionsByPlayerId={selectionsByPlayerId}
              onAdd={addPlayer}
              onRemove={removePlayer}
            />
          </div>
        </div>
      </section>

      {rounds.length > 0 ? (
        <section className="overflow-hidden rounded border border-slate-200 bg-white shadow-soft">
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
  return (
    <div className="overflow-hidden rounded border border-slate-200 bg-white">
      <div className="max-h-[720px] overflow-auto">
        <SortableTable className="min-w-[760px] divide-y divide-slate-200 text-xs">
          <thead className="sticky top-0 z-10 bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500">
            <tr>
              <th className="px-3 py-3"><I18nText en="Player" ru="Игрок" /></th>
              <th className="px-3 py-3"><I18nText en="Team" ru="Команда" /></th>
              <th className="px-3 py-3"><I18nText en="Pos" ru="Поз." /></th>
              <th className="px-3 py-3 text-right"><I18nText en="Price" ru="Цена" /></th>
              <th className="px-3 py-3 text-right"><I18nText en="Next" ru="След." /></th>
              <th className="px-3 py-3 text-right">{horizon}R</th>
              <th className="px-3 py-3 text-right">W xG</th>
              <th className="px-3 py-3"><I18nText en="Fixtures" ru="Матчи" /></th>
              <th className="px-3 py-3 text-right"><I18nText en="Add" ru="Добавить" /></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {players.map((player) => {
              const reason = addBlockReason(player);
              const isSelected = selectionsByPlayerId.has(player.playerId);
              const disabled = !isSelected && reason !== null;
              const localizedReason = reason ? localizeAddBlockReason(reason, language) : null;
              const fixtureChips = player.fixtures
                .slice(0, horizon)
                .map((label, fixtureIdx) => ({ label, difficulty: player.fixtureDifficulties?.[fixtureIdx] ?? null }))
                .filter((chip) => Boolean(chip.label))
                .map((chip) => ({ label: compactFixtureLabel(chip.label), difficulty: chip.difficulty, title: chip.label }));
              const fixtures = player.fixtures.slice(0, horizon).filter(Boolean).join(" / ");
              const rowClassName = isSelected
                ? "bg-slate-50/70 text-slate-400"
                : disabled
                  ? "bg-slate-50/80 text-slate-400"
                  : "hover:bg-slate-50";
              const muted = isSelected || disabled;
              const addLabel = disabled
                ? localizedText(language, `Cannot add ${player.name}: ${localizedReason ?? reason ?? ""}`, `Нельзя добавить ${player.name}: ${localizedReason ?? reason ?? ""}`)
                : localizedText(language, `Add ${player.name}`, `Добавить ${player.name}`);
              const removeLabel = localizedText(language, `Remove ${player.name}`, `Удалить ${player.name}`);

              return (
                <tr key={player.playerId} className={rowClassName}>
                  <td className="min-w-36 px-2.5 py-2">
                    <span className={`block truncate font-semibold ${muted ? "text-slate-500" : "text-ink"}`} title={player.name}>{player.name}</span>
                    <span className={`block text-[11px] ${muted ? "text-slate-400" : "text-slate-500"}`}>
                      {isSelected ? <I18nText en="Selected" ru="В составе" /> : `FP ${formatScore(player.predictedFp)}`}
                    </span>
                  </td>
                  <td className={`min-w-28 px-2.5 py-2 ${muted ? "text-slate-400" : "text-slate-600"}`}>
                    <span className="block truncate" title={player.teamName}>{player.teamName}</span>
                  </td>
                  <td className="px-2.5 py-2">
                    <span className={`rounded px-2 py-0.5 text-[11px] font-bold ${muted ? "border border-slate-300 bg-slate-200 text-slate-500" : positionPillClass(player.positionGroup)}`}>{player.positionGroup}</span>
                  </td>
                  <td className={`whitespace-nowrap px-2.5 py-2 text-right font-semibold ${muted ? "text-slate-400" : "text-ink"}`}>
                    <span>{player.priceSource === "ESTIMATED" ? "~" : ""}{formatNumber(player.price, 1)}</span>
                    {player.priceSource === "ESTIMATED" ? (
                      <span
                        className="ml-1 rounded bg-amber-50 px-1 py-0.5 text-[10px] font-bold uppercase text-amber-700"
                        aria-label={localizedText(language, "Estimated price", "Оценочная цена")}
                      >
                        <I18nText en="est." ru="оц." />
                      </span>
                    ) : null}
                  </td>
                  <td className={`whitespace-nowrap px-2.5 py-2 text-right font-semibold ${muted ? "text-slate-400" : "text-emerald-700"}`}>{formatScore(nextFantasyPoints(player))}</td>
                  <td className={`whitespace-nowrap px-2.5 py-2 text-right font-semibold ${muted ? "text-slate-400" : "text-sky-700"}`}>{formatScore(playerHorizonPoints(player, horizon))}</td>
                  <td className={`whitespace-nowrap px-2.5 py-2 text-right text-[11px] font-semibold ${muted ? "text-slate-400" : "text-violet-700"}`}>
                    {player.baltikaXg !== null && player.baltikaXg !== undefined ? (
                      <>
                        <span className="block num-tabular">{formatScore(player.baltikaXg)}</span>
                        {player.baltikaMatchesPlayed ? (
                          <span className="block text-[10px] font-normal text-slate-400">
                            <I18nText en={`${player.baltikaMatchesPlayed} apps`} ru={`${player.baltikaMatchesPlayed} матч.`} />
                          </span>
                        ) : null}
                      </>
                    ) : (
                      <span className="text-slate-300">—</span>
                    )}
                  </td>
                  <td className="max-w-44 px-2.5 py-2 text-[11px] text-slate-500">
                    {fixtureChips.length > 0 ? (
                      <FdrRow fixtures={fixtureChips} />
                    ) : (
                      <span className="block truncate" title={fixtures}><I18nText en="No fixture loaded" ru="Матч не загружен" /></span>
                    )}
                    {disabled ? (
                      <span
                        className="mt-1 inline-flex max-w-full items-center gap-1 rounded bg-rose-50 px-2 py-1 font-semibold text-rose-700"
                        title={localizedReason ?? undefined}
                      >
                        <Lock className="h-3 w-3 shrink-0" />
                        <span className="truncate">{localizedReason}</span>
                      </span>
                    ) : null}
                  </td>
                  <td className="px-2.5 py-2 text-right">
                    {isSelected ? (
                      <button type="button" onClick={() => onRemove(player.playerId)} aria-label={removeLabel} className="inline-flex h-8 w-8 items-center justify-center rounded border border-rose-200 bg-white text-rose-700 hover:bg-rose-50">
                        <Trash2 className="h-4 w-4" />
                        <span className="sr-only">{removeLabel}</span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => onAdd(player)}
                        disabled={disabled}
                        className="inline-flex h-8 w-8 items-center justify-center rounded border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400"
                        aria-label={addLabel}
                      >
                        {disabled ? <Lock className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
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
  );
}

function Metric({ label, value, tone = "default", prominent = false }: { label: React.ReactNode; value: string; tone?: "default" | "good" | "bad" | "accent"; prominent?: boolean }) {
  const color = tone === "good" ? "text-emerald-700" : tone === "bad" ? "text-rose-700" : tone === "accent" ? "text-sky-700" : "text-ink";
  return (
    <div className={cn("rounded border border-slate-200 bg-slate-50 px-3 py-2", prominent && "bg-white shadow-elev")}>
      <dt className="text-xs font-medium uppercase text-slate-400">{label}</dt>
      <dd className={cn("mt-1 font-bold num-tabular", prominent ? "text-2xl" : "text-lg", color)}>{value}</dd>
    </div>
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

function PlannerStep({ index, title, state }: { index: number; title: React.ReactNode; state: "done" | "active" | "idle" }) {
  const stateClass =
    state === "done"
      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : state === "active"
        ? "border-ink bg-slate-50 text-ink"
        : "border-slate-200 bg-white text-slate-500";

  return (
    <li className={`flex items-center gap-2 rounded border px-3 py-2 ${stateClass}`}>
      <span className="grid h-6 w-6 shrink-0 place-items-center rounded bg-white text-xs font-bold text-ink">{index}</span>
      <span className="font-semibold">{title}</span>
    </li>
  );
}

function PositionCounts({ summary, rules }: { summary: Record<FantasyPositionGroup, number>; rules: FantasySquadRules }) {
  return (
    <div className="flex flex-wrap gap-2 text-xs font-semibold text-slate-600">
      {(["GK", "DEF", "MID", "FWD"] as const).map((position) => (
        <span key={position} className="rounded border border-slate-200 bg-white px-2 py-1">
          {position} {summary[position]}/{rules.positionLimits[position]}
        </span>
      ))}
    </div>
  );
}

function StarterCounts({ summary, rules }: { summary: Record<FantasyPositionGroup, number>; rules: FantasySquadRules }) {
  const fieldPlayers = summary.DEF + summary.MID + summary.FWD;
  return (
    <div className="flex flex-wrap gap-1.5 text-[11px] font-semibold text-white/90">
      <StarterRulePill label={<I18nText en="Field" ru="Поле" />} count={fieldPlayers} min={10} max={10} />
      {rosterPositions.map((position) => (
        <StarterRulePill key={position} label={position} count={summary[position]} min={rules.starterPositionLimits[position].min} max={rules.starterPositionLimits[position].max} />
      ))}
    </div>
  );
}

function StarterRulePill({ label, count, min, max }: { label: React.ReactNode; count: number; min: number; max: number }) {
  const status = limitStatus(count, min, max);
  const statusClass =
    status === "bad"
      ? "border-rose-300/80 bg-rose-500/25 text-rose-50"
      : status === "missing"
        ? "border-amber-300/80 bg-amber-400/20 text-amber-50"
        : "border-emerald-300/70 bg-emerald-400/15 text-emerald-50";

  return (
    <span className={`rounded border px-1.5 py-0.5 ${statusClass}`}>
      {label} {count}/{min === max ? max : `${min}-${max}`}
    </span>
  );
}

type LimitStatus = "bad" | "missing" | "good";

function limitStatus(count: number, min: number, max: number): LimitStatus {
  if (count > max) return "bad";
  if (count < min) return "missing";
  return "good";
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

function StarterRuleCard({ label, count, min, max, detail }: { label: React.ReactNode; count: number; min: number; max: number; detail: React.ReactNode }) {
  const status = limitStatus(count, min, max);
  const statusClass =
    status === "bad"
      ? "border-rose-300 bg-white text-rose-800"
      : status === "missing"
        ? "border-amber-300 bg-white text-amber-800"
        : "border-emerald-300 bg-white text-emerald-800";

  return (
    <div className={`rounded border px-1.5 py-1 shadow-sm ${statusClass}`}>
      <div className="flex items-center justify-between gap-2 whitespace-nowrap">
        <span className="text-[11px] font-black tracking-wide text-slate-800">{label}</span>
        <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-black text-slate-900">
          {count} / {min === max ? max : `${min}-${max}`}
        </span>
      </div>
      <p className="mt-1 truncate text-[10px] font-semibold text-slate-500">{detail}</p>
    </div>
  );
}

function BenchCounts({ summary, total, rules }: { summary: Record<FantasyPositionGroup, number>; total: number; rules: FantasySquadRules }) {
  const fieldPlayers = total - summary.GK;
  const requiredFieldPlayers = rules.benchSize - 1;
  return (
    <div className="flex flex-wrap gap-2 text-xs font-semibold text-slate-500">
      <span className="rounded border border-slate-200 bg-white px-2 py-1">
        <I18nText en="Bench" ru="Запас" /> {total}/{rules.benchSize}
      </span>
      <span className="rounded border border-slate-200 bg-white px-2 py-1">GK {summary.GK}/1</span>
      <span className="rounded border border-slate-200 bg-white px-2 py-1">
        <I18nText en="Field" ru="Поле" /> {fieldPlayers}/{requiredFieldPlayers}
      </span>
    </div>
  );
}

function SquadActionLegend() {
  const language = useLanguage();
  const itemClassName = "inline-flex items-center gap-1.5 rounded border border-white/15 bg-white/10 px-2 py-1";
  return (
    <div className="mb-2 grid grid-cols-2 gap-1.5 text-[11px] font-semibold text-white/85 sm:hidden" aria-label={localizedText(language, "Actions", "Действия")}>
      <span className={itemClassName}>
        <Star className="h-3 w-3" />
        <I18nText en="XI / bench" ru="Старт / скамейка" />
      </span>
      <span className={itemClassName}>
        <Crown className="h-3 w-3" />
        <I18nText en="Captain" ru="Капитан" />
      </span>
      <span className={itemClassName}>
        <span className="text-[9px] font-black">VC</span>
        <I18nText en="Vice" ru="Вице" />
      </span>
      <span className={itemClassName}>
        <Lock className="h-3 w-3" />
        <Trash2 className="h-3 w-3" />
        <I18nText en="Lock / remove" ru="Лок / удалить" />
      </span>
    </div>
  );
}

function SquadPitch({
  summary,
  rules,
  selectionsByPlayerId,
  horizon,
  language,
  captainId,
  viceCaptainId,
  draggedPlayerId,
  onRemove,
  onToggleLock,
  onToggleStarter,
  onToggleCaptain,
  onToggleVice,
  onDragStart,
  onDragEnd,
  onDropToStarter,
  onDropToBench
}: {
  summary: ReturnType<typeof summarizeFantasySquad>;
  rules: FantasySquadRules;
  selectionsByPlayerId: Map<string, FantasySquadSelection>;
  horizon: number;
  language: UiLanguage;
  captainId: string | null;
  viceCaptainId: string | null;
  draggedPlayerId: string | null;
  onRemove: (playerId: string) => void;
  onToggleLock: (playerId: string) => void;
  onToggleStarter: (playerId: string) => void;
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
    <div className="space-y-2">
      <div className="rounded border border-emerald-300 bg-emerald-900 p-2 shadow-inner">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h4 className="text-xs font-bold uppercase tracking-wide text-white"><I18nText en="Starting XI" ru="Стартовый состав" /></h4>
          <StarterCounts summary={summary.startersByPosition} rules={rules} />
        </div>
        <div className="mb-2 grid grid-cols-2 gap-1.5 text-xs sm:grid-cols-5">
          <StarterRuleCard label={<I18nText en="Field" ru="Поле" />} count={summary.startersByPosition.DEF + summary.startersByPosition.MID + summary.startersByPosition.FWD} min={10} max={10} detail={<I18nText en="Always 10" ru="Всегда 10" />} />
          <StarterRuleCard label="GK" count={summary.startersByPosition.GK} min={1} max={1} detail={<I18nText en="Always 1" ru="Всегда 1" />} />
          <StarterRuleCard label="DEF" count={summary.startersByPosition.DEF} min={rules.starterPositionLimits.DEF.min} max={rules.starterPositionLimits.DEF.max} detail={<I18nText en="Min 3, max 5" ru="Мин. 3, макс. 5" />} />
          <StarterRuleCard label="MID" count={summary.startersByPosition.MID} min={rules.starterPositionLimits.MID.min} max={rules.starterPositionLimits.MID.max} detail={<I18nText en="Min 2, max 5" ru="Мин. 2, макс. 5" />} />
          <StarterRuleCard label="FWD" count={summary.startersByPosition.FWD} min={rules.starterPositionLimits.FWD.min} max={rules.starterPositionLimits.FWD.max} detail={<I18nText en="Min 1, max 3" ru="Мин. 1, макс. 3" />} />
        </div>
        <SquadActionLegend />
        <div className="relative overflow-hidden rounded border border-white/20 bg-emerald-800/80 px-1.5 py-2">
          <div className="pointer-events-none absolute inset-x-3 top-1/2 border-t border-white/15" />
          <div className="pointer-events-none absolute left-1/2 top-1/2 h-16 w-16 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/15" />
          <div className="relative space-y-2">
            <SquadLine
              label={<I18nText en="Goalkeeper" ru="Вратарь" />}
              position="GK"
              players={summary.starterPlayers.filter((player) => player.positionGroup === "GK")}
              selectionsByPlayerId={selectionsByPlayerId}
              limit={rules.starterPositionLimits.GK}
              horizon={horizon}
              language={language}
              captainId={captainId}
              viceCaptainId={viceCaptainId}
              draggedPlayerId={draggedPlayerId}
              onRemove={onRemove}
              onToggleLock={onToggleLock}
              onToggleStarter={onToggleStarter}
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
                position={line.position}
                players={summary.starterPlayers.filter((player) => player.positionGroup === line.position)}
                selectionsByPlayerId={selectionsByPlayerId}
                limit={rules.starterPositionLimits[line.position]}
                horizon={horizon}
                language={language}
                captainId={captainId}
                viceCaptainId={viceCaptainId}
                draggedPlayerId={draggedPlayerId}
                onRemove={onRemove}
                onToggleLock={onToggleLock}
                onToggleStarter={onToggleStarter}
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
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h4 className="text-xs font-bold uppercase tracking-wide text-slate-500"><I18nText en="Bench" ru="Запас" /></h4>
          <BenchCounts summary={summary.benchByPosition} total={summary.benchPlayers.length} rules={rules} />
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
              onToggleLock={onToggleLock}
              onToggleStarter={onToggleStarter}
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
  position,
  players,
  selectionsByPlayerId,
  limit,
  horizon,
  language,
  captainId,
  viceCaptainId,
  draggedPlayerId,
  onRemove,
  onToggleLock,
  onToggleStarter,
  onToggleCaptain,
  onToggleVice,
  onDragStart,
  onDragEnd,
  onDropToStarter
}: {
  label: React.ReactNode;
  position: Exclude<FantasyPositionGroup, "UNK">;
  players: FantasyPlannerPlayer[];
  selectionsByPlayerId: Map<string, FantasySquadSelection>;
  limit: { min: number; max: number };
  horizon: number;
  language: UiLanguage;
  captainId: string | null;
  viceCaptainId: string | null;
  draggedPlayerId: string | null;
  onRemove: (playerId: string) => void;
  onToggleLock: (playerId: string) => void;
  onToggleStarter: (playerId: string) => void;
  onToggleCaptain: (playerId: string) => void;
  onToggleVice: (playerId: string) => void;
  onDragStart: (playerId: string) => void;
  onDragEnd: () => void;
  onDropToStarter: (playerId: string) => void;
}) {
  const status = limitStatus(players.length, limit.min, limit.max);
  const countClass =
    status === "bad"
      ? "border-rose-200 bg-rose-100 text-rose-800"
      : status === "missing"
        ? "border-amber-200 bg-amber-100 text-amber-800"
        : "border-emerald-200 bg-emerald-100 text-emerald-800";
  const countLabel = limit.min === limit.max ? String(limit.max) : `${limit.min}-${limit.max}`;

  return (
    <div>
      <div className="mb-1 flex items-center justify-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-white/85">
        <span>{label}</span>
        <span className={`rounded border px-1.5 py-0.5 ${countClass}`}>{players.length}/{countLabel}</span>
      </div>
      <div
        className={cn(
          "flex min-h-16 flex-wrap items-stretch justify-center gap-1 rounded border border-dashed border-transparent p-0.5 transition-colors",
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
            onToggleLock={onToggleLock}
            onToggleStarter={onToggleStarter}
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
  onToggleLock,
  onToggleStarter,
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
  onToggleLock: (playerId: string) => void;
  onToggleStarter: (playerId: string) => void;
  onToggleCaptain: (playerId: string) => void;
  onToggleVice: (playerId: string) => void;
  onDragStart: (playerId: string) => void;
  onDragEnd: () => void;
}) {
  const fixtureChips = player.fixtures
    .slice(0, Math.min(horizon, 3))
    .map((label, idx) => ({ label, difficulty: player.fixtureDifficulties?.[idx] ?? null }))
    .filter((chip) => Boolean(chip.label))
    .map((chip) => ({
      label: compactFixtureLabel(chip.label),
      difficulty: chip.difficulty,
      title: chip.label
    }));
  const starterActionLabel = selection?.isStarter
    ? localizedText(language, "Move to bench", "Перевести в запас")
    : localizedText(language, "Move to starting XI", "Перевести в старт");
  const captainActionLabel = isCaptain
    ? localizedText(language, "Remove captain", "Снять капитана")
    : localizedText(language, "Make captain x2", "Сделать капитаном x2");
  const viceActionLabel = isVice
    ? localizedText(language, "Remove vice-captain", "Снять вице-капитана")
    : localizedText(language, "Make vice-captain", "Сделать вице-капитаном");
  const lockActionLabel = selection?.isLocked
    ? localizedText(language, "Unlock player", "Разблокировать игрока")
    : localizedText(language, "Lock player", "Заблокировать игрока");
  const removeActionLabel = localizedText(language, `Remove ${player.name}`, `Удалить ${player.name}`);
  return (
    <div
      draggable={Boolean(selection)}
      onDragStart={(event) => {
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData(squadDragDataType, player.playerId);
        event.dataTransfer.setData("text/plain", player.playerId);
        onDragStart(player.playerId);
      }}
      onDragEnd={onDragEnd}
      className={cn(
        compact ? "w-[5.25rem]" : "w-[5.25rem] sm:w-[5.5rem]",
        "relative cursor-grab rounded border bg-white px-1.5 py-1 text-center shadow-sm transition active:cursor-grabbing",
        isCaptain ? "border-amber-400 ring-2 ring-amber-200" : "border-white/70",
        isDragging && "opacity-55 ring-2 ring-sky-300"
      )}
    >
      {isCaptain ? (
        <span className="absolute -top-1.5 left-1/2 -translate-x-1/2 rounded bg-amber-400 px-1.5 py-0.5 text-[8px] font-black text-white shadow">
          C
        </span>
      ) : isVice ? (
        <span className="absolute -top-1.5 left-1/2 -translate-x-1/2 rounded bg-slate-700 px-1.5 py-0.5 text-[8px] font-black text-white shadow">
          VC
        </span>
      ) : null}
      <div className="flex items-center justify-center gap-1">
        <span className={`rounded px-1.5 py-0.5 text-[9px] font-bold ${positionPillClass(player.positionGroup)}`}>{player.positionGroup}</span>
        {selection?.isLocked ? <Lock className="h-2.5 w-2.5 text-slate-500" /> : null}
      </div>
      <p className="mt-0.5 truncate text-[10px] font-bold text-ink" title={player.name}>{player.name}</p>
      <p className="truncate text-[9px] text-slate-500" title={player.teamName}>{player.teamName}</p>
      <p className="mt-0.5 text-[10px] font-semibold text-emerald-700 num-tabular">
        <Check className="mr-0.5 inline h-2.5 w-2.5" />
        {formatScore((player.roundPoints.length > 0 ? playerHorizonPoints(player, horizon) : player.predictedFp ?? 0) * (isCaptain ? 2 : 1))}
        {isCaptain ? <span className="ml-1 text-amber-600">×2</span> : null}
      </p>
      {player.baltikaXg !== null && player.baltikaXg !== undefined ? (
        <p className="text-[9px] font-semibold text-violet-700 num-tabular">W xG {formatScore(player.baltikaXg)}</p>
      ) : null}
      {fixtureChips.length > 0 ? (
        <div className="mt-0.5 flex justify-center">
          <FdrRow fixtures={fixtureChips} />
        </div>
      ) : null}
      <div className="mt-1 flex justify-center gap-0.5">
        <button
          type="button"
          onClick={() => onToggleStarter(player.playerId)}
          className={`inline-flex h-5 w-5 items-center justify-center rounded border border-slate-200 hover:bg-amber-50 ${selection?.isStarter ? "text-amber-600" : "text-slate-500"}`}
          aria-label={starterActionLabel}
        >
          <Star className={`h-2.5 w-2.5 ${selection?.isStarter ? "fill-current" : ""}`} />
          <span className="sr-only">{starterActionLabel}</span>
        </button>
        <button
          type="button"
          onClick={() => onToggleCaptain(player.playerId)}
          className={cn(
            "inline-flex h-5 w-5 items-center justify-center rounded border border-slate-200 hover:bg-amber-50",
            isCaptain ? "text-amber-600" : "text-slate-500"
          )}
          aria-label={captainActionLabel}
        >
          <Crown className={`h-2.5 w-2.5 ${isCaptain ? "fill-current" : ""}`} />
          <span className="sr-only">{captainActionLabel}</span>
        </button>
        <button
          type="button"
          onClick={() => onToggleVice(player.playerId)}
          className={cn(
            "inline-flex h-5 w-5 items-center justify-center rounded border border-slate-200 hover:bg-slate-50",
            isVice ? "text-slate-900 font-extrabold" : "text-slate-500"
          )}
          aria-label={viceActionLabel}
        >
          <span className="text-[8px] font-black">VC</span>
          <span className="sr-only">{viceActionLabel}</span>
        </button>
        <button
          type="button"
          onClick={() => onToggleLock(player.playerId)}
          className="inline-flex h-5 w-5 items-center justify-center rounded border border-slate-200 text-slate-600 hover:bg-slate-50"
          aria-label={lockActionLabel}
        >
          {selection?.isLocked ? <Lock className="h-2.5 w-2.5" /> : <Unlock className="h-2.5 w-2.5" />}
          <span className="sr-only">{lockActionLabel}</span>
        </button>
        <button
          type="button"
          onClick={() => onRemove(player.playerId)}
          className="inline-flex h-5 w-5 items-center justify-center rounded border border-slate-200 text-rose-700 hover:bg-rose-50"
          aria-label={removeActionLabel}
        >
          <Trash2 className="h-2.5 w-2.5" />
          <span className="sr-only">{removeActionLabel}</span>
        </button>
      </div>
    </div>
  );
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

function signedNumber(value: number) {
  if (value > 0) return `+${formatNumber(value, 1)}`;
  return formatNumber(value, 1);
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

function compactFixtureLabel(label: string) {
  return label.replace(/\s*\(([HhAa])\)$/, (_, side: string) => ` ${side.toUpperCase()}`);
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
