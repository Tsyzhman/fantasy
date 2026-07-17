import type { PrismaClient, UserScoringPreference } from "@prisma/client";

import type { ActiveScoringModel, ScoringModelSource } from "@/lib/scoring";
import { getActiveScoringModelForSource } from "@/lib/scoring";
import { alternativeFormulaFields, scoringFormulaFields } from "@/lib/scoring/formula-display";
import { validateCustomFormula } from "@/lib/scoring/formula";

const maximumUserFormulaLength = 4_000;

export type UserScoringFormulaPreference = Pick<
  UserScoringPreference,
  | "scoringFormulaGk"
  | "scoringFormulaDef"
  | "scoringFormulaMid"
  | "scoringFormulaFwd"
  | "scoringFormulaEnabled"
  | "alternativeFormulaGk"
  | "alternativeFormulaDef"
  | "alternativeFormulaMid"
  | "alternativeFormulaFwd"
  | "alternativeFormulaEnabled"
>;

export async function getUserScoringModelForSource(
  client: PrismaClient,
  userId: string | null | undefined,
  source: ScoringModelSource
): Promise<ActiveScoringModel> {
  const baseModel = await getActiveScoringModelForSource(source, client);
  if (!userId) return baseModel;

  const preference = await client.userScoringPreference.findUnique({
    where: { userId_modelSource: { userId, modelSource: source } }
  });
  return applyUserScoringPreference(baseModel, preference);
}

export function applyUserScoringPreference(
  baseModel: ActiveScoringModel,
  preference: UserScoringFormulaPreference | null | undefined
): ActiveScoringModel {
  if (!preference) return baseModel;

  const scoringOverride = preference.scoringFormulaEnabled && hasAnyFormula(preference, "scoringFormula");
  const alternativeOverride = preference.alternativeFormulaEnabled && hasAnyFormula(preference, "alternativeFormula");
  if (!scoringOverride && !alternativeOverride) return baseModel;

  return {
    ...baseModel,
    ...(scoringOverride
      ? {
          scoringFormulaGk: formulaOrDefault(preference.scoringFormulaGk, baseModel.scoringFormulaGk),
          scoringFormulaDef: formulaOrDefault(preference.scoringFormulaDef, baseModel.scoringFormulaDef),
          scoringFormulaMid: formulaOrDefault(preference.scoringFormulaMid, baseModel.scoringFormulaMid),
          scoringFormulaFwd: formulaOrDefault(preference.scoringFormulaFwd, baseModel.scoringFormulaFwd),
          scoringFormulaEnabled: true
        }
      : {}),
    ...(alternativeOverride
      ? {
          alternativeFormulaGk: formulaOrDefault(preference.alternativeFormulaGk, baseModel.alternativeFormulaGk),
          alternativeFormulaDef: formulaOrDefault(preference.alternativeFormulaDef, baseModel.alternativeFormulaDef),
          alternativeFormulaMid: formulaOrDefault(preference.alternativeFormulaMid, baseModel.alternativeFormulaMid),
          alternativeFormulaFwd: formulaOrDefault(preference.alternativeFormulaFwd, baseModel.alternativeFormulaFwd),
          alternativeFormulaEnabled: true
        }
      : {})
  };
}

export function parseUserScoringPreferenceForm(formData: FormData) {
  const scoringFormulas = Object.fromEntries(
    scoringFormulaFields.map((field) => [field.key, String(formData.get(field.key) ?? "").trim()])
  ) as Record<(typeof scoringFormulaFields)[number]["key"], string>;
  const alternativeFormulas = Object.fromEntries(
    alternativeFormulaFields.map((field) => [field.key, String(formData.get(field.key) ?? "").trim()])
  ) as Record<(typeof alternativeFormulaFields)[number]["key"], string>;

  for (const field of [...scoringFormulaFields, ...alternativeFormulaFields]) {
    const formula = field.key in scoringFormulas
      ? scoringFormulas[field.key as keyof typeof scoringFormulas]
      : alternativeFormulas[field.key as keyof typeof alternativeFormulas];
    if (formula.length > maximumUserFormulaLength) {
      return { ok: false as const, error: `${field.position} formula exceeds ${maximumUserFormulaLength} characters.` };
    }
    const validation = validateCustomFormula(formula);
    if (!validation.ok) return { ok: false as const, error: `${field.position}: ${validation.message}` };
  }

  const scoringFormulaEnabled = formData.get("scoringFormulaEnabled") === "on";
  const alternativeFormulaEnabled = formData.get("alternativeFormulaEnabled") === "on";
  if (scoringFormulaEnabled && !Object.values(scoringFormulas).some(Boolean)) {
    return { ok: false as const, error: "Actual FP override needs at least one formula." };
  }
  if (alternativeFormulaEnabled && !Object.values(alternativeFormulas).some(Boolean)) {
    return { ok: false as const, error: "Alt FP override needs at least one formula." };
  }

  return {
    ok: true as const,
    data: {
      scoringFormulaGk: scoringFormulas.scoringFormulaGk || null,
      scoringFormulaDef: scoringFormulas.scoringFormulaDef || null,
      scoringFormulaMid: scoringFormulas.scoringFormulaMid || null,
      scoringFormulaFwd: scoringFormulas.scoringFormulaFwd || null,
      scoringFormulaEnabled,
      alternativeFormulaGk: alternativeFormulas.alternativeFormulaGk || null,
      alternativeFormulaDef: alternativeFormulas.alternativeFormulaDef || null,
      alternativeFormulaMid: alternativeFormulas.alternativeFormulaMid || null,
      alternativeFormulaFwd: alternativeFormulas.alternativeFormulaFwd || null,
      alternativeFormulaEnabled
    }
  };
}

function hasAnyFormula(
  preference: UserScoringFormulaPreference,
  prefix: "scoringFormula" | "alternativeFormula"
) {
  return (["Gk", "Def", "Mid", "Fwd"] as const).some((position) =>
    Boolean(preference[`${prefix}${position}`]?.trim())
  );
}

function formulaOrDefault(value: string | null, fallback: string | null) {
  return value?.trim() || fallback;
}
