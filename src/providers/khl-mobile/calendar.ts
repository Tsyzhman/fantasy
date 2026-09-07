/** @spec spec://modules/khl/INFRA-001-khl-data-ingestion#normalization */
type Row = Record<string, unknown>;
function record(value: unknown): Row { if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("MOBILE_SCHEMA_DRIFT"); return value as Row; }
function id(value: unknown): string { if ((typeof value !== "number" || !Number.isSafeInteger(value)) && (typeof value !== "string" || !/^\d+$/.test(value))) throw new Error("MOBILE_ID_INVALID"); return String(value); }
export interface MobileMatch {
  eventId: string; officialMatchId: string; stageId: string; officialSeasonId: string;
  startsAt: string; home: { mobileId: string; officialId: string; name: string }; away: { mobileId: string; officialId: string; name: string };
  status: "FINAL" | "SCHEDULED" | "UNKNOWN"; decidedBy: "REGULATION" | "OT" | "SO" | "UNKNOWN";
  score: string | null;
}
export function parseMobileCalendar(payload: unknown, stageId: string): MobileMatch[] {
  if (!Array.isArray(payload)) throw new Error("MOBILE_SCHEMA_DRIFT");
  return payload.map(raw => {
    const e = record(record(raw).event), home = record(e.team_a), away = record(e.team_b), scores = record(e.scores ?? {});
    if (id(e.stage_id) !== stageId || ![18, 24].includes(Number(e.type_id)) || typeof e.start_at !== "number" || e.start_at < 1e12 || !Number.isFinite(e.start_at)) throw new Error("MOBILE_SCOPE_OR_TIME_INVALID");
    const team = (t: Row) => { if (typeof t.name !== "string") throw new Error("MOBILE_TEAM_INVALID"); return { mobileId: id(t.id), officialId: id(t.khl_id), name: t.name }; };
    return { eventId: id(e.id), officialMatchId: id(e.khl_id), stageId, officialSeasonId: id(e.outer_stage_id), startsAt: new Date(e.start_at).toISOString(), home: team(home), away: team(away), status: e.game_state_key === "finished" ? "FINAL" : Number(e.type_id) === 24 ? "SCHEDULED" : "UNKNOWN", decidedBy: e.game_state_key !== "finished" ? "UNKNOWN" : scores.bullitt !== null && scores.bullitt !== undefined ? "SO" : scores.overtime !== null && scores.overtime !== undefined ? "OT" : "REGULATION", score: typeof e.score === "string" ? e.score : null };
  });
}
// Transport is injected: no unapproved recurring requests or guessed pagination endpoint.
export async function collectMobileCalendar(fetchPage: (page: number) => Promise<unknown>, input: { stageId: string; from: number; to: number; maxPages?: number }) {
  if (!Number.isFinite(input.from) || !Number.isFinite(input.to) || input.to <= input.from || input.to - input.from > 42 * 86400000) throw new Error("CALENDAR_RANGE_INVALID");
  const matches = new Map<string, MobileMatch>();
  let lastTime = -Infinity;
  for (let page = 1; page <= Math.min(input.maxPages ?? 100, 100); page++) {
    const rows = parseMobileCalendar(await fetchPage(page), input.stageId);
    if (!rows.length) return { matches: [...matches.values()], complete: true };
    let added = 0;
    for (const row of rows) {
      const time = Date.parse(row.startsAt);
      if (time < input.from || time >= input.to || time < lastTime) throw new Error("CALENDAR_WATERMARK_INVALID");
      lastTime = time;
      if (matches.has(row.eventId)) throw new Error("CALENDAR_PAGE_DUPLICATE");
      matches.set(row.eventId, row); added++;
    }
    if (!added) throw new Error("CALENDAR_PAGINATION_STALLED");
  }
  throw new Error("CALENDAR_PAGE_LIMIT");
}
