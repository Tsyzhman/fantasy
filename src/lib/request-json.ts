export type JsonObjectBody = Record<string, unknown>;

export async function readJsonObject(request: Request): Promise<JsonObjectBody> {
  return (await readJsonObjectOrNull(request)) ?? {};
}

export async function readJsonObjectOrNull(request: Request): Promise<JsonObjectBody | null> {
  const payload = await request.json().catch(() => null);
  return isJsonObject(payload) ? payload : null;
}

function isJsonObject(value: unknown): value is JsonObjectBody {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
