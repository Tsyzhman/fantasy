"use client";

import { Check, Lock, Plus, Save, Search, Sparkles, Star, Trash2, Unlock } from "lucide-react";
import { useMemo, useState, useTransition } from "react";

import { formatDate, formatNumber, formatScore } from "@/lib/format";
import {
  buildTransferSuggestions,
  canAddFantasyPlayer,
  canStartFantasyPlayer,
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

export function FantasySquadPlanner({ leagueId, season, rules, rounds, players, initialSquad, priceStatus }: FantasySquadPlannerProps) {
  const initialHorizon = initialSquad.horizonRounds || 5;
  const [selections, setSelections] = useState<FantasySquadSelection[]>(() => normalizeInitialSelections(initialSquad.selections, players, rules));
  const [horizon, setHorizon] = useState(initialHorizon);
  const [transferCount, setTransferCount] = useState(initialHorizon);
  const [query, setQuery] = useState("");
  const [positionFilter, setPositionFilter] = useState("ALL");
  const [onlyAffordable, setOnlyAffordable] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const selectionsByPlayerId = useMemo(() => new Map(selections.map((selection) => [selection.playerId, selection])), [selections]);
  const summary = useMemo(() => summarizeFantasySquad(players, selections, rules, horizon), [players, selections, rules, horizon]);
  const suggestions = useMemo(
    () => buildTransferSuggestions({ pool: players, selections, rules, horizon, transferCount }),
    [players, selections, rules, horizon, transferCount]
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
      .filter((player) => (onlyAffordable ? canAddFantasyPlayer(player, players, selections, rules) || selectionsByPlayerId.has(player.playerId) : true))
      .slice(0, 140);
  }, [onlyAffordable, players, positionFilter, query, rules, selections, selectionsByPlayerId]);

  function addPlayer(player: FantasyPlannerPlayer) {
    if (!canAddFantasyPlayer(player, players, selections, rules)) {
      setMessage("Player does not fit budget, team limit, position slots, or squad size.");
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
    if (!selection.isStarter && !canStartFantasyPlayer(player, players, selections, rules)) {
      setMessage("Starting XI does not fit formation limits.");
      return;
    }
    setSelections((current) => current.map((item) => (item.playerId === playerId ? { ...item, isStarter: !item.isStarter } : item)));
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
        <div className="rounded border border-slate-200 bg-white p-4 shadow-soft">
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
            <Metric label="Sports.ru prices" value={`${priceStatus.sportsRuPrices}/${players.length}`} />
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <label className="text-sm">
              <span className="mb-1 block text-xs font-semibold uppercase text-slate-500">Forecast</span>
              <select
                value={horizon}
                onChange={(event) => {
                  const next = Number(event.target.value);
                  setHorizon(next);
                  setTransferCount(next);
                }}
                className="rounded border border-slate-200 px-3 py-2"
              >
                {rules.horizonOptions.map((option) => (
                  <option key={option} value={option}>
                    {option} rounds
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-xs font-semibold uppercase text-slate-500">Transfers</span>
              <select value={transferCount} onChange={(event) => setTransferCount(Number(event.target.value))} className="rounded border border-slate-200 px-3 py-2">
                {[1, 2, 3, 5, 10]
                  .filter((option) => option <= horizon)
                  .map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
              </select>
            </label>
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
            <div className="rounded border border-emerald-200 bg-emerald-900/90 p-3">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <h4 className="text-sm font-bold uppercase tracking-wide text-white">Starting XI</h4>
                <StarterCounts summary={summary.startersByPosition} rules={rules} />
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                {rosterPositions.map((position) => (
                  <SquadPositionGroup
                    key={`starter:${position}`}
                    position={position}
                    players={summary.starterPlayers.filter((player) => player.positionGroup === position)}
                    selectionsByPlayerId={selectionsByPlayerId}
                    countLabel={starterLimitLabel(rules, position)}
                    horizon={horizon}
                    onRemove={removePlayer}
                    onToggleLock={toggleLock}
                    onToggleStarter={toggleStarter}
                  />
                ))}
              </div>
            </div>

            <div className="mt-3 rounded border border-slate-200 bg-slate-50 p-3">
              <div className="mb-3 flex items-center justify-between">
                <h4 className="text-sm font-bold uppercase tracking-wide text-slate-500">Bench</h4>
                <span className="text-xs font-semibold text-slate-500">{summary.benchPlayers.length}/{rules.benchSize}</span>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                {positionOrder.map((position) => (
                <SquadPositionGroup
                  key={`bench:${position}`}
                  position={position}
                  players={summary.benchPlayers.filter((player) => player.positionGroup === position)}
                  selectionsByPlayerId={selectionsByPlayerId}
                  horizon={horizon}
                  onRemove={removePlayer}
                  onToggleLock={toggleLock}
                  onToggleStarter={toggleStarter}
                />
              ))}
              </div>
            </div>
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
            <div className="overflow-hidden rounded border border-slate-200">
              <table className="min-w-full divide-y divide-slate-200 text-sm">
                <thead className="bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500">
                  <tr>
                    <th className="px-3 py-3">Player</th>
                    <th className="px-3 py-3">Fix</th>
                    <th className="px-3 py-3 text-right">Next</th>
                    <th className="px-3 py-3 text-right">{horizon}R</th>
                    <th className="px-3 py-3 text-right">Price</th>
                    <th className="w-12 px-3 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredPlayers.map((player) => {
                    const selected = selectionsByPlayerId.has(player.playerId);
                    return (
                      <tr key={player.playerId} className={selected ? "bg-emerald-50/70" : "hover:bg-slate-50"}>
                        <td className="min-w-0 px-3 py-3">
                          <p className="max-w-[220px] truncate font-semibold text-ink" title={player.name}>{player.name}</p>
                          <p className="max-w-[220px] truncate text-xs text-slate-500" title={player.teamName}>
                            {player.positionGroup} / {player.teamName}
                          </p>
                        </td>
                        <td className="max-w-[150px] px-3 py-3 text-xs text-slate-500">
                          <span className="block truncate" title={player.fixtures.slice(0, horizon).filter(Boolean).join(" / ")}>
                            {player.fixtures.slice(0, horizon).filter(Boolean).join(" / ") || "-"}
                          </span>
                        </td>
                        <td className="whitespace-nowrap px-3 py-3 text-right font-semibold text-emerald-700">{formatScore(player.roundPoints[0] ?? 0)}</td>
                        <td className="whitespace-nowrap px-3 py-3 text-right text-slate-700">{formatScore(playerHorizonPoints(player, horizon))}</td>
                        <td className="whitespace-nowrap px-3 py-3 text-right">
                          <span className={player.priceSource === "SPORTS_RU" ? "font-semibold text-ink" : "text-slate-500"}>{formatNumber(player.price, 1)}</span>
                        </td>
                        <td className="px-3 py-3 text-right">
                          {selected ? (
                            <button type="button" onClick={() => removePlayer(player.playerId)} className="inline-flex h-8 w-8 items-center justify-center rounded border border-slate-200 text-rose-700 hover:bg-rose-50" title="Remove">
                              <Trash2 className="h-4 w-4" />
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => addPlayer(player)}
                              className="inline-flex h-8 w-8 items-center justify-center rounded border border-slate-200 text-emerald-700 hover:bg-emerald-50 disabled:text-slate-300"
                              disabled={!canAddFantasyPlayer(player, players, selections, rules)}
                              title="Add"
                            >
                              <Plus className="h-4 w-4" />
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                  {filteredPlayers.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-10 text-center text-slate-500">No players match the filters.</td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </section>

      {rounds.length > 0 ? (
        <section className="overflow-hidden rounded border border-slate-200 bg-white shadow-soft">
          <div className="border-b border-slate-200 px-4 py-3">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Round forecast</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
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
                      {formatScore(summary.starterPlayers.reduce((total, player) => total + (player.roundPoints[index] ?? 0), 0))}
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
            </table>
          </div>
        </section>
      ) : null}
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
  return (
    <div className="flex flex-wrap gap-2 text-xs font-semibold text-white/90">
      {rosterPositions.map((position) => (
        <span key={position} className="rounded border border-white/20 bg-white/10 px-2 py-1">
          {position} {summary[position]}/{starterLimitLabel(rules, position)}
        </span>
      ))}
    </div>
  );
}

function SquadPositionGroup({
  position,
  players,
  selectionsByPlayerId,
  countLabel,
  horizon,
  onRemove,
  onToggleLock,
  onToggleStarter
}: {
  position: FantasyPositionGroup;
  players: FantasyPlannerPlayer[];
  selectionsByPlayerId: Map<string, FantasySquadSelection>;
  countLabel?: string;
  horizon: number;
  onRemove: (playerId: string) => void;
  onToggleLock: (playerId: string) => void;
  onToggleStarter: (playerId: string) => void;
}) {
  if (position === "UNK" && players.length === 0) return null;

  return (
    <div className="rounded border border-white/20 bg-white/90 p-3">
      <div className="mb-2 flex items-center justify-between">
        <h4 className="text-sm font-bold text-ink">{position}</h4>
        {countLabel ? <span className="text-xs font-semibold text-slate-500">{players.length}/{countLabel}</span> : null}
      </div>
      <div className="space-y-2">
        {players.map((player) => {
          const selection = selectionsByPlayerId.get(player.playerId);
          return (
            <div key={player.playerId} className="rounded border border-slate-200 bg-white px-3 py-2 shadow-sm">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-ink" title={player.name}>{player.name}</p>
                  <p className="truncate text-xs text-slate-500" title={player.teamName}>{player.teamName}</p>
                </div>
                <div className="flex gap-1">
                  <button
                    type="button"
                    onClick={() => onToggleStarter(player.playerId)}
                    className={`inline-flex h-7 w-7 items-center justify-center rounded border border-slate-200 hover:bg-amber-50 ${selection?.isStarter ? "text-amber-600" : "text-slate-500"}`}
                    title={selection?.isStarter ? "Move to bench" : "Move to starting XI"}
                  >
                    <Star className={`h-3.5 w-3.5 ${selection?.isStarter ? "fill-current" : ""}`} />
                  </button>
                  <button type="button" onClick={() => onToggleLock(player.playerId)} className="inline-flex h-7 w-7 items-center justify-center rounded border border-slate-200 text-slate-600 hover:bg-slate-50" title={selection?.isLocked ? "Unlock" : "Lock"}>
                    {selection?.isLocked ? <Lock className="h-3.5 w-3.5" /> : <Unlock className="h-3.5 w-3.5" />}
                  </button>
                  <button type="button" onClick={() => onRemove(player.playerId)} className="inline-flex h-7 w-7 items-center justify-center rounded border border-slate-200 text-rose-700 hover:bg-rose-50" title="Remove">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
              <div className="mt-2 flex items-center justify-between text-xs">
                <span className="text-slate-500">Price {formatNumber(player.price, 1)}</span>
                <span className="font-semibold text-emerald-700">
                  <Check className="mr-1 inline h-3.5 w-3.5" />
                  {formatScore(playerHorizonPoints(player, horizon))}
                </span>
              </div>
            </div>
          );
        })}
        {players.length === 0 ? <div className="rounded border border-dashed border-slate-300 bg-white/80 px-3 py-8 text-center text-sm text-slate-500">Empty</div> : null}
      </div>
    </div>
  );
}

function signedNumber(value: number) {
  if (value > 0) return `+${formatNumber(value, 1)}`;
  return formatNumber(value, 1);
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
