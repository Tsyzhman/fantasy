import assert from "node:assert/strict";
import test from "node:test";

import { machetePlayerTeamDisplayName } from "./MachetePlayerTable";

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
