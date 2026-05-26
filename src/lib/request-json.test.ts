import assert from "node:assert/strict";
import test from "node:test";

import { readJsonObject, readJsonObjectOrNull } from "./request-json";

test("readJsonObject returns parsed JSON objects", async () => {
  const body = await readJsonObject(jsonRequest(JSON.stringify({ source: "machete", enabled: true })));
  assert.deepEqual(body, { source: "machete", enabled: true });
});

test("readJsonObject falls back to an empty object for non-object JSON", async () => {
  assert.deepEqual(await readJsonObject(jsonRequest("null")), {});
  assert.deepEqual(await readJsonObject(jsonRequest("[]")), {});
  assert.deepEqual(await readJsonObject(jsonRequest('"machete"')), {});
  assert.deepEqual(await readJsonObject(jsonRequest("42")), {});
});

test("readJsonObject falls back to an empty object for malformed or empty bodies", async () => {
  assert.deepEqual(await readJsonObject(jsonRequest("{")), {});
  assert.deepEqual(await readJsonObject(jsonRequest("")), {});
});

test("readJsonObjectOrNull preserves the difference between empty objects and invalid bodies", async () => {
  assert.deepEqual(await readJsonObjectOrNull(jsonRequest("{}")), {});
  assert.equal(await readJsonObjectOrNull(jsonRequest("null")), null);
  assert.equal(await readJsonObjectOrNull(jsonRequest("[]")), null);
  assert.equal(await readJsonObjectOrNull(jsonRequest("{")), null);
});

function jsonRequest(body: string) {
  return new Request("http://localhost/api/test", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body
  });
}
