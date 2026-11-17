/** @spec spec://common/INFRA-006-continuous-deployment#runtime */
import assert from "node:assert/strict";
import test from "node:test";
import { draftPrefix, parsePlannerDraft, writePlannerDraft, type PlannerDraft } from "./planner-draft";
import { fantasyRoundPlansFingerprint } from "./planner-squad-commands";
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

// @spec spec://modules/machete/FEAT-001-global-ranking-strategy#data
test("late Sports publication restores the draft edit by tour ID after the window advances", () => {
  const value = draft();
  const original = value.roundPlans[0];
  const second = { ...original, roundOffset: 1, selections: [{ ...original.selections[0], playerId: "previous" }] };
  value.roundIds = ["tour1", "tour2"];
  value.baseline = fantasyRoundPlansFingerprint([original, second]);
  value.roundPlans = [original, { ...second, selections: [{ ...second.selections[0], playerId: "planned" }] }];
  value.activeRoundOffset = 1;
  const current = [{ ...original, selections: [{ ...original.selections[0], playerId: "published" }] }];
  const restored = parsePlannerDraft(JSON.stringify(value), fantasyRoundPlansFingerprint(current), Date.now(), { id: "s2", roundIds: ["tour2"], saved: current });
  assert.equal(restored?.activeRoundOffset, 0);
  assert.equal(restored?.roundPlans[0].selections[0].playerId, "planned");
});

test("same publication with a rolling calendar keeps a lock edit and the newly published teammate", () => {
  const value = draft();
  const original = value.roundPlans[0];
  const one = original.selections[0];
  const two = { ...one, playerId: "old-teammate", slotIndex: 2 };
  const future = { ...original, roundOffset: 1, selections: [one, two] };
  value.publicationId = "publication";
  value.roundIds = ["old", "next"];
  value.baseline = fantasyRoundPlansFingerprint([original, future]);
  value.roundPlans = [original, { ...future, selections: [{ ...one, isLocked: false }, two] }];
  const current = [{ ...original, selections: [one, { ...two, playerId: "published-teammate" }] }];
  const restored = parsePlannerDraft(JSON.stringify(value), fantasyRoundPlansFingerprint(current), Date.now(),
    { id: "publication", roundIds: ["next"], saved: current });
  assert.deepEqual(restored?.roundPlans[0].selections.map(s => [s.playerId, s.isLocked]), [[one.playerId, false], ["published-teammate", true]]);
});
