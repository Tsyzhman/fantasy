import assert from "node:assert/strict";
import test from "node:test";

import { calculateAlternativeScore, calculateFantasyScore, calculateScoringScore, type ActiveScoringModel } from "@/lib/scoring";

import { applyUserScoringPreference, getUserScoringModelForSource, parseUserScoringPreferenceForm, type UserScoringFormulaPreference } from "./user-preferences";

const baseModel: ActiveScoringModel = {
  modelSource: "MACHETE",
  customFormula: null,
  customFormulaGk: null,
  customFormulaDef: null,
  customFormulaMid: "100 + {Goals}",
  customFormulaFwd: null,
  customFormulaEnabled: true,
  scoringFormulaGk: null,
  scoringFormulaDef: null,
  scoringFormulaMid: "10 + {Goals}",
  scoringFormulaFwd: null,
  scoringFormulaEnabled: true,
  alternativeFormulaGk: null,
  alternativeFormulaDef: null,
  alternativeFormulaMid: "20 + {Goals}",
  alternativeFormulaFwd: null,
  alternativeFormulaEnabled: true,
  rules: []
};

test("user preference overlays only Actual FP and Alt FP while Expected FP stays global", () => {
  const resolved = applyUserScoringPreference(baseModel, preference({
    scoringFormulaMid: "30 + {Goals}",
    alternativeFormulaMid: "40 + {Goals}"
  }));
  const metrics = { goals: 2, matches_played: 1, minutes_played: 90 };

  assert.equal(calculateFantasyScore(metrics, "MID", resolved), 102);
  assert.equal(calculateScoringScore(metrics, "MID", resolved), 32);
  assert.equal(calculateAlternativeScore(metrics, "MID", resolved), 42);
  assert.equal(resolved.customFormulaMid, baseModel.customFormulaMid);
});

test("empty user positions inherit global formulas and disabled preferences use the complete global model", () => {
  const partial = applyUserScoringPreference(baseModel, preference({ scoringFormulaFwd: "50 + {Goals}" }));
  assert.equal(partial.scoringFormulaMid, baseModel.scoringFormulaMid);
  assert.equal(partial.scoringFormulaFwd, "50 + {Goals}");

  const disabled = applyUserScoringPreference(baseModel, preference({
    scoringFormulaEnabled: false,
    alternativeFormulaEnabled: false,
    scoringFormulaMid: "999"
  }));
  assert.deepEqual(disabled, baseModel);
});

test("resolving one user's model does not mutate the global model or another user's result", () => {
  const first = applyUserScoringPreference(baseModel, preference({ scoringFormulaMid: "1" }));
  const second = applyUserScoringPreference(baseModel, preference({ scoringFormulaMid: "2" }));

  assert.equal(first.scoringFormulaMid, "1");
  assert.equal(second.scoringFormulaMid, "2");
  assert.equal(baseModel.scoringFormulaMid, "10 + {Goals}");
});

test("user settings parser accepts only Actual and Alt formula fields and validates enabled sections", () => {
  const form = new FormData();
  form.set("scoringFormulaEnabled", "on");
  form.set("scoringFormulaMid", "2*{Goals}");
  form.set("alternativeFormulaEnabled", "on");
  form.set("alternativeFormulaFwd", "3*{xG}");
  form.set("customFormulaMid", "999");
  const parsed = parseUserScoringPreferenceForm(form);

  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  assert.equal(parsed.data.scoringFormulaMid, "2*{Goals}");
  assert.equal(parsed.data.alternativeFormulaFwd, "3*{xG}");
  assert.equal("customFormulaMid" in parsed.data, false);

  const emptyEnabled = new FormData();
  emptyEnabled.set("scoringFormulaEnabled", "on");
  const emptyResult = parseUserScoringPreferenceForm(emptyEnabled);
  assert.equal(emptyResult.ok, false);
  if (!emptyResult.ok) assert.match(emptyResult.error, /needs at least one formula/);

  const invalid = new FormData();
  invalid.set("alternativeFormulaEnabled", "on");
  invalid.set("alternativeFormulaMid", "2*{");
  assert.equal(parseUserScoringPreferenceForm(invalid).ok, false);
});

test("database resolver reads only the requested user and source", async () => {
  let receivedWhere: unknown = null;
  const client = {
    fantasyModel: { findFirst: async () => null },
    userScoringPreference: {
      findUnique: async (args: { where: unknown }) => {
        receivedWhere = args.where;
        return preference({ scoringFormulaMid: "77" });
      }
    }
  };

  const resolved = await getUserScoringModelForSource(client as never, "user-7", "MACHETE");
  assert.deepEqual(receivedWhere, { userId_modelSource: { userId: "user-7", modelSource: "MACHETE" } });
  assert.equal(resolved.modelSource, "MACHETE");
  assert.equal(resolved.scoringFormulaMid, "77");
});

function preference(overrides: Partial<UserScoringFormulaPreference> = {}): UserScoringFormulaPreference {
  return {
    scoringFormulaGk: null,
    scoringFormulaDef: null,
    scoringFormulaMid: null,
    scoringFormulaFwd: null,
    scoringFormulaEnabled: true,
    alternativeFormulaGk: null,
    alternativeFormulaDef: null,
    alternativeFormulaMid: null,
    alternativeFormulaFwd: null,
    alternativeFormulaEnabled: true,
    ...overrides
  };
}
