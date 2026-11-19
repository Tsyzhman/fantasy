/** @spec spec://modules/agents/FEAT-016-personal-agent-api#transport */
import { ApiError, apiError } from "@/lib/api-handler";
import { requireApiUser } from "@/lib/auth";
import { createLogger } from "@/lib/logger";
import type { AgentActor } from "./contract";
import { authenticateAgentKey } from "./keys";

export const agentBodyLimit = 64 * 1024;
const logger = createLogger("agent-api");

export function agentError(error: unknown): ApiError {
  if (error instanceof ApiError) return error;
  // Causes from a database driver or tool can include caller-supplied values.
  logger.error("Unexpected failure serving a personal agent request.");
  return apiError("INTERNAL_SERVER_ERROR", "Unexpected server error.", 500);
}

function privateApi<Args extends unknown[]>(handler: (...args: Args) => Promise<Response>, bearer: boolean) {
  return async (...args: Args) => {
    let response: Response;
    try {
      response = await handler(...args);
    } catch (cause) {
      const { code, message, status } = agentError(cause);
      response = Response.json({ error: { code, message } }, { status });
    }
    response.headers.set("Cache-Control", "private, no-store");
    if (bearer && response.status === 401) response.headers.set("WWW-Authenticate", 'Bearer realm="Fantasy Scout"');
    return response;
  };
}

function checkOrigin(request: Request, required: boolean) {
  const origin = request.headers.get("origin");
  if (origin === null && !required) return;
  const url = new URL(request.url);
  // Next can use an internal loopback URL behind the production reverse proxy.
  const host = request.headers.get("host") ?? url.host;
  const protocol = request.headers.get("x-forwarded-proto")?.split(",")[0].trim() ?? url.protocol.slice(0, -1);
  if (!["http", "https"].includes(protocol) || origin !== `${protocol}://${host}`) {
    throw apiError("FORBIDDEN_ORIGIN", "A same-origin request is required.", 403);
  }
}

/** @spec spec://modules/agents/FEAT-016-personal-agent-api#keys */
export function withProfileUser<Args extends unknown[]>(handler: (request: Request, userId: string, ...args: Args) => Promise<Response>) {
  return privateApi(async (request: Request, ...args: Args) => {
    const auth = await requireApiUser(request);
    if (auth.response) return auth.response;
    checkOrigin(request, !["GET", "HEAD"].includes(request.method));
    return handler(request, auth.user.id, ...args);
  }, false);
}

/** @spec spec://modules/agents/FEAT-016-personal-agent-api#authorization */
export function withAgentKey<Args extends unknown[]>(handler: (request: Request, actor: AgentActor, ...args: Args) => Promise<Response>) {
  return privateApi(async (request: Request, ...args: Args) => {
    checkOrigin(request, false);
    const actor = await authenticateAgentKey(request);
    return handler(request, actor, ...args);
  }, true);
}

export async function readAgentJson(request: Request, limit = agentBodyLimit): Promise<Record<string, unknown>> {
  const mediaType = request.headers.get("content-type")?.split(";")[0].trim().toLowerCase();
  if (mediaType !== "application/json") throw apiError("UNSUPPORTED_MEDIA_TYPE", "Use application/json.", 415);
  const tooLarge = () => apiError("PAYLOAD_TOO_LARGE", `Request body exceeds ${limit} bytes.`, 413);
  if (Number(request.headers.get("content-length")) > limit) throw tooLarge();
  if (!request.body) throw apiError("INVALID_JSON", "A JSON object is required.", 400);

  const bytes = new Uint8Array(limit);
  const reader = request.body.getReader();
  let size = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      if (size + value.byteLength > limit) {
        void reader.cancel().catch(() => undefined);
        throw tooLarge();
      }
      bytes.set(value, size);
      size += value.byteLength;
    }
  } finally {
    reader.releaseLock();
  }

  let input: unknown;
  try {
    input = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes.subarray(0, size)));
  } catch {
    throw apiError("INVALID_JSON", "Invalid JSON body.", 400);
  }
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    throw apiError("INVALID_ARGUMENTS", "A JSON object is required.", 400);
  }
  return input as Record<string, unknown>;
}
