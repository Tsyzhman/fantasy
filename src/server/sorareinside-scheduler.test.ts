/** @spec spec://modules/machete/INFRA-004-sorareinside-starters#runtime */
import test from "node:test";
import assert from "node:assert/strict";
import {nextSorareInsideSyncAt} from "./sorareinside-scheduler";
test("schedule runs at :05 every hour, including midnight rollover",()=> {
  for(const [now,next] of [["2026-09-11T12:04:59Z","2026-09-11T12:05:00.000Z"],["2026-09-11T12:05:00Z","2026-09-11T13:05:00.000Z"],["2026-09-11T23:59:59Z","2026-09-12T00:05:00.000Z"]]) assert.equal(nextSorareInsideSyncAt(new Date(now)).toISOString(),next);
});
