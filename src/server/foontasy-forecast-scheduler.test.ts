import assert from "node:assert/strict";
import test from "node:test";

import { nextFoontasyWeeklyRun } from "@/server/foontasy-forecast-scheduler";

test("Foontasy sync is scheduled for Thursday at 04:30 Moscow time", () => {
  const now = new Date("2026-07-22T12:00:00.000Z");
  const schedule = nextFoontasyWeeklyRun(now);
  assert.equal(schedule.label, "2026-07-23 04:30 Europe/Moscow");
  assert.equal(new Date(now.getTime() + schedule.delayMs).toISOString(), "2026-07-23T01:30:00.000Z");
});

test("a passed weekly slot moves to the following week", () => {
  const now = new Date("2026-07-23T02:00:00.000Z");
  const schedule = nextFoontasyWeeklyRun(now);
  assert.equal(schedule.label, "2026-07-30 04:30 Europe/Moscow");
});

test("invalid schedule values fall back to the safe weekly default", () => {
  const now = new Date("2026-07-22T12:00:00.000Z");
  const schedule = nextFoontasyWeeklyRun(now, { weekday: 99, time: "99:99" });
  assert.equal(schedule.label, "2026-07-23 04:30 Europe/Moscow");
});
