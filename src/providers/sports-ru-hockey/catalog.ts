/** @spec spec://modules/khl/INFRA-001-khl-data-ingestion#normalization */
import type { KhlPosition } from "@/khl/contracts";
export interface HockeyCatalogRow { providerPlayerId: string; providerTagId: string | null; name: string; clubId: string; clubName: string; position: KhlPosition; currentPriceUnits: number | null; priceDelta: number | null; providerLock: boolean | null }
const integer = (value: unknown): number | null => typeof value === "number" && Number.isSafeInteger(value) ? value : typeof value === "string" && /^-?\d+$/.test(value) && Number.isSafeInteger(Number(value)) ? Number(value) : null;
export function parseHockeyCatalog(payload: unknown): { rows: HockeyCatalogRow[]; quarantined: { index: number; reason: string }[] } {
  if (payload && typeof payload === "object" && "players" in payload) payload = payload.players;
  if (!Array.isArray(payload) || payload.length === 0 || payload.length > 2000) throw new Error("CATALOG_SCHEMA_DRIFT");
  const rows: HockeyCatalogRow[] = [], quarantined: { index: number; reason: string }[] = [];
  const ids = new Set<string>();
  payload.forEach((raw: unknown, index) => {
    if (!raw || typeof raw !== "object") { quarantined.push({ index, reason: "INVALID_ROW" }); return; }
    const p = raw as Record<string, unknown>;
    const id = integer(p.id), club = integer(p.club_id), amplua = integer(p.amplua);
    const name = typeof p.name === "string" ? p.name.trim() : "";
    const price = integer(p.price);
    if (p.sport_name !== "hockey" || id === null || club === null || !name || !amplua || ![1, 2, 3].includes(amplua) || ids.has(String(id)) || price !== null && price < 0) { quarantined.push({ index, reason: "SPORT_ID_POSITION_NAME_PRICE_OR_DUPLICATE" }); return; }
    ids.add(String(id));
    rows.push({ providerPlayerId: String(id), providerTagId: p.tag_id == null ? null : String(p.tag_id), name, clubId: String(club), clubName: typeof p.club === "string" ? p.club : String(club), position: ({ 1: "G", 2: "D", 3: "F" } as const)[amplua as 1 | 2 | 3], currentPriceUnits: price, priceDelta: integer(p.delta), providerLock: p.lock === true || p.lock === 1 || p.lock === "1" ? true : p.lock === false || p.lock === 0 || p.lock === "0" ? false : null });
  });
  return { rows, quarantined };
}
export async function fetchHockeyCatalog(contestId: string) {
  if (!/^\d{1,12}$/.test(contestId)) throw new Error("INVALID_CONTEST_ID");
  const response = await fetch(`https://www.sports.ru/fantasy/hockey/team/create/${contestId}.json`, { redirect: "error", signal: AbortSignal.timeout(20000), cache: "no-store" });
  if (!response.ok) throw new Error(`SPORTS_RU_HTTP_${response.status}`);
  if (!response.body) throw new Error("EMPTY_RESPONSE");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = []; let size = 0;
  try {
    for (;;) { const { value, done } = await reader.read(); if (done) break; size += value.byteLength; if (size > 20 * 1024 * 1024) { await reader.cancel(); throw new Error("RESPONSE_TOO_LARGE"); } chunks.push(value); }
  } finally { reader.releaseLock(); }
  return parseHockeyCatalog(JSON.parse(Buffer.concat(chunks).toString("utf8")));
}
