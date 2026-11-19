/** @spec spec://modules/agents/FEAT-016-personal-agent-api#transport */
import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";
import { ApiError } from "@/lib/api-handler";
import { proxy } from "@/proxy";
import { readAgentJson, withAgentKey } from "./http";

const base = "https://example.test";
function chunked(parts: Uint8Array[], headers: HeadersInit = {}) {
  let index = 0;
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (index < parts.length) controller.enqueue(parts[index++]);
      else controller.close();
    }
  });
  return new Request(base, { method: "POST", body, duplex: "half", headers: { "content-type": "application/json", ...headers } } as RequestInit);
}

test("JSON byte limit covers chunked input and ignores underreported lengths", async () => {
  const bytes = new TextEncoder().encode('{"name":"ключ"}');
  assert.deepEqual(await readAgentJson(chunked([bytes.slice(0, 10), bytes.slice(10)]), bytes.length), { name: "ключ" });
  const headerCases: Record<string, string>[] = [{}, { "content-length": "1" }, { "content-length": "9000" }];
  for (const headers of headerCases) {
    await assert.rejects(readAgentJson(chunked([bytes.slice(0, 4), bytes.slice(4)], headers), bytes.length - 1),
      (error: unknown) => error instanceof ApiError && error.status === 413);
  }
  for (const bytes of [new Uint8Array([0xc3]), new TextEncoder().encode("[]"), new TextEncoder().encode("null")]) {
    await assert.rejects(readAgentJson(chunked([bytes])), (error: unknown) => error instanceof ApiError && error.status === 400);
  }
});

test("agent requests reach bearer verification, web pages keep the session login flow", async () => {
  for (const path of ["/api/mcp", "/api/v1/agent/tools", "/api/v1/agent/tools/squads_list"]) {
    assert.equal(proxy(new NextRequest(base + path)).headers.get("x-middleware-next"), "1");
  }
  const login = proxy(new NextRequest(base + "/profile?tab=keys"));
  assert.equal(login.status, 307);
  assert.equal(new URL(login.headers.get("location")!).searchParams.get("next"), "/profile?tab=keys");
  const protectedHandler = withAgentKey(async () => { throw new Error("unexpected authorization"); });
  const result = await protectedHandler(new Request(base, { headers: { cookie: "fantasy_session=web-token" } }));
  assert.equal(result.status, 401);
  assert.match(result.headers.get("www-authenticate") ?? "", /^Bearer /);
  assert.equal(result.headers.get("cache-control"), "private, no-store");
  assert.equal((await result.json()).error.code, "UNAUTHORIZED");
  assert.equal((await protectedHandler(new Request(base, { headers: { Origin: "https://elsewhere.test" } }))).status, 403);
});
