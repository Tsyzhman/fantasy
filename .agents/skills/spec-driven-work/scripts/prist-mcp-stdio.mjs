#!/usr/bin/env node
/* global fetch, process, TextDecoder, URL */

/**
 * Project-local stdio bridge for authenticated Prist Streamable HTTP MCP.
 *
 * @spec spec://modules/core/FEAT-103-agent-context#transports
 */

import { constants, open } from "node:fs/promises";
import { resolve } from "node:path";
import { createInterface } from "node:readline";

const JSON_RPC_VERSION = "2.0";
const MAX_CONNECTION_BYTES = 64 * 1024;
const MAX_RESPONSE_BYTES = 16 * 1024 * 1024;

class ConfigurationError extends Error {}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hasOwn(value, key) {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function configurationError(message) {
  return new ConfigurationError(message);
}

function validateEndpoint(endpoint, configuredOrigin) {
  if (endpoint.username || endpoint.password || endpoint.hash) {
    throw configurationError("Prist MCP endpoint configuration is invalid.");
  }
  const loopbackHttp = endpoint.protocol === "http:"
    && (endpoint.hostname === "localhost" || endpoint.hostname === "127.0.0.1");
  if (endpoint.protocol !== "https:" && !loopbackHttp) {
    throw configurationError("Prist MCP endpoint must use HTTPS. Loopback HTTP is allowed for isolated local tests.");
  }
  if (configuredOrigin && endpoint.origin !== configuredOrigin.origin) {
    throw configurationError("Prist MCP endpoint must match the configured origin.");
  }
  return endpoint;
}

function resolveEndpoint(connection) {
  const originValue = typeof connection.origin === "string" && connection.origin.length > 0
    ? connection.origin
    : undefined;
  let origin;
  if (originValue) {
    try {
      origin = new URL(originValue);
    } catch {
      throw configurationError("Prist origin configuration is invalid.");
    }
    if (origin.pathname !== "/" || origin.search || origin.hash || origin.username || origin.password) {
      throw configurationError("Prist origin configuration is invalid.");
    }
  }

  if (typeof connection.mcpEndpoint === "string" && connection.mcpEndpoint.length > 0) {
    try {
      return validateEndpoint(new URL(connection.mcpEndpoint, origin), origin);
    } catch (error) {
      if (error instanceof ConfigurationError) throw error;
      throw configurationError("Prist MCP endpoint configuration is invalid.");
    }
  }

  if (!origin || typeof connection.apiBasePath !== "string" || connection.apiBasePath.length === 0) {
    throw configurationError("Prist connection must define mcpEndpoint or the legacy origin and apiBasePath fields.");
  }
  try {
    const legacyBase = new URL(connection.apiBasePath, origin);
    if (legacyBase.origin !== origin.origin || legacyBase.search || legacyBase.hash) {
      throw configurationError("Prist legacy API path configuration is invalid.");
    }
    legacyBase.pathname = `${legacyBase.pathname.replace(/\/+$/, "")}/mcp`;
    return validateEndpoint(legacyBase, origin);
  } catch (error) {
    if (error instanceof ConfigurationError) throw error;
    throw configurationError("Prist legacy API path configuration is invalid.");
  }
}

async function loadConnection() {
  const projectRoot = resolve(process.env.PRIST_PROJECT_ROOT || process.cwd());
  const connectionPath = resolve(projectRoot, ".prist/connection.json");
  let handle;
  try {
    const noFollow = process.platform === "win32" ? 0 : constants.O_NOFOLLOW;
    handle = await open(connectionPath, constants.O_RDONLY | noFollow);
  } catch {
    throw configurationError("Prist connection is unavailable. Connect this repository before starting MCP.");
  }
  try {
    const metadata = await handle.stat();
    if (!metadata.isFile()) {
      throw configurationError("Prist connection must be a regular file.");
    }
    if (process.platform !== "win32" && (metadata.mode & 0o777) !== 0o600) {
      throw configurationError("Prist connection file permissions must be 0600.");
    }
    if (metadata.size > MAX_CONNECTION_BYTES) {
      throw configurationError("Prist connection file is too large.");
    }
    const source = await handle.readFile({ encoding: "utf8" });
    let connection;
    try {
      connection = JSON.parse(source);
    } catch {
      throw configurationError("Prist connection file contains invalid JSON.");
    }
    if (!isRecord(connection)) {
      throw configurationError("Prist connection file has an invalid shape.");
    }
    const credential = connection.credential;
    if (typeof credential !== "string" || credential.length < 1 || credential.length > 4096 || /\s|[^\x21-\x7e]/u.test(credential)) {
      throw configurationError("Prist connection credential is invalid.");
    }
    return { credential, endpoint: resolveEndpoint(connection) };
  } finally {
    await handle.close();
  }
}

function jsonRpcError(id, code, message) {
  return { jsonrpc: JSON_RPC_VERSION, id, error: { code, message } };
}

function writeMessage(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

function messageId(message) {
  if (isRecord(message) && hasOwn(message, "id")) {
    return typeof message.id === "string" || typeof message.id === "number" || message.id === null
      ? message.id
      : null;
  }
  return null;
}

function rpcMessages(value) {
  const messages = Array.isArray(value) ? value : [value];
  if (messages.length === 0 || messages.some((message) => !isRecord(message) || message.jsonrpc !== JSON_RPC_VERSION)) {
    throw new Error("invalid_rpc_message");
  }
  return messages;
}

function validClientMessage(message) {
  if (!isRecord(message) || message.jsonrpc !== JSON_RPC_VERSION) return false;
  if (typeof message.method === "string") return true;
  return hasOwn(message, "id") && (hasOwn(message, "result") || hasOwn(message, "error"));
}

function clientMessages(value) {
  const messages = Array.isArray(value) ? value : [value];
  if (messages.length === 0 || messages.some((message) => !validClientMessage(message))) return undefined;
  return messages;
}

function requestMessages(messages) {
  return messages.filter((message) => typeof message.method === "string" && hasOwn(message, "id"));
}

function validSessionId(value) {
  return value.length <= 256 && [...value].every((character) => {
    const code = character.codePointAt(0);
    return code !== undefined && code > 0x20 && code !== 0x7f;
  });
}

function sanitizeErrorMessage(message, credential) {
  if (!isRecord(message) || !hasOwn(message, "error")) return message;
  let serialized;
  try {
    serialized = JSON.stringify(message.error);
  } catch {
    return { ...message, error: { code: -32_000, message: "Prist MCP returned an invalid error." } };
  }
  const redacted = serialized
    .replaceAll(credential, "[redacted]")
    .replace(/Bearer\s+[^\s"']+/giu, "Bearer [redacted]");
  try {
    return { ...message, error: JSON.parse(redacted) };
  } catch {
    return { ...message, error: { code: -32_000, message: "Prist MCP returned an invalid error." } };
  }
}

async function readLimitedText(response) {
  if (!response.body) return "";
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let size = 0;
  let text = "";
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_RESPONSE_BYTES) throw new Error("response_too_large");
      text += decoder.decode(value, { stream: true });
    }
    return text + decoder.decode();
  } finally {
    reader.releaseLock();
  }
}

function parseSse(source) {
  const messages = [];
  let dataLines = [];
  let eventType = "message";
  const dispatch = () => {
    if (dataLines.length > 0 && eventType === "message") {
      const data = dataLines.join("\n");
      const parsed = JSON.parse(data);
      messages.push(...rpcMessages(parsed));
    }
    dataLines = [];
    eventType = "message";
  };
  for (const line of source.replace(/\r\n?/gu, "\n").split("\n")) {
    if (line === "") {
      dispatch();
      continue;
    }
    if (line.startsWith(":")) continue;
    const separator = line.indexOf(":");
    const field = separator === -1 ? line : line.slice(0, separator);
    let value = separator === -1 ? "" : line.slice(separator + 1);
    if (value.startsWith(" ")) value = value.slice(1);
    if (field === "data") dataLines.push(value);
    else if (field === "event") eventType = value;
  }
  dispatch();
  return messages;
}

async function responseMessages(response) {
  const mediaType = response.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
  if (mediaType !== "application/json" && mediaType !== "text/event-stream") {
    throw new Error("unsupported_content_type");
  }
  const source = await readLimitedText(response);
  if (mediaType === "application/json") return rpcMessages(JSON.parse(source));
  return parseSse(source);
}

function negotiatedProtocol(clientMessage, remoteMessages) {
  const initializeRequests = clientMessage.filter((message) => message.method === "initialize" && hasOwn(message, "id"));
  for (const request of initializeRequests) {
    const response = remoteMessages.find((message) => message.id === request.id && isRecord(message.result));
    const version = response?.result?.protocolVersion;
    if (typeof version === "string" && /^\d{4}-\d{2}-\d{2}$/u.test(version)) return version;
  }
  return undefined;
}

function transportErrors(requests, message) {
  return requests.map((request) => jsonRpcError(messageId(request), -32_000, message));
}

async function run(connection) {
  let protocolVersion;
  let sessionId;
  const input = createInterface({ input: process.stdin, crlfDelay: Infinity, terminal: false });

  for await (const line of input) {
    if (!line.trim()) continue;
    let message;
    try {
      message = JSON.parse(line);
    } catch {
      writeMessage(jsonRpcError(null, -32_700, "Invalid JSON received on MCP stdio."));
      continue;
    }
    const outgoing = clientMessages(message);
    if (!outgoing) {
      writeMessage(jsonRpcError(messageId(message), -32_600, "Invalid JSON-RPC message received on MCP stdio."));
      continue;
    }
    const requests = requestMessages(outgoing);
    const headers = {
      Accept: "application/json, text/event-stream",
      Authorization: `Bearer ${connection.credential}`,
      "Content-Type": "application/json",
      ...(protocolVersion ? { "MCP-Protocol-Version": protocolVersion } : {}),
      ...(sessionId ? { "Mcp-Session-Id": sessionId } : {}),
    };
    let response;
    try {
      response = await fetch(connection.endpoint, {
        method: "POST",
        headers,
        body: JSON.stringify(message),
        redirect: "error",
      });
    } catch {
      for (const error of transportErrors(requests, "Prist MCP transport is unavailable.")) writeMessage(error);
      continue;
    }

    const receivedSessionId = response.headers.get("mcp-session-id");
    if (receivedSessionId && validSessionId(receivedSessionId)) {
      sessionId = receivedSessionId;
    }
    if (response.status === 202) {
      await response.body?.cancel();
      if (requests.length > 0) {
        for (const error of transportErrors(requests, "Prist MCP accepted a request without returning a response.")) writeMessage(error);
      }
      continue;
    }

    let remoteMessages;
    try {
      remoteMessages = await responseMessages(response);
    } catch {
      for (const error of transportErrors(requests, response.ok
        ? "Prist MCP returned an invalid response."
        : `Prist MCP request failed with HTTP ${response.status}.`)) writeMessage(error);
      continue;
    }

    if (!response.ok) {
      const errors = remoteMessages.filter((remoteMessage) => hasOwn(remoteMessage, "error"));
      if (errors.length > 0) {
        for (const error of errors) writeMessage(sanitizeErrorMessage(error, connection.credential));
      } else {
        for (const error of transportErrors(requests, `Prist MCP request failed with HTTP ${response.status}.`)) writeMessage(error);
      }
      continue;
    }

    protocolVersion = negotiatedProtocol(outgoing, remoteMessages) ?? protocolVersion;
    for (const remoteMessage of remoteMessages) {
      writeMessage(sanitizeErrorMessage(remoteMessage, connection.credential));
    }
  }
}

try {
  await run(await loadConnection());
} catch (error) {
  const message = error instanceof ConfigurationError
    ? error.message
    : "Prist MCP proxy could not start.";
  writeMessage(jsonRpcError(null, -32_002, message));
  process.exitCode = 1;
}
