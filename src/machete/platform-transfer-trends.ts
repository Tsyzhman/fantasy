/** @spec spec://modules/machete/FEAT-008-platform-transfer-trends#counting */
import { isFantasySquadPlayerId } from "./squad_logic";

export type PlatformTransferEntry = {
  playerId: string;
  name: string;
  team: string | null;
  position: string | null;
  count: number;
  percent: number;
};

export type PlatformTransferTrends = {
  contestId: string;
  provider: string;
  season: string;
  status: "READY" | "NO_BASELINE" | "NO_COMPARABLE_SQUADS" | "NO_NEXT_ROUND";
  baselineRound: { id: string; label: string } | null;
  targetRound: { id: string; label: string } | null;
  asOf: string;
  participants: number;
  compared: number;
  excluded: number;
  buys: PlatformTransferEntry[];
  sells: PlatformTransferEntry[];
};

export function platformRosterIds(value: unknown, size: number, module: "football" | "khl"): string[] | null {
  if (!Array.isArray(value) || value.length !== size) return null;
  const ids = value.map((item) => typeof item === "string" ? item : record(item)?.playerId ?? record(item)?.id);
  if (ids.some((id) => typeof id !== "string" || !id || id.length > 384
    || (module === "football" && (!isFantasySquadPlayerId(id)
      || (/^\d+$/.test(id) && (!/^[1-9]\d{0,18}$/.test(id) || BigInt(id) > 9223372036854775807n)))))) return null;
  const strings = ids as string[];
  return new Set(strings).size === size ? strings : null;
}

/** Select by round identity so an old offset-zero plan cannot become a new round's purchases. */
export function platformSavedFootballRoster(input: {
  filters: unknown;
  fallback: unknown;
  targetRoundId: string;
  updatedAt: Date;
  baselineStartsAt: Date;
}): unknown {
  const filters = record(input.filters);
  const roundIds = filters?.roundPlanRoundIds;
  const explicitRounds = Array.isArray(roundIds) && roundIds.length > 0;
  const offset = explicitRounds ? roundIds.indexOf(input.targetRoundId) : 0;
  if (offset < 0 || (!explicitRounds && input.updatedAt < input.baselineStartsAt)) return null;
  const plans = filters?.roundPlans;
  if (Array.isArray(plans)) {
    const plan = plans.find((item) => record(item)?.roundOffset === offset);
    // A present but broken/empty plan is not replaced with an older roster.
    return plan ? record(plan)?.selections : null;
  }
  return explicitRounds ? null : input.fallback;
}

/** Batches contain one latest variant per user, guaranteed by the database reader. */
export class PlatformTransferCounter {
  participants = 0;
  compared = 0;
  private readonly buys = new Map<string, number>();
  private readonly sells = new Map<string, number>();

  add(current: unknown, baseline: unknown, size: number, module: "football" | "khl") {
    this.participants += 1;
    const currentIds = platformRosterIds(current, size, module);
    const baselineIds = platformRosterIds(baseline, size, module);
    if (!currentIds || !baselineIds) return;
    this.compared += 1;
    const currentSet = new Set(currentIds), baselineSet = new Set(baselineIds);
    for (const id of currentIds) if (!baselineSet.has(id)) this.buys.set(id, (this.buys.get(id) ?? 0) + 1);
    for (const id of baselineIds) if (!currentSet.has(id)) this.sells.set(id, (this.sells.get(id) ?? 0) + 1);
  }

  top(direction: "buys" | "sells") {
    return [...this[direction]].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "en"))
      .slice(0, 5).map(([playerId, count]) => ({ playerId, count, percent: count * 100 / this.compared }));
  }
}

export function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}
