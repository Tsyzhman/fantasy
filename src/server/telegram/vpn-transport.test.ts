import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { withEnv } from "@/test-utils/env";
import { sendTelegramMessage } from "./bot-api";
import { fetchTelegramViaRelay, telegramRelayRequestPath, telegramRelaySocketPath } from "./vpn-transport";

/**
 * @spec spec://modules/telegram/INFRA-005-deadline-pipeline#delivery
 */
test("relay path validation accepts only allowlisted bot methods", () => {
  assert.equal(
    telegramRelayRequestPath("/bot123456:TEST-token_ABC/sendMessage"),
    "/telegram/bot123456:TEST-token_ABC/sendMessage"
  );
  assert.equal(
    telegramRelayRequestPath("/bot123456:TEST-token_ABC/setWebhook"),
    "/telegram/bot123456:TEST-token_ABC/setWebhook"
  );
  assert.equal(
    telegramRelayRequestPath("/bot123456:TEST-token_ABC/getWebhookInfo"),
    "/telegram/bot123456:TEST-token_ABC/getWebhookInfo"
  );
  assert.equal(
    telegramRelayRequestPath("/bot123456:TEST-token_ABC/getUpdates"),
    "/telegram/bot123456:TEST-token_ABC/getUpdates"
  );
  assert.equal(telegramRelayRequestPath("/bot123456:TEST-token_ABC/deleteMessage"), null);
  assert.equal(telegramRelayRequestPath("/bot1:short/sendMessage"), null);
  assert.equal(telegramRelayRequestPath("/api/bootstrap-static/"), null);
});

test("telegram socket path prefers its own variable and falls back to the shared VPN relay", () => {
  assert.equal(telegramRelaySocketPath({ TELEGRAM_RELAY_SOCKET_PATH: "/run/fpl-relay/fpl.sock" }), "/run/fpl-relay/fpl.sock");
  assert.equal(telegramRelaySocketPath({ FPL_RELAY_SOCKET_PATH: "/run/fpl-relay/fpl.sock" }), "/run/fpl-relay/fpl.sock");
  assert.equal(telegramRelaySocketPath({ TELEGRAM_RELAY_SOCKET_PATH: "relative.sock" }), null);
  assert.equal(telegramRelaySocketPath({}), null);
});

test(
  "sendTelegramMessage posts JSON through the relay socket without touching api.telegram.org",
  { skip: process.platform === "win32" ? "Unix sockets are not available on Windows." : false },
  async () => {
    const directory = mkdtempSync(join(tmpdir(), "telegram-relay-"));
    const socketPath = join(directory, "relay.sock");
    const requests: Array<{ path: string; method: string; body: string }> = [];
    const server = createServer((request, response) => {
      const chunks: Buffer[] = [];
      request.on("data", (chunk: Buffer) => chunks.push(chunk));
      request.on("end", () => {
        requests.push({ path: request.url ?? "", method: request.method ?? "", body: Buffer.concat(chunks).toString("utf8") });
        response.writeHead(200, { "content-type": "application/json" });
        response.end(JSON.stringify({ ok: true, result: { message_id: 77 } }));
      });
    });
    await new Promise<void>((resolve) => server.listen(socketPath, resolve));
    try {
      await withEnv({ TELEGRAM_RELAY_SOCKET_PATH: socketPath, FPL_RELAY_SOCKET_PATH: undefined }, async () => {
        const result = await sendTelegramMessage({ token: "123456:TEST-token_ABC", chatId: "42", text: "hello", parseMode: "HTML" });
        assert.equal(result.messageId, "77");
      });
      assert.equal(requests.length, 1);
      assert.equal(requests[0]?.path, "/telegram/bot123456:TEST-token_ABC/sendMessage");
      assert.equal(requests[0]?.method, "POST");
      assert.match(requests[0]?.body ?? "", /"chat_id":"42"/);
      assert.match(requests[0]?.body ?? "", /"parse_mode":"HTML"/);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      rmSync(directory, { recursive: true, force: true });
    }
  }
);

test("relay transport refuses non-allowlisted bot methods before connecting", async () => {
  await assert.rejects(
    fetchTelegramViaRelay("/tmp/telegram-relay-nonexistent.sock", "/bot123456:TEST-token_ABC/deleteMessage", {}),
    /non-allowlisted/
  );
});
