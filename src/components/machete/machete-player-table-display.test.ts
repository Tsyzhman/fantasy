import assert from "node:assert/strict";
import test from "node:test";

import { machetePlayerCellTitle, machetePlayerTeamDisplayName, type Column, type MachetePlayerRow } from "./MachetePlayerTable";

test("compact Machete player table displays provider short names with full-name fallback", () => {
  assert.equal(
    machetePlayerTeamDisplayName({ teamName: "Manchester United", teamShortName: "Man United" }),
    "Man United"
  );
  assert.equal(
    machetePlayerTeamDisplayName({ teamName: "Brighton & Hove Albion", teamShortName: " " }),
    "Brighton & Hove Albion"
  );
});

const player: MachetePlayerRow = {
  id: "p1",
  name: "Test Player",
  position: "MID",
  age: 24,
  nationality: "Russia",
  matchesPlayed: 5,
  minutesPlayed: 360,
  goals: 3,
  assists: 2,
  shotsOnTarget: 7,
  keyPasses: 9,
  tackles: 4,
  averageRating: 7.2,
  fantasyScore: 6.5,
  recentFp: [4, 7, 5]
};

function column(key: string, label: string, value: Column["value"]): Column {
  return { key, label, title: `Header help for ${label}`, width: 80, numeric: true, value };
}

test("value tooltip expands a concrete total with its selected sample", () => {
  const goals = column("goals", "Goals", (row) => row.goals);
  const title = machetePlayerCellTitle(goals, player, goals.value(player), 5, "en");
  assert.match(title, /Test Player · Goals: 3/);
  assert.match(title, /5 parsed player-stat rows, 360 played minutes/);
  assert.match(title, /3 \/ 5 = 0\.6/);
});

test("form tooltip still explains match scores when the display value is null", () => {
  const form = column("form", "Form", () => null);
  const title = machetePlayerCellTitle(form, player, null, 5, "en");
  assert.match(title, /4 \+ 7 \+ 5 = 16/);
  assert.match(title, /average 5\.33/);
  assert.doesNotMatch(title, /No value is available/);
});

test("raw appearance probability never invents a matches over matches numerator", () => {
  const rawPlayer = { ...player, rawMetrics: { appearance_probability: 0.6 } };
  const appearance = column("raw:appearance_probability", "Appearance probability", () => 0.6);
  const title = machetePlayerCellTitle(appearance, rawPlayer, 0.6, 5, "en");
  assert.match(title, /appearance numerator is not retained/);
  assert.doesNotMatch(title, /5 \/ 5 = 60/);
});
