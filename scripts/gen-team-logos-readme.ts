import { writeFileSync } from "node:fs";

import { leagueSeeds } from "../src/lib/leagues/seed-data";
import { slugify } from "../src/lib/text";

const lines: string[] = [
  "# Team logos",
  "",
  "Drop one PNG file per team at the paths listed below. The seed script wires these to teams automatically; missing files quietly fall back to initials.",
  "",
  "Recommended: square transparent PNG, 128x128 or larger.",
  ""
];

for (const league of leagueSeeds) {
  lines.push(`## ${league.name} (${league.id})`, "");
  for (const team of league.teams) {
    lines.push(`- public/team-logos/${league.id}/${slugify(team.name)}.png  -- ${team.name}`);
  }
  lines.push("");
}

writeFileSync("public/team-logos/README.md", lines.join("\n"));
console.log("Wrote public/team-logos/README.md");
