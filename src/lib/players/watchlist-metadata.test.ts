import assert from "node:assert/strict";
import test from "node:test";

import { watchlistMetadataWithTeamShortName, watchlistTeamShortName } from "./watchlist-metadata";

test("watchlist metadata preserves existing data and round-trips a normalized short team name", () => {
  const metadata = watchlistMetadataWithTeamShortName({ source: "saved" }, " Man\nUnited ");
  assert.deepEqual(metadata, { source: "saved", teamShortName: "Man United" });
  assert.equal(watchlistTeamShortName(metadata), "Man United");
});

test("watchlist metadata ignores malformed short names", () => {
  assert.deepEqual(watchlistMetadataWithTeamShortName({ source: "saved" }, 123), { source: "saved" });
  assert.equal(watchlistTeamShortName({ teamShortName: [] }), null);
});
