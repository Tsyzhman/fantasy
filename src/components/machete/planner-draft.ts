/** @spec spec://common/INFRA-006-continuous-deployment#runtime */
import type { FantasySquadRoundPlan } from "@/machete/squad_logic";
export type PlannerDraft = { version: 1; updatedAt: number; baseline: string; roundPlans: FantasySquadRoundPlan[]; horizon: number; activeRoundOffset: number; transferBaselinePlayerIds: string[]; openingFreeTransfers: number | null };
export const draftPrefix = "fantasy-planner-draft:";
export function parsePlannerDraft(raw: string | null, baseline: string, now = Date.now()): PlannerDraft | null {
  if (!raw || raw.length > 65536 || new TextEncoder().encode(raw).byteLength > 65536) return null;
  try {
    const value = JSON.parse(raw) as PlannerDraft;
    if (value.version !== 1 || value.baseline !== baseline || !Number.isFinite(value.updatedAt) || value.updatedAt > now || now - value.updatedAt > 86400000
      || !Number.isInteger(value.horizon) || value.horizon < 1 || value.horizon > 10 || !Array.isArray(value.roundPlans) || value.roundPlans.length < 1 || value.roundPlans.length > 10
      || !Number.isInteger(value.activeRoundOffset) || value.activeRoundOffset < 0 || value.activeRoundOffset >= value.roundPlans.length
      || !Array.isArray(value.transferBaselinePlayerIds) || value.transferBaselinePlayerIds.length > 25
      || value.transferBaselinePlayerIds.some(id => typeof id !== "string" || id.length > 384)
      || value.openingFreeTransfers !== null && (!Number.isInteger(value.openingFreeTransfers) || value.openingFreeTransfers < 0 || value.openingFreeTransfers > 100)) return null;
    for (const plan of value.roundPlans) {
      if (!Number.isInteger(plan.roundOffset) || plan.roundOffset < 0 || plan.roundOffset > 9 || typeof plan.linkedToPrevious !== "boolean" || !Array.isArray(plan.selections) || plan.selections.length > 25
        || new Set(plan.selections.map(s => s.playerId)).size !== plan.selections.length
        || plan.selections.some(s => typeof s.playerId !== "string" || s.playerId.length > 384 || [s.isStarter, s.isLocked, s.isCaptain, s.isViceCaptain].some(flag => typeof flag !== "boolean") || !Number.isInteger(s.slotIndex))) return null;
    }
    return value;
  } catch { return null; }
}
export function writePlannerDraft(storage: Storage, key: string, value: PlannerDraft | null) {
  if (!value) { storage.removeItem(key); return; }
  const raw = JSON.stringify(value); if (raw.length > 65536 || new TextEncoder().encode(raw).byteLength > 65536) return;
  const keys = Array.from({ length: storage.length }, (_, index) => storage.key(index)).filter((key): key is string => Boolean(key?.startsWith(draftPrefix)));
  for (const existing of keys) {
    try { const draft = JSON.parse(storage.getItem(existing)!); if (Date.now() - draft.updatedAt > 86400000) storage.removeItem(existing); } catch { storage.removeItem(existing); }
  }
  const retained = keys.filter(existing => existing !== key && storage.getItem(existing)).sort((a, b) => JSON.parse(storage.getItem(a)!).updatedAt - JSON.parse(storage.getItem(b)!).updatedAt);
  while (retained.length >= 8) storage.removeItem(retained.shift()!);
  storage.setItem(key, raw);
}
