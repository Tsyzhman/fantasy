/** @spec spec://common/INFRA-006-continuous-deployment#runtime */
import type { FantasySquadRoundPlan } from "@/machete/squad_logic";
export type PlannerDraft = { publicationId?: string | null; roundIds?: string[]; version: 1; updatedAt: number; baseline: string; roundPlans: FantasySquadRoundPlan[]; horizon: number; activeRoundOffset: number; transferBaselinePlayerIds: string[]; openingFreeTransfers: number | null };
export const draftPrefix = "fantasy-planner-draft:";
export function parsePlannerDraft(raw: string | null, baseline: string, now = Date.now(), publication?: { id: string; roundIds: string[]; previousRoundIds?: string[]; saved: FantasySquadRoundPlan[] }): PlannerDraft | null {
  if (!raw || raw.length > 65536 || new TextEncoder().encode(raw).byteLength > 65536) return null;
  try {
    const value = JSON.parse(raw) as PlannerDraft;
    if (value.version !== 1 || typeof value.baseline !== "string" || !Number.isFinite(value.updatedAt) || value.updatedAt > now || now - value.updatedAt > 86400000
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
    if (value.roundIds !== undefined && (!Array.isArray(value.roundIds) || value.roundIds.length > 20 ||
        value.roundIds.some(id => typeof id !== "string" || id.length > 200))) return null;
    const crossedPublication = publication && (value.publicationId !== publication.id ||
      Boolean(value.roundIds && JSON.stringify(value.roundIds) !== JSON.stringify(publication.roundIds)));
    const draftRounds = value.roundIds ?? publication?.previousRoundIds;
    if (!crossedPublication) {
      if (value.baseline === baseline) return value;
      // Drafts written before lock state was included used five fields per selection.
      const legacy = JSON.parse(baseline) as { selections: unknown[][] }[];
      for (const plan of legacy) plan.selections = plan.selections.map(row => row.slice(0, 5));
      return JSON.stringify(legacy) === value.baseline ? value : null;
    }
    if (!draftRounds?.length) return null;
    const previous = JSON.parse(value.baseline);
    if (!Array.isArray(previous)) return null;
    const plans = publication.saved.map((plan, index) => {
      const old = draftRounds.indexOf(publication.roundIds[index]);
      const edited = value.roundPlans[old];
      if (!edited || !previous[old]) return plan;
      const saved = previous[old];
      if (!Array.isArray(saved.selections)) return plan;
      const baseBySlot = new Map<number, unknown[]>(saved.selections.map((row: unknown[]) => [Number(row[4]), row]));
      const changed = edited.selections.filter(s => {
        const oldRow = baseBySlot.get(s.slotIndex);
        const signature = [s.playerId, s.isStarter, s.isCaptain, s.isViceCaptain, s.slotIndex, s.isLocked];
        return !oldRow || JSON.stringify(signature.slice(0, oldRow.length)) !== JSON.stringify(oldRow);
      });
      const editedSlots = new Set(edited.selections.map(s => s.slotIndex));
      const removed = [...baseBySlot.keys()].filter(slot => !editedSlots.has(slot));
      if (!changed.length && !removed.length && saved.linkedToPrevious === edited.linkedToPrevious) return plan;
      const replaced = new Set([...removed, ...changed.map(s => s.slotIndex)]);
      const changedIds = new Set(changed.map(s => s.playerId));
      const selections = [...plan.selections.filter(s => !replaced.has(s.slotIndex) && !changedIds.has(s.playerId)), ...changed]
        .sort((left, right) => left.slotIndex - right.slotIndex);
      return { ...plan, selections, linkedToPrevious: index > 0 && edited.linkedToPrevious };
    });
    const activeRoundOffset = Math.max(0, publication.roundIds.indexOf(draftRounds[value.activeRoundOffset]));
    return { ...value, roundPlans: plans, activeRoundOffset, baseline, roundIds: publication.roundIds, publicationId: publication.id };
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
