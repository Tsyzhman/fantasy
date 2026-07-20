export const componentFormulaByPosition = [
  {
    key: "customFormulaGk",
    position: "GK",
    formula: [
      "{Appearance FP}",
      "{60+ minutes FP}",
      "{Goal FP}",
      "{Assist FP}",
      "{Clean sheet FP}",
      "{Save FP}",
      "{Goals conceded FP}",
      "{Yellow card FP}",
      "{Red card FP}"
    ].join(" + "),
    placeholder: "{Appearance FP} + {60+ minutes FP} + {Goal FP} + {Clean sheet FP} + {Save FP}"
  },
  {
    key: "customFormulaDef",
    position: "DEF",
    formula: [
      "{Appearance FP}",
      "{60+ minutes FP}",
      "{Goal FP}",
      "{Assist FP}",
      "{Clean sheet FP}",
      "{Recovery FP}",
      "{Goals conceded FP}",
      "{Yellow card FP}",
      "{Red card FP}"
    ].join(" + "),
    placeholder: "{Appearance FP} + {60+ minutes FP} + {Goal FP} + {Clean sheet FP} + {Recovery FP}"
  },
  {
    key: "customFormulaMid",
    position: "MID",
    formula: [
      "{Appearance FP}",
      "{60+ minutes FP}",
      "{Full match FP}",
      "{Goal FP}",
      "{Assist FP}",
      "{Clean sheet FP}",
      "{Recovery FP}",
      "{Yellow card FP}",
      "{Red card FP}"
    ].join(" + "),
    placeholder: "{Appearance FP} + {60+ minutes FP} + {Full match FP} + {Goal FP} + {Assist FP}"
  },
  {
    key: "customFormulaFwd",
    position: "FWD",
    formula: [
      "{Appearance FP}",
      "{60+ minutes FP}",
      "{Full match FP}",
      "{Goal FP}",
      "{Assist FP}",
      "{Recovery FP}",
      "{Yellow card FP}",
      "{Red card FP}"
    ].join(" + "),
    placeholder: "{Appearance FP} + {60+ minutes FP} + {Full match FP} + {Goal FP} + {Assist FP}"
  }
];

