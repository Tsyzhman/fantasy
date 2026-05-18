export const defaultFormulaByPosition = [
  {
    key: "customFormulaGk",
    position: "GK",
    formula: [
      "appearance_bonus",
      "60min_bonus",
      "6*expected_goals_per_match",
      "3*expected_assists_per_match",
      "3*fantasy_assists_per_match",
      "4*clean_sheet_probability",
      "expected_saves/3",
      "5*penalty_saves_per_match",
      "-2*penalties_conceded_per_match",
      "-2*missed_penalties_per_match",
      "-2*own_goals_per_match",
      "-expected_goals_conceded/2",
      "-expected_yellow_cards",
      "-3*expected_red_cards"
    ].join(" + "),
    placeholder: "6*{Goals per 90} + 3*{Assists per 90} + 4*{Clean sheets} - 0.5*{Conceded goals per 90}"
  },
  {
    key: "customFormulaDef",
    position: "DEF",
    formula: [
      "appearance_bonus",
      "60min_bonus",
      "6*expected_goals_per_match",
      "3*expected_assists_per_match",
      "3*fantasy_assists_per_match",
      "4*clean_sheet_probability",
      "expected_recoveries/3",
      "-2*penalties_conceded_per_match",
      "-2*missed_penalties_per_match",
      "-2*own_goals_per_match",
      "-expected_goals_conceded/2",
      "-expected_yellow_cards",
      "-3*expected_red_cards"
    ].join(" + "),
    placeholder: "6*{Goals per 90} + 3*{Assists per 90} + 4*{Clean sheets} - 0.5*{Conceded goals per 90}"
  },
  {
    key: "customFormulaMid",
    position: "MID",
    formula: [
      "appearance_bonus",
      "60min_bonus",
      "full_match_bonus",
      "5*expected_goals_per_match",
      "3*expected_assists_per_match",
      "3*fantasy_assists_per_match",
      "clean_sheet_probability",
      "expected_recoveries/3",
      "-2*penalties_conceded_per_match",
      "-2*missed_penalties_per_match",
      "-2*own_goals_per_match",
      "-expected_yellow_cards",
      "-3*expected_red_cards"
    ].join(" + "),
    placeholder: "5*{Goals per 90} + 3*{Assists per 90} + 0.5*{Key passes per 90} - {Yellow cards per 90}"
  },
  {
    key: "customFormulaFwd",
    position: "FWD",
    formula: [
      "appearance_bonus",
      "60min_bonus",
      "full_match_bonus",
      "4*expected_goals_per_match",
      "3*expected_assists_per_match",
      "3*fantasy_assists_per_match",
      "expected_recoveries/3",
      "-2*penalties_conceded_per_match",
      "-2*missed_penalties_per_match",
      "-2*own_goals_per_match",
      "-expected_yellow_cards",
      "-3*expected_red_cards"
    ].join(" + "),
    placeholder: "4*{Goals per 90} + 3*{Assists per 90} + 0.4*{Touches in box per 90} - {Yellow cards per 90}"
  }
];

export const customFormulaFields = defaultFormulaByPosition.map(({ key, position, placeholder }) => ({
  key,
  position,
  placeholder
}));

export const alternativeFormulaFields = [
  {
    key: "alternativeFormulaGk",
    position: "GK",
    placeholder: "4*{Clean sheets} + {Saves}/3 - 0.5*{Conceded goals per 90}"
  },
  {
    key: "alternativeFormulaDef",
    position: "DEF",
    placeholder: "2*{xG per 90} + 3*{xA per 90} + 0.25*{Successful defensive actions per 90}"
  },
  {
    key: "alternativeFormulaMid",
    position: "MID",
    placeholder: "3*{xG per 90} + 3*{xA per 90} + 0.4*{Key passes per 90} + 0.2*{Progressive passes per 90}"
  },
  {
    key: "alternativeFormulaFwd",
    position: "FWD",
    placeholder: "4*{xG per 90} + 2*{xA per 90} + 0.25*{Touches in box per 90}"
  }
] as const;

export const scoringFormulaFields = [
  {
    key: "scoringFormulaGk",
    position: "GK",
    placeholder: "{Matches played} + {Clean sheets}*4 + {Saves}/3 - {Goals conceded}/2"
  },
  {
    key: "scoringFormulaDef",
    position: "DEF",
    placeholder: "{Matches played} + 6*{Goals} + 3*{Assists} + 4*{Clean sheets} - {Goals conceded}/2"
  },
  {
    key: "scoringFormulaMid",
    position: "MID",
    placeholder: "{Matches played} + 5*{Goals} + 3*{Assists} + {Clean sheets} + {Recoveries}/3"
  },
  {
    key: "scoringFormulaFwd",
    position: "FWD",
    placeholder: "{Matches played} + 4*{Goals} + 3*{Assists} + {Recoveries}/3"
  }
] as const;

type FormulaModel = {
  customFormula?: string | null;
  customFormulaGk?: string | null;
  customFormulaDef?: string | null;
  customFormulaMid?: string | null;
  customFormulaFwd?: string | null;
  customFormulaEnabled?: boolean | null;
  scoringFormulaGk?: string | null;
  scoringFormulaDef?: string | null;
  scoringFormulaMid?: string | null;
  scoringFormulaFwd?: string | null;
  scoringFormulaEnabled?: boolean | null;
  alternativeFormulaGk?: string | null;
  alternativeFormulaDef?: string | null;
  alternativeFormulaMid?: string | null;
  alternativeFormulaFwd?: string | null;
  alternativeFormulaEnabled?: boolean | null;
};

export function hasAnyCustomFormula(model?: FormulaModel | null) {
  return Boolean(
    model?.customFormula?.trim() ||
      model?.customFormulaGk?.trim() ||
      model?.customFormulaDef?.trim() ||
      model?.customFormulaMid?.trim() ||
      model?.customFormulaFwd?.trim()
  );
}

export function formulaModeLabel(model?: FormulaModel | null) {
  return model?.customFormulaEnabled && hasAnyCustomFormula(model) ? "Custom formulas by position" : "Default predicted round rules";
}

export function customFormulaForPosition(model: FormulaModel | null | undefined, key: string) {
  const value = model?.[key as keyof FormulaModel];
  return typeof value === "string" ? value : "";
}

export function hasAnyAlternativeFormula(model?: FormulaModel | null) {
  return Boolean(
    model?.alternativeFormulaGk?.trim() ||
      model?.alternativeFormulaDef?.trim() ||
      model?.alternativeFormulaMid?.trim() ||
      model?.alternativeFormulaFwd?.trim()
  );
}

export function hasAnyScoringFormula(model?: FormulaModel | null) {
  return Boolean(
    model?.scoringFormulaGk?.trim() ||
      model?.scoringFormulaDef?.trim() ||
      model?.scoringFormulaMid?.trim() ||
      model?.scoringFormulaFwd?.trim()
  );
}

export function scoringFormulaModeLabel(model?: FormulaModel | null) {
  return model?.scoringFormulaEnabled && hasAnyScoringFormula(model) ? "Custom scoring formulas by position" : "Default aggregate scoring rules";
}
