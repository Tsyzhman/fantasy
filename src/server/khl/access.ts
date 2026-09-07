/** @spec spec://modules/khl/INFRA-002-khl-storage-and-api#api */
import { apiError } from "@/lib/api-handler";
import { requireApiUser } from "@/lib/auth";
export function khlEnabled() { return process.env.KHL_ENABLED === "true"; }
export async function requireKhlUser(request: Request) {
  if (!khlEnabled()) throw apiError("NOT_FOUND", "КХЛ выключена", 404);
  const auth = await requireApiUser(request);
  if (auth.response) return auth;
  if (!["GET", "HEAD"].includes(request.method)) {
    const origin = request.headers.get("origin");
    // Next may normalize request.url to localhost while retaining the actual Host.
    const expectedHost = request.headers.get("host") ?? new URL(request.url).host;
    let sameHost = false;
    try { sameHost = Boolean(origin && ["http:", "https:"].includes(new URL(origin).protocol) && new URL(origin).host === expectedHost); } catch { /* invalid Origin */ }
    if (!sameHost) throw apiError("FORBIDDEN", "Требуется same-origin запрос", 403);
  }
  return auth;
}
export async function readKhlBody(request: Request): Promise<Record<string, unknown>> {
  if (!request.body) throw apiError("INVALID_INPUT", "Пустое тело", 400);
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 256 * 1024) { await reader.cancel(); throw apiError("INVALID_INPUT", "Тело больше 256 KiB", 413); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  try {
    const body: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error();
    return body as Record<string, unknown>;
  } catch { throw apiError("INVALID_INPUT", "Некорректный JSON", 400); }
}