export const defaultFormulaByPosition = [
  {
    key: "customFormulaGk",
    position: "GK",
    formula: [
      "{Appearance bonus}", "{60min bonus}", "6*{Expected goals per match}", "3*{Expected assists per match}",
      "3*{Fantasy assists per match}", "4*{Clean sheet probability}", "{Expected saves}/3",
      "5*{Penalty saves per match}", "-2*{Penalties conceded per match}", "-2*{Missed penalties per match}",
      "-2*{Own goals per match}", "-{Expected goals conceded}/2", "-{Expected yellow cards}", "-3*{Expected red cards}"
    ].join(" + "),
    placeholder: "6*{Goals per 90} + 3*{Assists per 90} + 4*{Clean sheets} - 0.5*{Conceded goals per 90}"
  },
  {
    key: "customFormulaDef",
    position: "DEF",
    formula: [
      "{Appearance bonus}", "{60min bonus}", "6*{Expected goals per match}", "3*{Expected assists per match}",
      "3*{Fantasy assists per match}", "4*{Clean sheet probability}", "{Expected recoveries}/3",
      "-2*{Penalties conceded per match}", "-2*{Missed penalties per match}", "-2*{Own goals per match}",
      "-{Expected goals conceded}/2", "-{Expected yellow cards}", "-3*{Expected red cards}"
    ].join(" + "),
    placeholder: "6*{Goals per 90} + 3*{Assists per 90} + 4*{Clean sheets} - 0.5*{Conceded goals per 90}"
  },
  {
    key: "customFormulaMid",
    position: "MID",
    formula: [
      "{Appearance bonus}", "{60min bonus}", "{Full match bonus}", "5*{Expected goals per match}",
      "3*{Expected assists per match}", "3*{Fantasy assists per match}", "{Clean sheet probability}",
      "{Expected recoveries}/3", "-2*{Penalties conceded per match}", "-2*{Missed penalties per match}",
      "-2*{Own goals per match}", "-{Expected yellow cards}", "-3*{Expected red cards}"
    ].join(" + "),
    placeholder: "5*{Goals per 90} + 3*{Assists per 90} + 0.5*{Key passes per 90} - {Yellow cards per 90}"
  },
  {
    key: "customFormulaFwd",
    position: "FWD",
    formula: [
      "{Appearance bonus}", "{60min bonus}", "{Full match bonus}", "4*{Expected goals per match}",
      "3*{Expected assists per match}", "3*{Fantasy assists per match}", "{Expected recoveries}/3",
      "-2*{Penalties conceded per match}", "-2*{Missed penalties per match}", "-2*{Own goals per match}",
      "-{Expected yellow cards}", "-3*{Expected red cards}"
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

export const friendAlternativeFormulaByPosition = [
  {
    key: "alternativeFormulaGk",
    position: "GK",
    formula: "{Appearance FP} + {60+ minutes FP} + 6*{xG} + 3*{xA} + 4*{Clean sheets} + {Saves}/3 - {Yellow cards} - 3*{Red cards}"
  },
  {
    key: "alternativeFormulaDef",
    position: "DEF",
    formula: "{Appearance FP} + {60+ minutes FP} + 6*{xG} + 3*{xA} + 4*{Clean sheets} + {Recoveries}/3 - {Yellow cards} - 3*{Red cards}"
  },
  {
    key: "alternativeFormulaMid",
    position: "MID",
    formula: "{Appearance FP} + {60+ minutes FP} + {Full match FP} + 5*{xG} + 3*{xA} + {Clean sheets} + {Recoveries}/3 - {Yellow cards} - 3*{Red cards}"
  },
  {
    key: "alternativeFormulaFwd",
    position: "FWD",
    formula: "{Appearance FP} + {60+ minutes FP} + {Full match FP} + 4*{xG} + 3*{xA} + {Recoveries}/3 - {Yellow cards} - 3*{Red cards}"
  }
] as const;

export const friendAlternativeFormulaDefaults = Object.fromEntries(
  friendAlternativeFormulaByPosition.map((entry) => [entry.key, entry.formula])
) as Record<(typeof friendAlternativeFormulaByPosition)[number]["key"], string>;

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

export const defaultScoringFormulaByPosition = [
  {
    key: "scoringFormulaGk",
    position: "GK",
    formula: [
      "{Appearance count}",
      "{60min count}",
      "6*{Goals}",
      "3*{Assists}",
      "3*{Fantasy assists}",
      "4*{Clean sheets}",
      "{Saves}/3",
      "5*{Penalty saves}",
      "-2*{Penalties conceded}",
      "-2*{Missed penalties}",
      "-2*{Own goals}",
      "-{Goals conceded}/2",
      "-{Yellow cards}",
      "-3*{Red cards}"
    ].join(" + ")
  },
  {
    key: "scoringFormulaDef",
    position: "DEF",
    formula: [
      "{Appearance count}",
      "{60min count}",
      "6*{Goals}",
      "3*{Assists}",
      "3*{Fantasy assists}",
      "4*{Clean sheets}",
      "{Recoveries}/3",
      "-2*{Penalties conceded}",
      "-2*{Missed penalties}",
      "-2*{Own goals}",
      "-{Goals conceded}/2",
      "-{Yellow cards}",
      "-3*{Red cards}"
    ].join(" + ")
  },
  {
    key: "scoringFormulaMid",
    position: "MID",
    formula: [
      "{Appearance count}",
      "{60min count}",
      "{Full match count}",
      "5*{Goals}",
      "3*{Assists}",
      "3*{Fantasy assists}",
      "{Clean sheets}",
      "{Recoveries}/3",
      "-2*{Penalties conceded}",
      "-2*{Missed penalties}",
      "-2*{Own goals}",
      "-{Yellow cards}",
      "-3*{Red cards}"
    ].join(" + ")
  },
  {
    key: "scoringFormulaFwd",
    position: "FWD",
    formula: [
      "{Appearance count}",
      "{60min count}",
      "{Full match count}",
      "4*{Goals}",
      "3*{Assists}",
      "3*{Fantasy assists}",
      "{Recoveries}/3",
      "-2*{Penalties conceded}",
      "-2*{Missed penalties}",
      "-2*{Own goals}",
      "-{Yellow cards}",
      "-3*{Red cards}"
    ].join(" + ")
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
