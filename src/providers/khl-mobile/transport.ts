import { parseMobileCalendar, type MobileMatch } from "./calendar";

/** Uses the observed descending mobile query; lower bound is enforced locally. */
export async function fetchMobileRange(input: { stageId: string; from: Date; to: Date; signal?: AbortSignal }, fetchSource: typeof fetch = fetch) {
  if (!/^\d{1,12}$/.test(input.stageId) || !Number.isFinite(input.from.getTime()) || !Number.isFinite(input.to.getTime()) || input.to <= input.from || input.to.getTime() - input.from.getTime() > 42 * 86400000) throw new Error("CALENDAR_RANGE_INVALID");
  const matches = new Map<string, MobileMatch>();
  let watermark = Infinity;
  for (let page = 1; page <= 100; page++) {
    const url = new URL("https://khl.api.webcaster.pro/api/khl_mobile/events_v2.json");
    url.searchParams.set("stage_id", input.stageId);
    url.searchParams.set("q[start_at_lt_time_from_unixtime]", String(Math.floor(input.to.getTime() / 1000)));
    url.searchParams.set("order_direction", "desc"); url.searchParams.set("page", String(page));
    const response = await fetchSource(url, { redirect: "error", cache: "no-store", signal: AbortSignal.any([AbortSignal.timeout(20000), ...(input.signal ? [input.signal] : [])]) });
    if (!response.ok) throw new Error(`KHL_MOBILE_HTTP_${response.status}`);
    if (!response.body) throw new Error("EMPTY_RESPONSE");
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = []; let size = 0;
    try { for (;;) { const { done, value } = await reader.read(); if (done) break; size += value.length; if (size > 5 * 1024 * 1024) { await reader.cancel(); throw new Error("RESPONSE_TOO_LARGE"); } chunks.push(value); } } finally { reader.releaseLock(); }
    const rows = parseMobileCalendar(JSON.parse(Buffer.concat(chunks).toString("utf8")), input.stageId);
    if (!rows.length) return { matches: [...matches.values()].sort((a, b) => a.startsAt.localeCompare(b.startsAt)), complete: true };
    for (const row of rows) {
      const time = Date.parse(row.startsAt);
      if (time > watermark) throw new Error("CALENDAR_WATERMARK_INVALID");
      watermark = time;
      // The provider rounds this bound to a date and can include a later game
      // on that date. Keep validating order; enforce the exact bound locally.
      if (time >= input.to.getTime()) continue;
      if (time < input.from.getTime()) return { matches: [...matches.values()].sort((a, b) => a.startsAt.localeCompare(b.startsAt)), complete: true };
      if (matches.has(row.eventId)) throw new Error("CALENDAR_PAGE_DUPLICATE");
      matches.set(row.eventId, row);
      if (matches.size > 2000) throw new Error("CALENDAR_SIZE_LIMIT");
    }
  }
  throw new Error("CALENDAR_PAGE_LIMIT");
}
