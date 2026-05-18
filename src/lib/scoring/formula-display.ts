export const defaultFormulaByPosition = [
  {
    key: "customFormulaGk",
    position: "ВР",
    formula: [
      "{Matches played}",
      "appearances_60({Minutes played})",
      "6*{Goals}",
      "3*{Assists}",
      "3*{Fantasy assists}",
      "4*{Clean sheets}",
      "floor({Saves}/3)",
      "5*{Penalties saved}",
      "-2*{Fouls leading to penalty}",
      "-2*{Missed penalties}",
      "-2*{Own goals}",
      "-floor({Goals conceded}/2)",
      "-{Yellow cards}",
      "-3*{Red cards}"
    ].join(" + ")
  },
  {
    key: "customFormulaDef",
    position: "ЗЩ",
    formula: [
      "{Matches played}",
      "appearances_60({Minutes played})",
      "6*{Goals}",
      "3*{Assists}",
      "3*{Fantasy assists}",
      "4*{Clean sheets}",
      "floor({Recoveries}/3)",
      "-2*{Fouls leading to penalty}",
      "-2*{Missed penalties}",
      "-2*{Own goals}",
      "-floor({Goals conceded}/2)",
      "-{Yellow cards}",
      "-3*{Red cards}"
    ].join(" + ")
  },
  {
    key: "customFormulaMid",
    position: "ПЗЩ",
    formula: [
      "{Matches played}",
      "appearances_60({Minutes played})",
      "full_matches({Minutes played})",
      "5*{Goals}",
      "3*{Assists}",
      "3*{Fantasy assists}",
      "{Clean sheets}",
      "floor({Recoveries}/3)",
      "-2*{Fouls leading to penalty}",
      "-2*{Missed penalties}",
      "-2*{Own goals}",
      "-{Yellow cards}",
      "-3*{Red cards}"
    ].join(" + ")
  },
  {
    key: "customFormulaFwd",
    position: "НАП",
    formula: [
      "{Matches played}",
      "appearances_60({Minutes played})",
      "full_matches({Minutes played})",
      "4*{Goals}",
      "3*{Assists}",
      "3*{Fantasy assists}",
      "floor({Recoveries}/3)",
      "-2*{Fouls leading to penalty}",
      "-2*{Missed penalties}",
      "-2*{Own goals}",
      "-{Yellow cards}",
      "-3*{Red cards}"
    ].join(" + ")
  }
];

export const customFormulaFields = defaultFormulaByPosition.map(({ key, position, formula }) => ({
  key,
  position,
  placeholder: formula
}));

type FormulaModel = {
  customFormula?: string | null;
  customFormulaGk?: string | null;
  customFormulaDef?: string | null;
  customFormulaMid?: string | null;
  customFormulaFwd?: string | null;
  customFormulaEnabled?: boolean | null;
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
  return model?.customFormulaEnabled && hasAnyCustomFormula(model) ? "Custom formulas by position" : "Default rules";
}

export function customFormulaForPosition(model: FormulaModel | null | undefined, key: string) {
  const value = model?.[key as keyof FormulaModel];
  return typeof value === "string" ? value : "";
}
