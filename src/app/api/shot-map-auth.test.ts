import assert from "node:assert/strict";
import test from "node:test";

import { withEnv } from "../../test-utils/env";

import { GET as getPlayerShotMap } from "./players/[snapshotId]/shot-map/route";
import { GET as getShotMapCompare } from "./shot-map/compare/route";
import { GET as getTeamShotMapAgainst } from "./teams/[teamId]/shot-map/against/route";
import { GET as getTeamShotMapFor } from "./teams/[teamId]/shot-map/for/route";

test("shot-map API routes require a valid user session", async () => {
  await withEnv({ DATABASE_URL: "postgresql://user:pass@localhost:5432/app" }, async () => {
    const cases: Array<{ name: string; response: Promise<Response> }> = [
      {
        name: "team shots for",
        response: getTeamShotMapFor(new Request("http://localhost/api/teams/team-1/shot-map/for"), {
          params: Promise.resolve({ teamId: "team-1" })
        })
      },
      {
        name: "team shots against",
        response: getTeamShotMapAgainst(new Request("http://localhost/api/teams/team-1/shot-map/against"), {
          params: Promise.resolve({ teamId: "team-1" })
        })
      },
      {
        name: "shot map compare",
        response: getShotMapCompare(new Request("http://localhost/api/shot-map/compare"))
      },
      {
        name: "player shot map",
        response: getPlayerShotMap(new Request("http://localhost/api/players/player-1/shot-map"), {
          params: Promise.resolve({ snapshotId: "player-1" })
        })
      }
    ];

    for (const item of cases) {
      const response = await item.response;
      assert.equal(response.status, 401, item.name);
      assert.equal((await response.json()).error.code, "UNAUTHORIZED", item.name);
    }
  });
});
