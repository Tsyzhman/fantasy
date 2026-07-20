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

test("user preference overlays only Alt FP while Expected FP and Actual FP stay global", () => {
  const resolved = applyUserScoringPreference(baseModel, {
    ...preference({ alternativeFormulaMid: "40 + {Goals}" }),
    scoringFormulaMid: "999 + {Goals}",
    scoringFormulaEnabled: true
  } as UserScoringFormulaPreference);
  const metrics = { goals: 2, matches_played: 1, minutes_played: 90 };

  assert.equal(calculateFantasyScore(metrics, "MID", resolved), 102);
  assert.equal(calculateScoringScore(metrics, "MID", resolved), 12);
  assert.equal(calculateAlternativeScore(metrics, "MID", resolved), 42);
  assert.equal(resolved.customFormulaMid, baseModel.customFormulaMid);
});

test("empty user positions inherit global Alt formulas and disabled preferences use the complete global model", () => {
  const partial = applyUserScoringPreference(baseModel, preference({ alternativeFormulaFwd: "50 + {Goals}" }));
  assert.equal(partial.alternativeFormulaMid, baseModel.alternativeFormulaMid);
  assert.equal(partial.alternativeFormulaFwd, "50 + {Goals}");

  const disabled = applyUserScoringPreference(baseModel, preference({
    alternativeFormulaEnabled: false,
    alternativeFormulaMid: "999"
  }));
  assert.deepEqual(disabled, baseModel);
});

test("resolving one user's model does not mutate the global model or another user's result", () => {
  const first = applyUserScoringPreference(baseModel, preference({ alternativeFormulaMid: "1" }));
  const second = applyUserScoringPreference(baseModel, preference({ alternativeFormulaMid: "2" }));

  assert.equal(first.alternativeFormulaMid, "1");
  assert.equal(second.alternativeFormulaMid, "2");
  assert.equal(baseModel.alternativeFormulaMid, "20 + {Goals}");
});

test("user settings parser accepts only Alt fields and clears stale personal Actual fields", () => {
  const form = new FormData();
  form.set("scoringFormulaEnabled", "on");
  form.set("scoringFormulaMid", "2*{Goals}");
  form.set("alternativeFormulaEnabled", "on");
  form.set("alternativeFormulaFwd", "3*{xG}");
  form.set("customFormulaMid", "999");
  const parsed = parseUserScoringPreferenceForm(form);

  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  assert.equal(parsed.data.scoringFormulaMid, null);
  assert.equal(parsed.data.scoringFormulaEnabled, false);
  assert.equal(parsed.data.alternativeFormulaFwd, "3*{xG}");
  assert.equal("customFormulaMid" in parsed.data, false);

  const emptyEnabled = new FormData();
  emptyEnabled.set("alternativeFormulaEnabled", "on");
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
        return preference({ alternativeFormulaMid: "77" });
      }
    }
  };

  const resolved = await getUserScoringModelForSource(client as never, "user-7", "MACHETE");
  assert.deepEqual(receivedWhere, { userId_modelSource: { userId: "user-7", modelSource: "MACHETE" } });
  assert.equal(resolved.modelSource, "MACHETE");
  assert.equal(resolved.scoringFormulaMid, null);
  assert.equal(resolved.alternativeFormulaMid, "77");
});

function preference(overrides: Partial<UserScoringFormulaPreference> = {}): UserScoringFormulaPreference {
  return {
    alternativeFormulaGk: null,
    alternativeFormulaDef: null,
    alternativeFormulaMid: null,
    alternativeFormulaFwd: null,
    alternativeFormulaEnabled: true,
    ...overrides
  };
}
