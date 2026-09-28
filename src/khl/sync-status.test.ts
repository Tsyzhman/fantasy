/** @spec spec://modules/khl/INFRA-001-khl-data-ingestion#sync-status
 * @spec spec://modules/khl/FEAT-002-khl-squad#layout
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { khlSyncStatus, khlRunningCursor, khlCompletedCursor, formatKhlSyncTime } from "./sync-status";
import { KhlSyncStatusPanel } from "../components/khl/KhlSyncStatusPanel";

const first = new Date("2026-09-28T07:22:00Z"), finished = new Date("2026-09-28T07:25:00Z");
const good = khlSyncStatus({ cursor: { startedAt: first.toISOString(), status: "DONE", sources: [{ source: "Каталог", status: "DONE" }] }, completedAt: finished }, finished);

test("catalog freshness and unknown full-success time remain separate before the first completed cycle", () => {
  const state = khlSyncStatus(null, first);
  assert.equal(state.catalogUpdatedAt, first.toISOString());
  assert.equal(state.lastSuccessAt, null);
  assert.equal(state.lastAttempt, null);
  const html = renderToStaticMarkup(createElement(KhlSyncStatusPanel, { contestId: "one", initialStatus: state }));
  assert.match(html, /Каталог и цены:/);
  assert.match(html, /ещё не зафиксировано/);
  assert.match(html, /Завершённых попыток обновления пока нет/);
});

test("legacy pending and partial cycles do not prove a full successful refresh", () => {
  assert.equal(good.lastSuccessAt, finished.toISOString());
  for (const status of ["PARTIAL", "PENDING"]) {
    const state = khlSyncStatus({ cursor: { status }, completedAt: finished }, first);
    assert.equal(state.lastSuccessAt, null);
    assert.equal(state.lastAttempt?.status, status);
  }
});

test("source failure and pending work preserve the previous full success across process restarts", () => {
  const startedAt = new Date("2026-09-28T08:22:00Z"), completedAt = new Date("2026-09-28T08:30:00Z");
  for (const status of ["FAILED", "PENDING"]) {
    const running = khlSyncStatus({ cursor: khlRunningCursor(good, startedAt), completedAt: finished }, first, startedAt);
    assert.equal(running.lastAttempt?.completedAt, finished.toISOString());
    const cursor = khlCompletedCursor(running, startedAt, completedAt, [{ source: "Протоколы", status, detail: "HTTP_403 internal private details" }]);
    const restored = khlSyncStatus({ cursor, completedAt }, first);
    assert.equal(restored.lastSuccessAt, finished.toISOString());
    assert.equal(restored.lastAttempt?.status, status === "FAILED" ? "PARTIAL" : "PENDING");
    assert.equal(restored.runningSince, null);
    assert.ok(!JSON.stringify(restored).includes("internal private details"));
    const html = renderToStaticMarkup(createElement(KhlSyncStatusPanel, { contestId: "one", initialStatus: restored }));
    assert.match(html, status === "FAILED" ? /Завершилось с ошибками/ : /Не завершено/);
    if (status === "FAILED") assert.match(html, /Ошибки: Протоколы/);
  }
});

test("only DONE advances full success to completion time", () => {
  const cursor = khlCompletedCursor(good, first, new Date("2026-09-28T08:30:00Z"), [{ source: "Все данные", status: "DONE", detail: {} }]);
  const state = khlSyncStatus({ cursor, completedAt: new Date("2026-09-28T08:30:00Z") }, first);
  assert.equal(state.lastSuccessAt, "2026-09-28T08:30:00.000Z");
  assert.match(renderToStaticMarkup(createElement(KhlSyncStatusPanel, { contestId: "one", initialStatus: state })), /Успешно/);
});

test("interrupted refresh retains the latest completed error without appearing permanently active", () => {
  const failedCursor = khlCompletedCursor(good, first, finished, [{ source: "Sports", status: "FAILED", detail: "private" }]);
  const failed = khlSyncStatus({ cursor: failedCursor, completedAt: finished }, first);
  const cursor = khlRunningCursor(failed, new Date("2026-09-28T08:22:00Z"));
  const active = khlSyncStatus({ cursor, completedAt: finished }, first, new Date("2026-09-28T08:40:00Z"));
  const interrupted = khlSyncStatus({ cursor, completedAt: finished }, first, new Date("2026-09-28T09:00:00Z"));
  assert.equal(active.interrupted, false);
  assert.equal(interrupted.interrupted, true);
  assert.equal(interrupted.lastAttempt?.status, "PARTIAL");
  assert.equal(interrupted.lastSuccessAt, good.lastSuccessAt);
  const html = renderToStaticMarkup(createElement(KhlSyncStatusPanel, { contestId: "one", initialStatus: interrupted }));
  assert.match(html, /прервано/);
  assert.match(html, /Ошибки: Sports/);
});

test("status storage and public summaries stay bounded without accumulating run history", () => {
  const results = Array.from({ length: 100 }, () => ({ source: "x".repeat(500), status: "FAILED", detail: "y".repeat(5000) }));
  const cursor = khlCompletedCursor(good, first, finished, results);
  assert.equal(cursor.sources.length, 10);
  assert.ok(cursor.sources.every(s => s.source.length === 120 && s.detail.length === 2000));
  const state = khlSyncStatus({ cursor, completedAt: finished }, first);
  const running = khlRunningCursor(state, first);
  assert.ok(JSON.stringify(running).length < 2500);
  assert.ok(!JSON.stringify(running.previousAttempt).includes("previousAttempt"));
});

test("date and time always use Moscow instead of the visitor timezone", () => {
  assert.match(formatKhlSyncTime(first.toISOString()), /28\.09\.2026, 10:22:00 МСК/);
  assert.equal(formatKhlSyncTime(null), "дата неизвестна");
});
