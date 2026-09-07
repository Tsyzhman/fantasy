/** @spec spec://modules/machete/FEAT-004-rotation-risk#formula */
export const ROTATION_RISK_VERSION = "RR_V1" as const;
export const ROTATION_RISK_TTL_MS = 86400000;
const windows = [50, 20, 10, 5] as const;
const weights = [0.15, 0.20, 0.25, 0.25] as const;
export type RotationWindow = { window: number; starts: number; bench: number; risk: number | null };
export type RotationRisk = {
  version: typeof ROTATION_RISK_VERSION;
  value: number | null;
  windows: RotationWindow[];
  restDays: number | null;
  restRisk: number | null;
  observedAt: string;
  kickoffAt: string | null;
  expiresAt: string;
  reasons: string[];
};
export type RotationObservation = { matchId: string; matchDate: string | Date; started: boolean | null };

export function rotationRestRisk(days: number | null): number | null {
  if (days === null || !Number.isFinite(days) || days < 0) return null;
  const whole = Math.floor(days);
  return whole <= 1 ? 1 : whole === 2 ? 0.72 : whole === 3 ? 0.4 : whole === 4 ? 0.16 : 0;
}

export function weightedRotationRisk(risks: readonly (number | null)[], restRisk: number | null): number | null {
  if (risks.length !== 4 || restRisk === null || !Number.isFinite(restRisk) || restRisk < 0 || restRisk > 1
    || risks.some((risk) => risk === null || !Number.isFinite(risk) || risk < 0 || risk > 1)) return null;
  return Math.min(1, Math.max(0, risks.reduce<number>((sum, risk, i) => sum + risk! * weights[i], 0) + 0.15 * restRisk));
}

export function calculateRotationRisk(input: {
  history: readonly RotationObservation[]; lastPlayedAt: string | Date | null;
  kickoffAt: string | Date | null; observedAt: string | Date;
}): RotationRisk {
  const now = new Date(input.observedAt).getTime();
  if (!Number.isFinite(now)) throw new Error("Invalid rotation-risk observation time");
  const kickoff = input.kickoffAt === null ? NaN : new Date(input.kickoffAt).getTime();
  const validKickoff = Number.isFinite(kickoff) && kickoff > now;
  const cutoff = validKickoff ? Math.min(now, kickoff) : now;
  const distinct = new Map<string, RotationObservation>();
  for (const row of [...input.history].sort((a, b) => +new Date(b.matchDate) - +new Date(a.matchDate) || a.matchId.localeCompare(b.matchId))) {
    if (!row.matchId || typeof row.started !== "boolean" || !Number.isFinite(+new Date(row.matchDate)) || +new Date(row.matchDate) >= cutoff) continue;
    if (!distinct.has(row.matchId)) distinct.set(row.matchId, row);
    if (distinct.size === 50) break;
  }
  const history = [...distinct.values()];
  const counts = windows.map((window): RotationWindow => {
    const sample = history.slice(0, window);
    const starts = sample.filter((row) => row.started).length;
    const bench = sample.length - starts;
    return { window, starts, bench, risk: sample.length ? bench / sample.length : null };
  });
  const lastPlayed = input.lastPlayedAt === null ? NaN : +new Date(input.lastPlayedAt);
  const restDays = validKickoff && Number.isFinite(lastPlayed) && lastPlayed < cutoff ? Math.floor((kickoff - lastPlayed) / 86400000) : null;
  const restRisk = rotationRestRisk(restDays);
  const reasons: string[] = [];
  if (!history.length) reasons.push("NO_KNOWN_LINEUPS");
  else if (history.length < 50) reasons.push("SHORT_HISTORY");
  if (!validKickoff) reasons.push("NO_FUTURE_FIXTURE");
  else if (restRisk === null) reasons.push("UNKNOWN_REST");
  return { version: ROTATION_RISK_VERSION, value: weightedRotationRisk(counts.map((row) => row.risk), restRisk), windows: counts,
    restDays, restRisk, observedAt: new Date(now).toISOString(), kickoffAt: validKickoff ? new Date(kickoff).toISOString() : null,
    expiresAt: new Date(Math.min(now + ROTATION_RISK_TTL_MS, validKickoff ? kickoff : now + ROTATION_RISK_TTL_MS)).toISOString(), reasons };
}

export function currentRotationRisk(risk: RotationRisk | null | undefined, now = Date.now()): number | null {
  if (!risk || risk.version !== ROTATION_RISK_VERSION || risk.value === null || !Number.isFinite(risk.value)
    || risk.value < 0 || risk.value > 1 || !Number.isFinite(now) || !(now >= Date.parse(risk.observedAt)) || !(now < Date.parse(risk.expiresAt))) return null;
  return risk.value;
}

/** @spec spec://modules/machete/FEAT-004-rotation-risk#scenarios */
export function rotationRiskDescription(risk: RotationRisk | null | undefined, language: "ru" | "en", now = Date.now()): string {
  const ru = language === "ru";
  if (!risk) return ru ? "RR неизвестен: история ещё не загружена." : "RR unknown: history has not been loaded.";
  const value = currentRotationRisk(risk, now);
  const lines = [ru ? "RR — риск ротации на ближайший матч. Baseline, не откалиброванная вероятность." : "RR — next-match rotation risk. Baseline, not a calibrated probability.",
    "RR = 0.15 R50 + 0.20 R20 + 0.25 R10 + 0.25 R5 + 0.15 Rrest",
    ...risk.windows.map((w) => `R${w.window}: ${w.bench}/${w.starts + w.bench} = ${w.risk === null ? "—" : `${(100 * w.risk).toFixed(1)}%`}`),
    ru ? `Дней отдыха: ${risk.restDays ?? "—"}; Rrest: ${risk.restRisk ?? "—"}.` : `Rest days: ${risk.restDays ?? "—"}; Rrest: ${risk.restRisk ?? "—"}.`];
  if (risk.reasons.includes("SHORT_HISTORY")) lines.push(ru ? "Неполные окна: использована фактическая известная история." : "Incomplete windows use the actual known history.");
  if (risk.reasons.includes("NO_KNOWN_LINEUPS")) lines.push(ru ? "Нет известных стартов/скамейки." : "No known starts/bench observations.");
  if (risk.reasons.includes("NO_FUTURE_FIXTURE")) lines.push(ru ? "Нет ближайшего будущего матча." : "No upcoming fixture.");
  if (risk.reasons.includes("UNKNOWN_REST")) lines.push(ru ? "Отдых неизвестен: нет последнего сыгранного матча." : "Rest unknown: no last played match.");
  if (value === null && risk.value !== null) lines.push(ru ? "RR устарел: требуется обновление пула." : "RR expired: refresh the player pool.");
  lines.push(ru ? "Пропуски и неизвестные статусы не считаются скамейкой. История ограничена загруженными составами." : "Absences and unknown roles do not count as bench. History is limited to loaded lineups.");
  return lines.join("\n");
}
