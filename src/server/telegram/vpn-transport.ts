import { request } from "node:http";

/**
 * @spec spec://modules/telegram/INFRA-005-deadline-pipeline#delivery
 */
const TELEGRAM_METHOD_PATH = /^\/bot\d{5,}:[A-Za-z0-9_-]{10,}\/(?:sendMessage|setWebhook|deleteWebhook|getMe)$/;
export const TELEGRAM_RELAY_RESPONSE_MAX_BYTES = 64 * 1024;
export const TELEGRAM_RELAY_DEFAULT_TIMEOUT_MS = 20_000;

export function telegramRelaySocketPath(environment: Record<string, string | undefined> = process.env): string | null {
  const value = environment.TELEGRAM_RELAY_SOCKET_PATH?.trim() || environment.FPL_RELAY_SOCKET_PATH?.trim();
  if (!value) return null;
  if (!value.startsWith("/") || value.includes("\0") || value.length > 100) return null;
  return value;
}

export function telegramRelayRequestPath(methodPath: string): string | null {
  return TELEGRAM_METHOD_PATH.test(methodPath) ? `/telegram${methodPath}` : null;
}

/**
 * @spec spec://modules/telegram/INFRA-005-deadline-pipeline#delivery
 */
export async function fetchTelegramViaRelay(
  socketPath: string,
  methodPath: string,
  init: { method?: "GET" | "POST"; body?: string | null; timeoutMs?: number }
): Promise<Response> {
  const relayPath = telegramRelayRequestPath(methodPath);
  if (!relayPath) throw new Error("Telegram relay refused a non-allowlisted bot method path.");
  const method = init.method ?? "POST";
  const body = init.body ?? null;
  const timeoutMs = init.timeoutMs ?? TELEGRAM_RELAY_DEFAULT_TIMEOUT_MS;
  return new Promise<Response>((resolve, reject) => {
    let settled = false;
    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      callback();
    };
    const relayRequest = request(
      {
        socketPath,
        path: relayPath,
        method,
        headers: {
          "content-type": "application/json",
          "content-length": Buffer.byteLength(body ?? ""),
          accept: "application/json"
        }
      },
      (relayResponse) => {
        const chunks: Buffer[] = [];
        let totalBytes = 0;
        relayResponse.on("data", (chunk: Buffer) => {
          totalBytes += chunk.length;
          if (totalBytes > TELEGRAM_RELAY_RESPONSE_MAX_BYTES) {
            relayResponse.destroy(new Error("Telegram relay response exceeded the configured limit."));
            return;
          }
          chunks.push(chunk);
        });
        relayResponse.on("end", () =>
          finish(() => {
            const responseHeaders = new Headers();
            for (const [name, value] of Object.entries(relayResponse.headers)) {
              if (Array.isArray(value)) value.forEach((item) => responseHeaders.append(name, item));
              else if (value !== undefined) responseHeaders.set(name, value);
            }
            const payload = Buffer.concat(chunks);
            resolve(
              new Response(payload.length === 0 ? null : payload, {
                status: relayResponse.statusCode ?? 502,
                statusText: relayResponse.statusMessage,
                headers: responseHeaders
              })
            );
          })
        );
        relayResponse.on("error", (error) => finish(() => reject(error)));
      }
    );
    relayRequest.setTimeout(timeoutMs, () => relayRequest.destroy(new Error("Telegram relay request timed out.")));
    relayRequest.on("error", (error) => finish(() => reject(error)));
    relayRequest.end(body ?? undefined);
  });
}
