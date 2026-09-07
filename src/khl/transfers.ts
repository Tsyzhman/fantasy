/** @spec spec://modules/khl/FEAT-002-khl-squad#transfers */
import type { KhlPlayer } from "./contracts";
import { transferAvailability, validateRoster } from "./rules";
export interface TransferStep { out: string; in: string }
export function previewTransfers(input: { selected: KhlPlayer[]; pool: KhlPlayer[]; bank: number | null; used: number | null; preSeason: boolean; steps: TransferStep[]; now: number }) {
  let players = [...input.selected];
  let bank = input.bank;
  const errors: string[] = [];
  if (!input.preSeason && (input.used === null || !Number.isInteger(input.used) || input.used < 0 || input.used > 5)) errors.push("UNKNOWN_TRANSFER_BALANCE");
  if (!input.preSeason && input.used !== null && input.used + input.steps.length > 5) errors.push("TRANSFER_LIMIT");
  if (input.steps.length > 17) errors.push("TRANSFER_LIMIT");
  for (const step of input.steps.slice(0, 17)) {
    const out = players.find(p => p.id === step.out);
    const incoming = input.pool.find(p => p.id === step.in);
    if (!out || !incoming || players.some(p => p.id === step.in)) { errors.push("INVALID_TRANSFER"); break; }
    if (out.position !== incoming.position || out.contestId !== incoming.contestId) { errors.push("POSITION_OR_CONTEST_MISMATCH"); break; }
    for (const player of [out, incoming]) { const reason = transferAvailability(player, input.now); if (reason) errors.push(reason); }
    bank = bank === null || out.price.value === null || incoming.price.value === null ? null : bank + out.price.value - incoming.price.value;
    players = players.map(p => p.id === step.out ? incoming : p);
    errors.push(...validateRoster(players, bank === null ? null : bank + players.reduce((sum, p) => sum + (p.price.value ?? 0), 0)));
    if (bank !== null && bank < 0) errors.push("BUDGET_EXCEEDED");
  }
  return { players, bank, violations: [...new Set(errors)], plannedTransfers: input.steps.length, externalExecuted: false as const };
}
