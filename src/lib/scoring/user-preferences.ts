import type { PrismaClient, UserScoringPreference } from "@prisma/client";

import type { ActiveScoringModel, ScoringModelSource } from "@/lib/scoring";
import { getActiveScoringModelForSource } from "@/lib/scoring";
import { alternativeFormulaFields } from "@/lib/scoring/formula-display";
import { validateCustomFormula } from "@/lib/scoring/formula";

const maximumUserFormulaLength = 4_000;

export type UserScoringFormulaPreference = Pick<
  UserScoringPreference,
  | "alternativeFormulaGk"
  | "alternativeFormulaDef"
  | "alternativeFormulaMid"
  | "alternativeFormulaFwd"
  | "alternativeFormulaEnabled"
> & { alternativeProjectionFormulaConfig?: UserScoringPreference["alternativeProjectionFormulaConfig"] };

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

  const alternativeOverride = preference.alternativeFormulaEnabled && hasAnyFormula(preference);
  if (!alternativeOverride) return baseModel;

  return {
    ...baseModel,
    alternativeFormulaGk: formulaOrDefault(preference.alternativeFormulaGk, baseModel.alternativeFormulaGk),
    alternativeFormulaDef: formulaOrDefault(preference.alternativeFormulaDef, baseModel.alternativeFormulaDef),
    alternativeFormulaMid: formulaOrDefault(preference.alternativeFormulaMid, baseModel.alternativeFormulaMid),
    alternativeFormulaFwd: formulaOrDefault(preference.alternativeFormulaFwd, baseModel.alternativeFormulaFwd),
    alternativeFormulaEnabled: true
  };
}

export function parseUserScoringPreferenceForm(formData: FormData) {
  const alternativeFormulas = Object.fromEntries(
    alternativeFormulaFields.map((field) => [field.key, String(formData.get(field.key) ?? "").trim()])
  ) as Record<(typeof alternativeFormulaFields)[number]["key"], string>;

  for (const field of alternativeFormulaFields) {
    const formula = alternativeFormulas[field.key];
    if (formula.length > maximumUserFormulaLength) {
      return { ok: false as const, error: `${field.position} formula exceeds ${maximumUserFormulaLength} characters.` };
    }
    const validation = validateCustomFormula(formula);
    if (!validation.ok) return { ok: false as const, error: `${field.position}: ${validation.message}` };
  }

  const alternativeFormulaEnabled = formData.get("alternativeFormulaEnabled") === "on";
  if (alternativeFormulaEnabled && !Object.values(alternativeFormulas).some(Boolean)) {
    return { ok: false as const, error: "Alt FP override needs at least one formula." };
  }

  return {
    ok: true as const,
    data: {
      scoringFormulaGk: null,
      scoringFormulaDef: null,
      scoringFormulaMid: null,
      scoringFormulaFwd: null,
      scoringFormulaEnabled: false,
      alternativeFormulaGk: alternativeFormulas.alternativeFormulaGk || null,
      alternativeFormulaDef: alternativeFormulas.alternativeFormulaDef || null,
      alternativeFormulaMid: alternativeFormulas.alternativeFormulaMid || null,
      alternativeFormulaFwd: alternativeFormulas.alternativeFormulaFwd || null,
      alternativeFormulaEnabled
    }
  };
}

function hasAnyFormula(preference: UserScoringFormulaPreference) {
  return (["Gk", "Def", "Mid", "Fwd"] as const).some((position) =>
    Boolean(preference[`alternativeFormula${position}`]?.trim())
  );
}

function formulaOrDefault(value: string | null, fallback: string | null) {
  return value?.trim() || fallback;
}
