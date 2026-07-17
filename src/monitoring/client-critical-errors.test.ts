import assert from "node:assert/strict";
import test from "node:test";

import {
  acceptClientErrorRequest,
  clientErrorRouteGroup,
  clientErrorWindowMinutes,
  clientErrorWindowStart,
  parseClientCriticalErrorPayload
} from "./client-critical-errors";

test("client critical-error payload accepts only coarse allowlisted fields", () => {
  assert.deepEqual(
    parseClientCriticalErrorPayload({ kind: "WINDOW_ERROR", routeGroup: "machete" }),
    { kind: "WINDOW_ERROR", routeGroup: "machete" }
  );
  assert.equal(parseClientCriticalErrorPayload({ kind: "TypeError", routeGroup: "machete" }), null);
  assert.equal(parseClientCriticalErrorPayload({ kind: "WINDOW_ERROR", routeGroup: "/machete/squad?id=42" }), null);
  assert.equal(parseClientCriticalErrorPayload({ kind: "WINDOW_ERROR", routeGroup: "machete", message: "private" }), null);
  assert.equal(parseClientCriticalErrorPayload({ kind: "WINDOW_ERROR", routeGroup: "machete", userId: "123" }), null);
  assert.equal(parseClientCriticalErrorPayload(null), null);
});

test("client route grouping discards nested paths and unknown route names", () => {
  assert.equal(clientErrorRouteGroup("/"), "root");
  assert.equal(clientErrorRouteGroup("/machete/squad"), "machete");
  assert.equal(clientErrorRouteGroup("/admin/beta-test"), "admin");
  assert.equal(clientErrorRouteGroup("/players/private-name"), "other");
});

test("client error health window remains operationally bounded", () => {
  assert.equal(clientErrorWindowMinutes(undefined), 60);
  assert.equal(clientErrorWindowMinutes("5"), 5);
  assert.equal(clientErrorWindowMinutes("1440"), 1_440);
  assert.equal(clientErrorWindowMinutes("1"), 60);
  assert.equal(clientErrorWindowMinutes("99999"), 60);
  assert.equal(clientErrorWindowMinutes("not-a-number"), 60);
});

test("client error health includes the whole oldest minute bucket", () => {
  assert.equal(
    clientErrorWindowStart(new Date("2026-07-17T12:39:59.999Z"), 60).toISOString(),
    "2026-07-17T11:39:00.000Z"
  );
});

test("client error request limiter bounds anonymous work before the database", () => {
  const minute = Date.parse("2026-07-17T12:39:00.000Z");
  assert.equal(acceptClientErrorRequest(minute, 2), true);
  assert.equal(acceptClientErrorRequest(minute + 1_000, 2), true);
  assert.equal(acceptClientErrorRequest(minute + 2_000, 2), false);
  assert.equal(acceptClientErrorRequest(minute + 60_000, 2), true);
});
