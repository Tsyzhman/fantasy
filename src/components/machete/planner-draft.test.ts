/** @spec spec://common/INFRA-006-continuous-deployment#runtime */
import assert from "node:assert/strict";
import test from "node:test";
import { draftPrefix, parsePlannerDraft, writePlannerDraft, type PlannerDraft } from "./planner-draft";
import { keyboardColumnWidth } from "./ColumnResizeHandle";
class MemoryStorage implements Storage {
  values = new Map<string, string>();
  get length() { return this.values.size; }
  clear() { this.values.clear(); }
  getItem(key: string) { return this.values.get(key) ?? null; }
  key(index: number) { return [...this.values.keys()][index] ?? null; }
  removeItem(key: string) { this.values.delete(key); }
  setItem(key: string, value: string) { this.values.set(key, value); }
}
const draft = (updatedAt = Date.now()): PlannerDraft => ({ version: 1, updatedAt, baseline: "saved-squad", horizon: 3,
  activeRoundOffset: 0, openingFreeTransfers: 2, transferBaselinePlayerIds: ["old-player"],
  roundPlans: [{ roundOffset: 0, linkedToPrevious: false, selections: [{ playerId: "new-player", isStarter: true, isLocked: true, isCaptain: true, isViceCaptain: false, slotIndex: 1, purchasePrice: 7 }] }] });
test("draft survives reload with captain, locks, rounds and transfers; saved/expired/foreign drafts are rejected", () => {
  const storage = new MemoryStorage(), key = draftPrefix + "user:SPORTS_RU:63:2026/2027:squad";
  const value = draft(); writePlannerDraft(storage, key, value);
  assert.deepEqual(parsePlannerDraft(storage.getItem(key), "saved-squad"), value);
  assert.equal(parsePlannerDraft(storage.getItem(key), "changed-server-squad"), null);
  assert.equal(parsePlannerDraft(storage.getItem(key), "saved-squad", value.updatedAt + 86400001), null);
  assert.equal(parsePlannerDraft(JSON.stringify({ ...value, roundPlans: [{ ...value.roundPlans[0], selections: [value.roundPlans[0].selections[0], value.roundPlans[0].selections[0]] }] }), "saved-squad"), null);
  writePlannerDraft(storage, key, null); assert.equal(storage.length, 0);
});
test("draft retention keeps at most eight entries without touching other session storage", () => {
  const storage = new MemoryStorage(); storage.setItem("unrelated", "preserved");
  for (let index = 0; index < 30; index++) writePlannerDraft(storage, draftPrefix + index, draft(Date.now() - 10000 + index));
  assert.equal(storage.length, 9); assert.equal(storage.getItem("unrelated"), "preserved");
  assert.equal(storage.getItem(draftPrefix + "0"), null);
});
test("draft quota uses encoded bytes for Unicode as well as ASCII", () => {
  const storage = new MemoryStorage(), value = { ...draft(), baseline: "Ж".repeat(33000) };
  const raw = JSON.stringify(value);
  assert.ok(raw.length < 65536);
  assert.ok(new TextEncoder().encode(raw).byteLength > 65536);
  assert.equal(parsePlannerDraft(raw, value.baseline) === null, true);
  writePlannerDraft(storage, draftPrefix + "unicode", value);
  assert.equal(storage.length, 0);
});
test("keyboard resize honors bounds and accelerated steps without handling unrelated keys", () => {
  assert.equal(keyboardColumnWidth(72, "ArrowRight"), 80);
  assert.equal(keyboardColumnWidth(72, "ArrowLeft", true), 40);
  assert.equal(keyboardColumnWidth(632, "ArrowRight", true), 640);
  assert.equal(keyboardColumnWidth(100, "Home"), 40);
  assert.equal(keyboardColumnWidth(100, "End"), 640);
  assert.equal(keyboardColumnWidth(100, "Tab"), null);
});
