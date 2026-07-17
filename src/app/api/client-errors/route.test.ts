import assert from "node:assert/strict";
import test from "node:test";

import { withEnv } from "../../../test-utils/env";

import { POST } from "./route";

test("anonymous client-error route rejects oversized bodies before database access", async () => {
  await withEnv({ DATABASE_URL: "postgresql://user:pass@localhost:5432/app" }, async () => {
    const response = await POST(new Request("http://localhost/api/client-errors", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ kind: "WINDOW_ERROR", routeGroup: "machete", padding: "x".repeat(300) })
    }));
    assert.equal(response.status, 413);
    assert.equal((await response.json()).error.code, "PAYLOAD_TOO_LARGE");
  });
});

test("anonymous client-error route stops an oversized stream without content-length", async () => {
  await withEnv({ DATABASE_URL: "postgresql://user:pass@localhost:5432/app" }, async () => {
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode("x".repeat(257)));
        controller.close();
      }
    });
    const response = await POST(new Request("http://localhost/api/client-errors", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
      duplex: "half"
    } as RequestInit & { duplex: "half" }));
    assert.equal(response.status, 413);
    assert.equal((await response.json()).error.code, "PAYLOAD_TOO_LARGE");
  });
});

test("anonymous client-error route rejects extra identifying fields", async () => {
  await withEnv({ DATABASE_URL: "postgresql://user:pass@localhost:5432/app" }, async () => {
    const response = await POST(new Request("http://localhost/api/client-errors", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ kind: "WINDOW_ERROR", routeGroup: "machete", sessionId: "not-allowed" })
    }));
    assert.equal(response.status, 400);
    assert.equal((await response.json()).error.code, "BAD_REQUEST");
  });
});

test("anonymous client-error route fails closed without a configured database", async () => {
  await withEnv({ DATABASE_URL: "" }, async () => {
    const response = await POST(new Request("http://localhost/api/client-errors", {
      method: "POST",
      body: JSON.stringify({ kind: "WINDOW_ERROR", routeGroup: "machete" })
    }));
    assert.equal(response.status, 503);
    assert.equal((await response.json()).error.code, "DATABASE_NOT_CONFIGURED");
  });
});
