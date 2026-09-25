#!/usr/bin/env node

import { createServer } from "node:http";
import { request as httpsRequest } from "node:https";
import { chmodSync, existsSync, lstatSync, mkdirSync, unlinkSync } from "node:fs";
import { dirname } from "node:path";

const socketPath = process.env.FPL_RELAY_SOCKET_PATH?.trim() || "/run/fpl-relay/fpl.sock";
if (!socketPath.startsWith("/") || socketPath.includes("\0") || socketPath.length > 100) {
  throw new Error("FPL_RELAY_SOCKET_PATH must be an absolute Unix socket path of at most 100 characters.");
}
const upstreamOrigin = "https://fantasy.premierleague.com";
const upstreamTimeoutMs = strictInteger(process.env.FPL_RELAY_UPSTREAM_TIMEOUT_MS, 15_000, 1, 60_000);
const maximumBodyBytes = strictInteger(process.env.FPL_RELAY_MAX_BODY_BYTES, 8 * 1024 * 1024, 1, 32 * 1024 * 1024);
const telegramOrigin = "https://api.telegram.org";
const telegramTimeoutMs = strictInteger(process.env.TELEGRAM_RELAY_UPSTREAM_TIMEOUT_MS, 20_000, 1, 60_000);
const telegramMaximumBodyBytes = strictInteger(process.env.TELEGRAM_RELAY_MAX_BODY_BYTES, 64 * 1024, 1, 1024 * 1024);
const telegramPathPattern = /^\/telegram\/(bot\d{5,}:[A-Za-z0-9_-]{10,}\/(?:sendMessage|setWebhook|deleteWebhook|getMe))$/;
const allowedPaths = [
  // @spec spec://modules/machete/FEAT-001-global-ranking-strategy#data
  /^\/api\/entry\/[1-9]\d*\/history\/$/,
  /^\/api\/leagues-classic\/[1-9]\d*\/standings\/$/,
  /^\/api\/bootstrap-static\/$/,
  /^\/api\/fixtures(?:\/)?$/,
  /^\/api\/event\/[1-9]\d*\/live\/$/,
  /^\/api\/entry\/[1-9]\d*\/$/,
  /^\/api\/entry\/[1-9]\d*\/event\/[1-9]\d*\/picks\/$/
];

