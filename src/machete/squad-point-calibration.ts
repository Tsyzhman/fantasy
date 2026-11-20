// @spec spec://modules/machete/FEAT-001-global-ranking-strategy#research-forecasts
import { roundForecastPoints, type FantasyPositionGroup } from "./squad_logic";
import models from "./squad-point-model.json";

type History = Readonly<Record<string, unknown>>;
type Model = (typeof models)["fo"];
export type SquadPointCalibration = { model: Model; playerEstimate: number };

function observed(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

export function squadPointHistory(
  position: FantasyPositionGroup, starter: boolean, history?: History, recent?: readonly number[]
) {
  const matches = observed(history?.matches_played);
  if (!history || position === "UNK" || matches <= 0) return null;
  const minutes = observed(history.minutes_played);
  const form = (recent ?? []).filter(Number.isFinite).slice(-5);
  const mean = (values: number[]) => values.reduce((sum, x) => sum + x, 0) / Math.max(1, values.length);
  const form5 = mean(form);
  const rate = (field: string) => minutes > 0 ? 90 * observed(history[field]) / Math.max(180, minutes) : 0;
  return {
    position, starter: Number(starter), form5, form3Minus5: mean(form.slice(-3)) - form5,
    minuteShare: Math.min(1, minutes / (90 * Math.max(1, matches))), historyCoverage: Math.min(1, matches / 5),
    xg90: rate("xg"), xa90: rate("xa"), shots90: rate("shots"),
    recoveries90: rate("recoveries"), saves90: rate("saves")
  };
}

export function squadPointCalibration(
  kind: keyof typeof models, history: ReturnType<typeof squadPointHistory>
): SquadPointCalibration | undefined {
  if (!history) return undefined;
  const model = models[kind];
  const c = model.coefficients;
  const playerEstimate = model.intercept + c[history.position] +
    c.starter * history.starter + c.form5 * history.form5 + c.form3Minus5 * history.form3Minus5 +
    c.minuteShare * history.minuteShare + c.historyCoverage * history.historyCoverage +
    c.xg90 * history.xg90 + c.xa90 * history.xa90 + c.shots90 * history.shots90 +
    c.recoveries90 * history.recoveries90 + c.saves90 * history.saves90;
  return { model, playerEstimate };
}

/** The archive exposes the component score at display precision. Keep the blended result
 * unrounded until every fixture in the provider round has been added. */
export function calibratedSquadFixturePoints(
  raw: number, home: boolean, calibration?: SquadPointCalibration
) {
  if (!calibration) return raw;
  const base = roundForecastPoints(raw);
  if (base <= 0) return raw;
  const { model, playerEstimate } = calibration;
  const estimate = playerEstimate + model.coefficients.base * base + model.coefficients.home * Number(home);
  return base + model.weight * (estimate - base);
}
