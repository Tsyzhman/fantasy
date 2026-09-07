import test from "node:test";
import assert from "node:assert/strict";
import { readKhlBody } from "../server/khl/access";
test("API-01: streamed body limit cannot be bypassed by omitted Content-Length", async () => {
  await assert.rejects(readKhlBody(new Request("http://localhost/test", { method: "POST", body: JSON.stringify({ value: "x".repeat(256 * 1024) }) })), /256 KiB/);
  assert.deepEqual(await readKhlBody(new Request("http://localhost/test", { method: "POST", body: '{"valid":true}' })), { valid: true });
  await assert.rejects(readKhlBody(new Request("http://localhost/test", { method: "POST", body: "[]" })), /JSON/);
});