const server = createServer((request, response) => {
  if (request.method === "GET" && request.url === "/healthz") {
    response.writeHead(200, { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" });
    response.end("ok\n");
    return;
  }

  // @spec spec://modules/telegram/INFRA-005-deadline-pipeline#delivery
  // Telegram Bot API is unreachable without the VPN namespace; tokens stay inside the path.
  const telegramMatch = typeof request.url === "string" ? request.url.match(telegramPathPattern) : null;
  if (telegramMatch) {
    proxyTelegram(request, response, telegramMatch[1]);
    return;
  }

  if (request.method !== "GET") {
    sendError(response, 405, "method not allowed");
    return;
  }

  let target;
  try {
    target = new URL(request.url ?? "", upstreamOrigin);
  } catch {
    sendError(response, 400, "invalid request target");
    return;
  }
  if (target.origin !== upstreamOrigin || !allowedPaths.some((pattern) => pattern.test(target.pathname))) {
    sendError(response, 404, "path not allowed");
    return;
  }

  const upstream = httpsRequest(target, {
    method: "GET",
    headers: {
      accept: "application/json",
      "accept-encoding": "identity",
      "user-agent": "FantasyScoutFplVpnRelay/1.0"
    }
  }, (upstreamResponse) => {
    const chunks = [];
    let totalBytes = 0;
    upstreamResponse.on("data", (chunk) => {
      totalBytes += chunk.length;
      if (totalBytes > maximumBodyBytes) {
        upstreamResponse.destroy(new Error("upstream response exceeds the configured limit"));
        return;
      }
      chunks.push(chunk);
    });
    upstreamResponse.on("end", () => {
      if (response.headersSent) return;
      const body = Buffer.concat(chunks);
      response.writeHead(upstreamResponse.statusCode ?? 502, relayResponseHeaders(upstreamResponse.headers, body.length));
      response.end(body);
    });
    upstreamResponse.on("error", () => {
      if (!response.headersSent) sendError(response, 502, "upstream response failed");
      else response.destroy();
    });
  });
  upstream.setTimeout(upstreamTimeoutMs, () => upstream.destroy(new Error("upstream timeout")));
  upstream.on("error", () => {
    if (!response.headersSent) sendError(response, 502, "upstream request failed");
    else response.destroy();
  });
  upstream.end();
});

server.requestTimeout = upstreamTimeoutMs + 5_000;
server.headersTimeout = 5_000;
mkdirSync(dirname(socketPath), { recursive: true });
if (existsSync(socketPath)) {
  if (!lstatSync(socketPath).isSocket()) throw new Error("Refusing to replace a non-socket relay path.");
  unlinkSync(socketPath);
}
server.listen(socketPath, () => {
  chmodSync(socketPath, 0o660);
  process.stdout.write(`FPL relay listening on ${socketPath}\n`);
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => server.close(() => {
    if (existsSync(socketPath) && lstatSync(socketPath).isSocket()) unlinkSync(socketPath);
    process.exit(0);
  }));
}

function proxyTelegram(request, response, upstreamPath) {
  const method = request.method ?? "GET";
  if (method !== "GET" && method !== "POST") {
    sendError(response, 405, "method not allowed");
    return;
  }
  const chunks = [];
  let totalBytes = 0;
  let tooLarge = false;
  request.on("data", (chunk) => {
    totalBytes += chunk.length;
    if (totalBytes > telegramMaximumBodyBytes) {
      tooLarge = true;
      return;
    }
    chunks.push(chunk);
  });
  request.on("end", () => {
    if (tooLarge) {
      sendError(response, 413, "request body too large");
      return;
    }
    const body = Buffer.concat(chunks);
    const upstream = httpsRequest(new URL(`${telegramOrigin}/${upstreamPath}`), {
      method,
      headers: {
        "content-type": "application/json",
        "content-length": body.length,
        accept: "application/json",
        "user-agent": "FantasyScoutTelegramVpnRelay/1.0"
      }
    }, (upstreamResponse) => {
      const responseChunks = [];
      let responseBytes = 0;
      upstreamResponse.on("data", (chunk) => {
        responseBytes += chunk.length;
        if (responseBytes > telegramMaximumBodyBytes) {
          upstreamResponse.destroy(new Error("upstream response exceeds the configured limit"));
          return;
        }
        responseChunks.push(chunk);
      });
      upstreamResponse.on("end", () => {
        if (response.headersSent) return;
        const payload = Buffer.concat(responseChunks);
        response.writeHead(upstreamResponse.statusCode ?? 502, relayResponseHeaders(upstreamResponse.headers, payload.length));
        response.end(payload);
      });
      upstreamResponse.on("error", () => {
        if (!response.headersSent) sendError(response, 502, "upstream response failed");
        else response.destroy();
      });
    });
    upstream.setTimeout(telegramTimeoutMs, () => upstream.destroy(new Error("upstream timeout")));
    upstream.on("error", () => {
      if (!response.headersSent) sendError(response, 502, "upstream request failed");
      else response.destroy();
    });
    upstream.end(body);
  });
  request.on("error", () => {
    if (!response.headersSent) sendError(response, 400, "invalid request body");
  });
}

function relayResponseHeaders(headers, bodyLength) {
  const result = {
    "content-type": firstHeader(headers["content-type"]) ?? "application/octet-stream",
    "content-length": String(bodyLength),
    "cache-control": "no-store"
  };
  for (const name of ["date", "etag", "last-modified", "retry-after", "server", "via", "x-cache", "x-cache-hits", "x-served-by", "x-timer"]) {
    const value = firstHeader(headers[name]);
    if (value) result[name] = value;
  }
  return result;
}

function firstHeader(value) {
  return Array.isArray(value) ? value[0] : value;
}

function sendError(response, status, message) {
  response.writeHead(status, { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" });
  response.end(`${message}\n`);
}

function strictInteger(value, fallback, minimum, maximum) {
  if (value === undefined || value === "") return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error(`Invalid relay integer configuration; expected ${minimum}..${maximum}.`);
  }
  return parsed;
}
