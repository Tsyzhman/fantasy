"use client";

import { Check, Lock, Plus, Save, Search, Sparkles, Star, Trash2, Unlock } from "lucide-react";
import { useMemo, useState, useTransition } from "react";

import { SortableTable } from "@/components/sortable-table";
import { formatDate, formatNumber, formatScore } from "@/lib/format";
import {
  buildTransferSuggestions,
  canStartFantasyPlayer,
  fantasyAddBlockReason,
  nextFantasyPoints,
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
const transfersPerRound = 3;

export function FantasySquadPlanner({ leagueId, season, rules, rounds, players, initialSquad, priceStatus }: FantasySquadPlannerProps) {
  const initialHorizon = initialSquad.horizonRounds || 5;
  const [selections, setSelections] = useState<FantasySquadSelection[]>(() => normalizeInitialSelections(initialSquad.selections, players, rules));
  const [horizon, setHorizon] = useState(initialHorizon);
  const [query, setQuery] = useState("");
  const [positionFilter, setPositionFilter] = useState("ALL");
  const [onlyAffordable, setOnlyAffordable] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const selectionsByPlayerId = useMemo(() => new Map(selections.map((selection) => [selection.playerId, selection])), [selections]);
  const summary = useMemo(() => summarizeFantasySquad(players, selections, rules, horizon), [players, selections, rules, horizon]);
  const suggestions = useMemo(
    () => buildTransferSuggestions({ pool: players, selections, rules, horizon, transferCount: transfersPerRound }),
    [players, selections, rules, horizon]
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
      .filter((player) => (onlyAffordable ? fantasyAddBlockReason(player, players, selections, rules) === null || selectionsByPlayerId.has(player.playerId) : true))
      .slice(0, 140);
  }, [onlyAffordable, players, positionFilter, query, rules, selections, selectionsByPlayerId]);

  function addPlayer(player: FantasyPlannerPlayer) {
    const blockReason = fantasyAddBlockReason(player, players, selections, rules);
    if (blockReason) {
      setMessage(blockReason);
      return;
    }
    setSelections((current) => [...current, selectionForNewPlayer(player, players, current, rules)]);
    setMessage(null);
  }

  function removePlayer(playerId: string) {
    setSelections((current) => current.filter((selection) => selection.playerId !== playerId).map((selection, index) => ({ ...selection, slotIndex: index })));
  }

  function toggleLock(playerId: string) {
    setSelections((current) => current.map((selection) => (selection.playerId === playerId ? { ...selection, isLocked: !selection.isLocked } : selection)));
  }

  function toggleStarter(playerId: string) {
    const selection = selectionsByPlayerId.get(playerId);
    const player = players.find((candidate) => candidate.playerId === playerId);
    if (!selection || !player) return;
    if (selection.isStarter) {
      setSelections((current) => current.map((item) => (item.playerId === playerId ? { ...item, isStarter: false } : item)));
      setMessage(null);
      return;
    }

    const promoted = promoteStarter(player, players, selections, rules, horizon);
    if (!promoted) {
      setMessage("Starting XI needs 1 GK and 10 outfield players within formation limits.");
      return;
    }
    setSelections(promoted);
    setMessage(null);
  }

  function applySuggestion(suggestion: TransferSuggestion) {
    const incoming = players.find((player) => player.playerId === suggestion.inPlayerId);
    if (!incoming) return;
    setSelections((current) => {
      const outSelection = current.find((selection) => selection.playerId === suggestion.outPlayerId);
      const slotIndex = outSelection?.slotIndex ?? current.length;
      return [
        ...current.filter((selection) => selection.playerId !== suggestion.outPlayerId),
        selectionForPlayer(incoming, slotIndex, outSelection?.isStarter ?? true)
      ].sort((left, right) => left.slotIndex - right.slotIndex);
    });
  }

  function saveSquad() {
    startTransition(async () => {
      setMessage(null);
      const response = await fetch("/api/machete/squads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          leagueId,
          season,
          name: initialSquad.name,
          horizonRounds: horizon,
          selections
        })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setMessage(payload?.error?.message ?? "Failed to save squad.");
        return;
      }
      setMessage(`Saved ${payload.squad?.savedPlayers ?? selections.length} players.`);
    });
  }

  return (
    <div className="mt-6 space-y-5">
      <section className="grid grid-cols-1 gap-3 lg:grid-cols-[1.25fr_0.75fr]">
        <div className="rounded border border-slate-200 bg-white p-4 shadow-soft lg:sticky lg:top-24 lg:self-start">
          <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Squad builder</p>
              <h2 className="mt-1 text-2xl font-bold text-ink">{initialSquad.name}</h2>
              <p className="mt-1 text-sm text-slate-600">
                {summary.selectedPlayers.length}/{rules.squadSize} players, {summary.starterPlayers.length}/{rules.starterSize} starters, {summary.benchPlayers.length}/{rules.benchSize} bench.
              </p>
            </div>
            <button
              type="button"
              onClick={saveSquad}
              disabled={isPending}
              className="inline-flex items-center justify-center gap-2 rounded bg-ink px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-60"
            >
              <Save className="h-4 w-4" />
              {isPending ? "Saving" : "Save squad"}
            </button>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-5">
            <Metric label="Spent" value={formatNumber(summary.spent, 1)} tone={summary.spent > rules.budgetLimit ? "bad" : "default"} />
            <Metric label="Bank" value={formatNumber(summary.bank, 1)} tone={summary.bank < 0 ? "bad" : "good"} />
            <Metric label="Starting XI next" value={formatScore(summary.projectedNext)} tone="good" />
            <Metric label={`Starting XI ${horizon}R`} value={formatScore(summary.projectedHorizon)} tone="accent" />
            <Metric label="Sports.ru mapped" value={`${priceStatus.sportsRuPrices}`} />
          </div>

          <ol className="mt-4 grid grid-cols-1 gap-2 text-sm md:grid-cols-4">
            <PlannerStep index={1} title="Choose league" state="done" />
            <PlannerStep index={2} title="Build squad" state={summary.selectedPlayers.length >= rules.squadSize ? "done" : "active"} />
            <PlannerStep index={3} title="Fix rules" state={summary.violations.length === 0 ? "done" : "active"} />
            <PlannerStep index={4} title="Review upgrades" state={suggestions.length > 0 ? "active" : "idle"} />
          </ol>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <label className="text-sm">
              <span className="mb-1 block text-xs font-semibold uppercase text-slate-500">Forecast</span>
              <select
                value={horizon}
                onChange={(event) => setHorizon(Number(event.target.value))}
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
              <span className="mb-1 block text-xs font-semibold uppercase text-slate-500">Transfers</span>
              <div className="rounded border border-slate-200 px-3 py-2 text-slate-700">
                {transfersPerRound} per round, no carryover
              </div>
            </div>
            {priceStatus.lastSyncedAt ? <span className="text-sm text-slate-500">Prices synced {formatDate(priceStatus.lastSyncedAt)}</span> : null}
            {message ? <span className="rounded bg-amber-50 px-3 py-2 text-sm text-amber-800">{message}</span> : null}
          </div>

          {summary.violations.length > 0 ? (
            <div className="mt-4 rounded border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{summary.violations.join(" / ")}</div>
          ) : null}
          {summary.warnings.length > 0 ? (
            <div className="mt-3 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">{summary.warnings.join(" / ")}</div>
          ) : null}
          {rounds.length === 0 ? (
            <div className="mt-4 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              No upcoming fixtures are loaded for this league season yet, so round projections are zero until schedule ingestion has future matches.
            </div>
          ) : null}
        </div>

        <div className="rounded border border-slate-200 bg-white p-4 shadow-soft">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Transfer suggestions</h3>
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
                      for {suggestion.outName} / {suggestion.positionGroup}
                    </p>
                  </div>
                  <span className="whitespace-nowrap rounded bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700">
                    +{formatScore(suggestion.nextDelta)}
                  </span>
                </div>
                <p className="mt-1 text-xs text-slate-500">{suggestion.reason}; price {signedNumber(suggestion.priceDelta)}</p>
              </button>
            ))}
            {suggestions.length === 0 ? <p className="text-sm text-slate-500">No clean upgrade found for the selected filters.</p> : null}
          </div>
        </div>
      </section>

      <section className="rounded border border-slate-200 bg-white p-4 shadow-soft">
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[0.95fr_1.05fr]">
          <div>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Your squad</h3>
              <PositionCounts summary={summary.byPosition} rules={rules} />
            </div>
            <SquadPitch
              summary={summary}
              rules={rules}
              selectionsByPlayerId={selectionsByPlayerId}
              horizon={horizon}
              onRemove={removePlayer}
              onToggleLock={toggleLock}
              onToggleStarter={toggleStarter}
            />
          </div>

          <div>
            <div className="mb-3 grid grid-cols-1 gap-2 md:grid-cols-[1fr_auto_auto]">
              <label className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search player or team"
                  className="w-full rounded border border-slate-200 py-2 pl-9 pr-3 text-sm"
                />
              </label>
              <select value={positionFilter} onChange={(event) => setPositionFilter(event.target.value)} className="rounded border border-slate-200 px-3 py-2 text-sm">
                <option value="ALL">All positions</option>
                {positionOrder.map((position) => (
                  <option key={position} value={position}>
                    {position}
                  </option>
                ))}
              </select>
              <label className="flex items-center gap-2 rounded border border-slate-200 px-3 py-2 text-sm text-slate-700">
                <input type="checkbox" checked={onlyAffordable} onChange={(event) => setOnlyAffordable(event.target.checked)} className="h-4 w-4 rounded border-slate-300" />
                Fits
              </label>
            </div>
            <PlayerPoolTable
              players={filteredPlayers}
              horizon={horizon}
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
            <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Round forecast</h3>
          </div>
          <div className="overflow-x-auto">
            <SortableTable className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-3">Round</th>
                  {rounds.map((round) => (
                    <th key={round.id} className="min-w-28 px-4 py-3 text-right">
                      {round.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="px-4 py-3 font-semibold text-ink">Starting XI FP</td>
                  {rounds.map((round, index) => (
                    <td key={round.id} className="px-4 py-3 text-right font-semibold text-emerald-700">
                      {formatScore(summary.starterPlayers.reduce((total, player) => total + (player.roundPoints[index] ?? (index === 0 ? player.predictedFp ?? 0 : 0)), 0))}
                    </td>
                  ))}
                </tr>
                <tr className="border-t border-slate-100">
                  <td className="px-4 py-3 text-slate-500">Fixtures</td>
                  {rounds.map((round) => (
                    <td key={round.id} className="px-4 py-3 text-right text-slate-500">
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
  addBlockReason,
  selectionsByPlayerId,
  onAdd,
  onRemove
}: {
  players: FantasyPlannerPlayer[];
  horizon: number;
  addBlockReason: (player: FantasyPlannerPlayer) => string | null;
  selectionsByPlayerId: Map<string, FantasySquadSelection>;
  onAdd: (player: FantasyPlannerPlayer) => void;
  onRemove: (playerId: string) => void;
}) {
  return (
    <div className="overflow-hidden rounded border border-slate-200 bg-white">
      <div className="max-h-[720px] overflow-auto">
        <SortableTable className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="sticky top-0 z-10 bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500">
            <tr>
              <th className="px-3 py-3">Player</th>
              <th className="px-3 py-3">Team</th>
              <th className="px-3 py-3">Pos</th>
              <th className="px-3 py-3 text-right">Price</th>
              <th className="px-3 py-3 text-right">Next</th>
              <th className="px-3 py-3 text-right">{horizon}R</th>
              <th className="px-3 py-3">Fixtures</th>
              <th className="px-3 py-3 text-right">Add</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {players.map((player) => {
              const reason = addBlockReason(player);
              const isSelected = selectionsByPlayerId.has(player.playerId);
              const disabled = !isSelected && reason !== null;
              const fixtures = player.fixtures.slice(0, horizon).filter(Boolean).join(" / ");
              const rowClassName = isSelected
                ? "bg-emerald-50/60"
                : disabled
                  ? "bg-slate-50/80 text-slate-400"
                  : "hover:bg-slate-50";

              return (
                <tr key={player.playerId} className={rowClassName}>
                  <td className="min-w-44 px-3 py-2">
                    <span className={`block truncate font-semibold ${disabled ? "text-slate-500" : "text-ink"}`} title={player.name}>{player.name}</span>
                    <span className={`block text-xs ${disabled ? "text-slate-400" : "text-slate-500"}`}>FP {formatScore(player.predictedFp)}</span>
                  </td>
                  <td className={`min-w-36 px-3 py-2 ${disabled ? "text-slate-400" : "text-slate-600"}`}>
                    <span className="block truncate" title={player.teamName}>{player.teamName}</span>
                  </td>
                  <td className="px-3 py-2">
                    <span className={`rounded px-2 py-0.5 text-[11px] font-bold ${disabled ? "border border-slate-300 bg-slate-200 text-slate-500" : positionPillClass(player.positionGroup)}`}>{player.positionGroup}</span>
                  </td>
                  <td className={`whitespace-nowrap px-3 py-2 text-right font-semibold ${disabled ? "text-slate-400" : "text-ink"}`}>{formatNumber(player.price, 1)}</td>
                  <td className={`whitespace-nowrap px-3 py-2 text-right font-semibold ${disabled ? "text-slate-400" : "text-emerald-700"}`}>{formatScore(nextFantasyPoints(player))}</td>
                  <td className={`whitespace-nowrap px-3 py-2 text-right font-semibold ${disabled ? "text-slate-400" : "text-sky-700"}`}>{formatScore(playerHorizonPoints(player, horizon))}</td>
                  <td className="max-w-56 px-3 py-2 text-xs text-slate-500">
                    <span className="block truncate" title={fixtures}>{fixtures || "No fixture loaded"}</span>
                    {disabled ? (
                      <span
                        className="mt-1 inline-flex max-w-full items-center gap-1 rounded bg-rose-50 px-2 py-1 font-semibold text-rose-700"
                        title={reason ?? undefined}
                      >
                        <Lock className="h-3 w-3 shrink-0" />
                        <span className="truncate">{reason}</span>
                      </span>
                    ) : null}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {isSelected ? (
                      <button type="button" onClick={() => onRemove(player.playerId)} className="inline-flex h-8 w-8 items-center justify-center rounded border border-rose-200 bg-white text-rose-700 hover:bg-rose-50" title="Remove">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => onAdd(player)}
                        disabled={disabled}
                        className="inline-flex h-8 w-8 items-center justify-center rounded border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400"
                        title={reason ?? "Add"}
                      >
                        {disabled ? <Lock className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
            {players.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-10 text-center text-sm text-slate-500">
                  No Sports.ru mapped players match the filters.
                </td>
              </tr>
            ) : null}
          </tbody>
        </SortableTable>
      </div>
    </div>
  );
}

function Metric({ label, value, tone = "default" }: { label: string; value: string; tone?: "default" | "good" | "bad" | "accent" }) {
  const color = tone === "good" ? "text-emerald-700" : tone === "bad" ? "text-rose-700" : tone === "accent" ? "text-sky-700" : "text-ink";
  return (
    <div className="rounded border border-slate-200 bg-slate-50 px-3 py-2">
      <dt className="text-xs font-medium uppercase text-slate-400">{label}</dt>
      <dd className={`mt-1 text-lg font-bold ${color}`}>{value}</dd>
    </div>
  );
}

function PlannerStep({ index, title, state }: { index: number; title: string; state: "done" | "active" | "idle" }) {
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
    <div className="flex flex-wrap gap-2 text-xs font-semibold text-white/90">
      <span className="rounded border border-white/20 bg-white/10 px-2 py-1">Field {fieldPlayers}/10</span>
      {rosterPositions.map((position) => (
        <span key={position} className="rounded border border-white/20 bg-white/10 px-2 py-1">
          {position} {summary[position]}/{starterLimitLabel(rules, position)}
        </span>
      ))}
    </div>
  );
}

function BenchCounts({ summary, total, rules }: { summary: Record<FantasyPositionGroup, number>; total: number; rules: FantasySquadRules }) {
  const fieldPlayers = total - summary.GK;
  const requiredFieldPlayers = rules.benchSize - 1;
  return (
    <div className="flex flex-wrap gap-2 text-xs font-semibold text-slate-500">
      <span className="rounded border border-slate-200 bg-white px-2 py-1">Bench {total}/{rules.benchSize}</span>
      <span className="rounded border border-slate-200 bg-white px-2 py-1">GK {summary.GK}/1</span>
      <span className="rounded border border-slate-200 bg-white px-2 py-1">Field {fieldPlayers}/{requiredFieldPlayers}</span>
    </div>
  );
}

function SquadPitch({
  summary,
  rules,
  selectionsByPlayerId,
  horizon,
  onRemove,
  onToggleLock,
  onToggleStarter
}: {
  summary: ReturnType<typeof summarizeFantasySquad>;
  rules: FantasySquadRules;
  selectionsByPlayerId: Map<string, FantasySquadSelection>;
  horizon: number;
  onRemove: (playerId: string) => void;
  onToggleLock: (playerId: string) => void;
  onToggleStarter: (playerId: string) => void;
}) {
  const starterLines: Array<{ position: Exclude<FantasyPositionGroup, "UNK">; label: string }> = [
    { position: "DEF", label: "Defenders" },
    { position: "MID", label: "Midfielders" },
    { position: "FWD", label: "Forwards" }
  ];

  return (
    <div className="space-y-3">
      <div className="rounded border border-emerald-300 bg-emerald-900 p-3 shadow-inner">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h4 className="text-sm font-bold uppercase tracking-wide text-white">Starting XI</h4>
          <StarterCounts summary={summary.startersByPosition} rules={rules} />
        </div>
        <div className="relative overflow-hidden rounded border border-white/20 bg-emerald-800/80 px-3 py-4">
          <div className="pointer-events-none absolute inset-x-3 top-1/2 border-t border-white/15" />
          <div className="pointer-events-none absolute left-1/2 top-1/2 h-24 w-24 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/15" />
          <div className="relative space-y-4">
            <SquadLine
              label="Goalkeeper"
              position="GK"
              players={summary.starterPlayers.filter((player) => player.positionGroup === "GK")}
              selectionsByPlayerId={selectionsByPlayerId}
              countLabel={starterLimitLabel(rules, "GK")}
              horizon={horizon}
              onRemove={onRemove}
              onToggleLock={onToggleLock}
              onToggleStarter={onToggleStarter}
            />
            {starterLines.map((line) => (
              <SquadLine
                key={line.position}
                label={line.label}
                position={line.position}
                players={summary.starterPlayers.filter((player) => player.positionGroup === line.position)}
                selectionsByPlayerId={selectionsByPlayerId}
                countLabel={starterLimitLabel(rules, line.position)}
                horizon={horizon}
                onRemove={onRemove}
                onToggleLock={onToggleLock}
                onToggleStarter={onToggleStarter}
              />
            ))}
          </div>
        </div>
      </div>

      <div className="h-px bg-slate-300" />

      <div className="rounded border border-slate-200 bg-slate-50 p-3">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h4 className="text-sm font-bold uppercase tracking-wide text-slate-500">Bench</h4>
          <BenchCounts summary={summary.benchByPosition} total={summary.benchPlayers.length} rules={rules} />
        </div>
        <div className="flex flex-wrap justify-center gap-2">
          {summary.benchPlayers.map((player) => (
            <SquadPlayerTile
              key={player.playerId}
              player={player}
              selection={selectionsByPlayerId.get(player.playerId)}
              horizon={horizon}
              compact
              onRemove={onRemove}
              onToggleLock={onToggleLock}
              onToggleStarter={onToggleStarter}
            />
          ))}
          {summary.benchPlayers.length === 0 ? <div className="rounded border border-dashed border-slate-300 bg-white px-4 py-6 text-center text-sm text-slate-500">Empty</div> : null}
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
  countLabel,
  horizon,
  onRemove,
  onToggleLock,
  onToggleStarter
}: {
  label: string;
  position: Exclude<FantasyPositionGroup, "UNK">;
  players: FantasyPlannerPlayer[];
  selectionsByPlayerId: Map<string, FantasySquadSelection>;
  countLabel: string;
  horizon: number;
  onRemove: (playerId: string) => void;
  onToggleLock: (playerId: string) => void;
  onToggleStarter: (playerId: string) => void;
}) {
  return (
    <div>
      <div className="mb-2 flex items-center justify-center gap-2 text-xs font-bold uppercase tracking-wide text-white/85">
        <span>{label}</span>
        <span className="rounded border border-white/20 bg-white/10 px-2 py-0.5">{players.length}/{countLabel}</span>
      </div>
      <div className="flex min-h-24 flex-wrap items-stretch justify-center gap-2">
        {players.map((player) => (
          <SquadPlayerTile
            key={player.playerId}
            player={player}
            selection={selectionsByPlayerId.get(player.playerId)}
            horizon={horizon}
            onRemove={onRemove}
            onToggleLock={onToggleLock}
            onToggleStarter={onToggleStarter}
          />
        ))}
        {players.length === 0 ? <div className="flex min-h-20 w-32 items-center justify-center rounded border border-dashed border-white/25 bg-white/10 text-sm text-white/70">Empty</div> : null}
      </div>
    </div>
  );
}

function SquadPlayerTile({
  player,
  selection,
  horizon,
  compact = false,
  onRemove,
  onToggleLock,
  onToggleStarter
}: {
  player: FantasyPlannerPlayer;
  selection: FantasySquadSelection | undefined;
  horizon: number;
  compact?: boolean;
  onRemove: (playerId: string) => void;
  onToggleLock: (playerId: string) => void;
  onToggleStarter: (playerId: string) => void;
}) {
  return (
    <div className={`${compact ? "w-36" : "w-32 sm:w-36"} rounded border border-white/70 bg-white px-2.5 py-2 text-center shadow-sm`}>
      <div className="flex items-center justify-center gap-1">
        <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${positionPillClass(player.positionGroup)}`}>{player.positionGroup}</span>
        {selection?.isLocked ? <Lock className="h-3 w-3 text-slate-500" /> : null}
      </div>
      <p className="mt-1 truncate text-xs font-bold text-ink" title={player.name}>{player.name}</p>
      <p className="truncate text-[11px] text-slate-500" title={player.teamName}>{player.teamName}</p>
      <p className="mt-1 text-[11px] font-semibold text-emerald-700">
        <Check className="mr-1 inline h-3 w-3" />
        {formatScore(player.roundPoints.length > 0 ? playerHorizonPoints(player, horizon) : player.predictedFp)}
      </p>
      <div className="mt-2 flex justify-center gap-1">
        <button
          type="button"
          onClick={() => onToggleStarter(player.playerId)}
          className={`inline-flex h-6 w-6 items-center justify-center rounded border border-slate-200 hover:bg-amber-50 ${selection?.isStarter ? "text-amber-600" : "text-slate-500"}`}
          title={selection?.isStarter ? "Move to bench" : "Move to starting XI"}
        >
          <Star className={`h-3.5 w-3.5 ${selection?.isStarter ? "fill-current" : ""}`} />
        </button>
        <button type="button" onClick={() => onToggleLock(player.playerId)} className="inline-flex h-6 w-6 items-center justify-center rounded border border-slate-200 text-slate-600 hover:bg-slate-50" title={selection?.isLocked ? "Unlock" : "Lock"}>
          {selection?.isLocked ? <Lock className="h-3.5 w-3.5" /> : <Unlock className="h-3.5 w-3.5" />}
        </button>
        <button type="button" onClick={() => onRemove(player.playerId)} className="inline-flex h-6 w-6 items-center justify-center rounded border border-slate-200 text-rose-700 hover:bg-rose-50" title="Remove">
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

function signedNumber(value: number) {
  if (value > 0) return `+${formatNumber(value, 1)}`;
  return formatNumber(value, 1);
}

function positionPillClass(position: FantasyPositionGroup) {
  const base = "border border-black/10 text-white shadow-sm";
  if (position === "GK") return `${base} bg-violet-700`;
  if (position === "DEF") return `${base} bg-blue-700`;
  if (position === "MID") return `${base} bg-emerald-700`;
  if (position === "FWD") return `${base} bg-rose-700`;
  return `${base} bg-slate-700`;
}

function starterLimitLabel(rules: FantasySquadRules, position: Exclude<FantasyPositionGroup, "UNK">) {
  const limit = rules.starterPositionLimits[position];
  return limit.min === limit.max ? String(limit.max) : `${limit.min}-${limit.max}`;
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

  return normalized;
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
