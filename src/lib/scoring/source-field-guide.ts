export type SourceFormulaField = {
  category: string;
  label: string;
  key: string;
  type: "number" | "money" | "date" | "text" | "boolean";
  meaning: string;
};

const rawFields = [
  ["Core", "Player", "text", "Player name. Metadata only; text fields count as 0 in formulas."],
  ["Core", "Team", "text", "Team name. Metadata only; text fields count as 0 in formulas."],
  ["Core", "Position", "text", "Raw player position. The app also normalizes it into GK/DEF/MID/FWD."],
  ["Core", "Age", "number", "Player age."],
  ["Core", "Market value", "money", "Player market value in euros after parsing."],
  ["Core", "Contract expires", "date", "Contract expiry date. Metadata only; date fields count as 0 in formulas."],
  ["Core", "Matches played", "number", "Appearances in the imported period."],
  ["Core", "Minutes played", "number", "Total minutes in the imported period."],
  ["Core", "Goals", "number", "Total goals."],
  ["Core", "xG", "number", "Expected goals."],
  ["Core", "Assists", "number", "Total assists."],
  ["Core", "xA", "number", "Expected assists."],
  ["Core", "Birth country", "text", "Birth country. Metadata only; text fields count as 0 in formulas."],
  ["Core", "Passport country", "text", "Passport country. Metadata only; text fields count as 0 in formulas."],
  ["Core", "Foot", "text", "Preferred foot. Metadata only; text fields count as 0 in formulas."],
  ["Core", "Height", "number", "Player height."],
  ["Core", "Weight", "number", "Player weight."],
  ["Core", "On loan", "boolean", "Loan status. Metadata only; boolean fields count as 0 in formulas."],
  ["Defending", "Duels per 90", "number", "Total duels per 90 minutes."],
  ["Defending", "Duels won, %", "number", "Share of duels won."],
  ["Defending", "Successful defensive actions per 90", "number", "Successful defensive actions per 90 minutes."],
  ["Defending", "Defensive duels per 90", "number", "Defensive duels per 90 minutes."],
  ["Defending", "Defensive duels won, %", "number", "Share of defensive duels won."],
  ["Defending", "Aerial duels per 90", "number", "Aerial duels per 90 minutes."],
  ["Defending", "Aerial duels won, %", "number", "Share of aerial duels won."],
  ["Defending", "Sliding tackles per 90", "number", "Sliding tackles per 90 minutes."],
  ["Defending", "PAdj Sliding tackles", "number", "Possession-adjusted sliding tackles."],
  ["Defending", "Shots blocked per 90", "number", "Blocked shots per 90 minutes."],
  ["Defending", "Interceptions per 90", "number", "Interceptions per 90 minutes."],
  ["Defending", "PAdj Interceptions", "number", "Possession-adjusted interceptions."],
  ["Defending", "Fouls per 90", "number", "Fouls committed per 90 minutes."],
  ["Discipline", "Yellow cards", "number", "Total yellow cards."],
  ["Discipline", "Yellow cards per 90", "number", "Yellow cards per 90 minutes."],
  ["Discipline", "Red cards", "number", "Total red cards."],
  ["Discipline", "Red cards per 90", "number", "Red cards per 90 minutes."],
  ["Attacking", "Successful attacking actions per 90", "number", "Successful attacking actions per 90 minutes."],
  ["Attacking", "Goals per 90", "number", "Goals per 90 minutes."],
  ["Attacking", "Non-penalty goals", "number", "Goals excluding penalties."],
  ["Attacking", "Non-penalty goals per 90", "number", "Non-penalty goals per 90 minutes."],
  ["Attacking", "xG per 90", "number", "Expected goals per 90 minutes."],
  ["Attacking", "Head goals", "number", "Goals scored with headers."],
  ["Attacking", "Head goals per 90", "number", "Header goals per 90 minutes."],
  ["Shooting", "Shots", "number", "Total shots."],
  ["Shooting", "Shots per 90", "number", "Shots per 90 minutes."],
  ["Shooting", "Shots on target, %", "number", "Share of shots on target."],
  ["Shooting", "Goal conversion, %", "number", "Goal conversion rate."],
  ["Creation", "Assists per 90", "number", "Assists per 90 minutes."],
  ["Creation", "xA per 90", "number", "Expected assists per 90 minutes."],
  ["Crossing", "Crosses per 90", "number", "Crosses per 90 minutes."],
  ["Crossing", "Accurate crosses, %", "number", "Share of accurate crosses."],
  ["Crossing", "Crosses from left flank per 90", "number", "Left-flank crosses per 90 minutes."],
  ["Crossing", "Accurate crosses from left flank, %", "number", "Share of accurate left-flank crosses."],
  ["Crossing", "Crosses from right flank per 90", "number", "Right-flank crosses per 90 minutes."],
  ["Crossing", "Accurate crosses from right flank, %", "number", "Share of accurate right-flank crosses."],
  ["Crossing", "Crosses to goalie box per 90", "number", "Crosses into the goalie box per 90 minutes."],
  ["Attacking", "Dribbles per 90", "number", "Dribbles per 90 minutes."],
  ["Attacking", "Successful dribbles, %", "number", "Share of successful dribbles."],
  ["Attacking", "Offensive duels per 90", "number", "Offensive duels per 90 minutes."],
  ["Attacking", "Offensive duels won, %", "number", "Share of offensive duels won."],
  ["Attacking", "Touches in box per 90", "number", "Touches in the box per 90 minutes."],
  ["Attacking", "Progressive runs per 90", "number", "Progressive runs per 90 minutes."],
  ["Passing", "Received passes per 90", "number", "Received passes per 90 minutes."],
  ["Passing", "Received long passes per 90", "number", "Received long passes per 90 minutes."],
  ["Discipline", "Fouls suffered per 90", "number", "Fouls won/suffered per 90 minutes."],
  ["Passing", "Passes per 90", "number", "Passes per 90 minutes."],
  ["Passing", "Accurate passes, %", "number", "Share of accurate passes."],
  ["Passing", "Forward passes per 90", "number", "Forward passes per 90 minutes."],
  ["Passing", "Accurate forward passes, %", "number", "Share of accurate forward passes."],
  ["Passing", "Back passes per 90", "number", "Back passes per 90 minutes."],
  ["Passing", "Accurate back passes, %", "number", "Share of accurate back passes."],
  ["Passing", "Lateral passes per 90", "number", "Lateral passes per 90 minutes."],
  ["Passing", "Accurate lateral passes, %", "number", "Share of accurate lateral passes."],
  ["Passing", "Short / medium passes per 90", "number", "Short and medium passes per 90 minutes."],
  ["Passing", "Accurate short / medium passes, %", "number", "Share of accurate short and medium passes."],
  ["Passing", "Long passes per 90", "number", "Long passes per 90 minutes."],
  ["Passing", "Accurate long passes, %", "number", "Share of accurate long passes."],
  ["Passing", "Average pass length, m", "number", "Average pass length in meters."],
  ["Passing", "Average long pass length, m", "number", "Average long pass length in meters."],
  ["Creation", "Shot assists per 90", "number", "Shot assists per 90 minutes."],
  ["Creation", "Second assists per 90", "number", "Second assists per 90 minutes."],
  ["Creation", "Third assists per 90", "number", "Third assists per 90 minutes."],
  ["Creation", "Smart passes per 90", "number", "Smart passes per 90 minutes."],
  ["Creation", "Accurate smart passes, %", "number", "Share of accurate smart passes."],
  ["Creation", "Key passes per 90", "number", "Key passes per 90 minutes."],
  ["Progression", "Passes to final third per 90", "number", "Passes to the final third per 90 minutes."],
  ["Progression", "Accurate passes to final third, %", "number", "Share of accurate passes to final third."],
  ["Progression", "Passes to penalty area per 90", "number", "Passes to the penalty area per 90 minutes."],
  ["Progression", "Accurate passes to penalty area, %", "number", "Share of accurate passes to penalty area."],
  ["Progression", "Through passes per 90", "number", "Through passes per 90 minutes."],
  ["Progression", "Accurate through passes, %", "number", "Share of accurate through passes."],
  ["Progression", "Deep completions per 90", "number", "Deep completions per 90 minutes."],
  ["Crossing", "Deep completed crosses per 90", "number", "Deep completed crosses per 90 minutes."],
  ["Progression", "Progressive passes per 90", "number", "Progressive passes per 90 minutes."],
  ["Progression", "Accurate progressive passes, %", "number", "Share of accurate progressive passes."],
  ["Goalkeeper", "Conceded goals", "number", "Goals conceded."],
  ["Goalkeeper", "Conceded goals per 90", "number", "Goals conceded per 90 minutes."],
  ["Goalkeeper", "Shots against", "number", "Shots faced."],
  ["Goalkeeper", "Shots against per 90", "number", "Shots faced per 90 minutes."],
  ["Goalkeeper", "Clean sheets", "number", "Clean sheets."],
  ["Goalkeeper", "Save rate, %", "number", "Save percentage."],
  ["Goalkeeper", "xG against", "number", "Expected goals against."],
  ["Goalkeeper", "xG against per 90", "number", "Expected goals against per 90 minutes."],
  ["Goalkeeper", "Prevented goals", "number", "Prevented goals."],
  ["Goalkeeper", "Prevented goals per 90", "number", "Prevented goals per 90 minutes."],
  ["Goalkeeper", "Back passes received as GK per 90", "number", "Back passes received as goalkeeper per 90 minutes."],
  ["Goalkeeper", "Exits per 90", "number", "Goalkeeper exits per 90 minutes."],
  ["Set pieces", "Free kicks per 90", "number", "Free kicks per 90 minutes."],
  ["Set pieces", "Direct free kicks per 90", "number", "Direct free kicks per 90 minutes."],
  ["Set pieces", "Direct free kicks on target, %", "number", "Share of direct free kicks on target."],
  ["Set pieces", "Corners per 90", "number", "Corners per 90 minutes."],
  ["Set pieces", "Penalties taken", "number", "Penalties taken."],
  ["Set pieces", "Penalty conversion, %", "number", "Penalty conversion rate."]
] satisfies Array<[string, string, SourceFormulaField["type"], string]>;

export const sourceFormulaFields: SourceFormulaField[] = rawFields.map(([category, label, type, meaning]) => ({
  category,
  label,
  key: normalizeFormulaFieldLabel(label),
  type,
  meaning
}));

export function formulaAlias(label: string) {
  return `{${label}}`;
}

function normalizeFormulaFieldLabel(label: string) {
  return label
    .trim()
    .toLowerCase()
    .replace(/%/g, "percent")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}
