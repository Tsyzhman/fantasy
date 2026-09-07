import assert from "node:assert/strict";
import test from "node:test";
import { collectMobileCalendar, parseMobileCalendar } from "./calendar";
const event = { id: 3000059, khl_id: 901980, stage_id: 407, outer_stage_id: 1436, type_id: 18, game_state_key: "finished", start_at: 1788616800000, team_a: { id: 42, khl_id: 56, name: "Северсталь" }, team_b: { id: 32, khl_id: 38, name: "Салават" }, scores: { overtime: null, bullitt: null }, score: "2:3" };
test("ING-02/03: mobile and official IDs differ, milliseconds, scopes and overtime", () => {
  const parsed = parseMobileCalendar([{ event }], "407")[0];
  assert.equal(parsed.eventId, "3000059"); assert.equal(parsed.officialMatchId, "901980");
  assert.equal(Date.parse(parsed.startsAt), 1788616800000);
  assert.equal(parsed.decidedBy, "REGULATION");
  assert.equal(parseMobileCalendar([{ event: { ...event, scores: { bullitt: "2:0", overtime: "0:0" } } }], "407")[0].decidedBy, "SO");
  assert.throws(() => parseMobileCalendar([{ event: { ...event, start_at: 1788616800 } }], "407"));
  assert.throws(() => parseMobileCalendar([{ event }], "OTHER"));
});
test("ING-02: all pages required, repeated page rejected", async () => {
  const scope = { stageId: "407", from: event.start_at - 1, to: event.start_at + 1 };
  const result = await collectMobileCalendar(async page => page === 1 ? [{ event }] : [], scope);
  assert.equal(result.complete, true); assert.equal(result.matches.length, 1);
  await assert.rejects(collectMobileCalendar(async () => [{ event }], scope), /DUPLICATE/);
});
