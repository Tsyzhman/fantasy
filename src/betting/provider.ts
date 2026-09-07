/** @spec spec://modules/betting/FEAT-001-virtual-league#feed */
import { factorRule, type Selection } from "./domain";
const HOST = "https://line-lb61-w.bk6bba-resources.com";
export type FeedEvent = { id: number; parentId?: number; level: number; sportId: number; kind: number; team1?: string; team2?: string; name?: string; startTime: number; place: string };
export type Feed = { events: FeedEvent[]; sports: { id: number; parentId?: number; name: string; alias?: string }[]; customFactors: { e: number; factors: { f: number; v: number; p?: number; pt?: string; blocked?: boolean }[] }[]; eventBlocks?: { e?: number; id?: number }[] };
type Label = { group: string; label: string };
type Cell = { name?: string; kind?: string; factorId?: number };
let catalog: { at: number; value: Map<number, Label> } | undefined;
export async function fetchFonbet(path: string): Promise<unknown> {
  const res = await fetch(`${HOST}${path}`, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(15000), cache: "no-store" });
  if (!res.ok) throw new Error(`Фонбет: HTTP ${res.status}`);
  const reader = res.body?.getReader(); if(!reader) throw new Error("Фонбет: пустой ответ");
  const chunks: Uint8Array[] = []; let size = 0;
  try { while(true) { const {done,value} = await reader.read(); if(done) break; size+=value.length; if(size>25_000_000) throw new Error("Фонбет: превышен размер ответа"); chunks.push(value); } } finally { await reader.cancel(); }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}
export async function listFeed(): Promise<Feed> { return validateFeed(await fetchFonbet("/ma/events/listBase?lang=ru&scopeMarket=1600")); }
export function validateFeed(v: unknown): Feed {
  if (!v || typeof v !== "object" || !Array.isArray((v as Feed).events) || !Array.isArray((v as Feed).customFactors) || !Array.isArray((v as Feed).sports)) throw new Error("Фонбет: неверная структура линии");
  return v as Feed;
}
export function parseCatalog(payload: unknown) {
  const result = new Map<number, Label>();
  const root = payload as { groups?: { name: string; tables: { name?: string; rows: Cell[][] }[] }[] };
  for (const group of root.groups ?? []) for (const table of group.tables ?? []) {
    const rows = table.rows ?? [], head = rows[0] ?? [];
    for (const row of rows.slice(1)) row.forEach((cell, column) => {
      if(cell.kind !== "value" || !cell.factorId) return;
      const rowName = row.filter(c => c.kind !== "value" && c.kind !== "param" && c.name).map(c => c.name).join(" · ");
      const label = [table.name || head[0]?.name, rowName, head[column]?.name].filter(Boolean).join(" · ");
      if (label && !result.has(cell.factorId)) result.set(cell.factorId, { group: table.name || head[0]?.name || group.name, label });
    });
  }
  return result;
}
async function labels() {
  if(catalog && Date.now()-catalog.at<6*3600000) return catalog.value;
  const value = parseCatalog(await fetchFonbet("/line/factorsCatalog/tables?version=0&lang=ru&sysId=21&scopeMarket=1600"));
  if(value.size<100) throw new Error("Фонбет: каталог исходов неполон");
  catalog = { at: Date.now(), value }; return value;
}
export async function eventSelections(eventId: number) {
  const [feed, names] = await Promise.all([fetchFonbet(`/ma/events/event?eventId=${eventId}&lang=ru&scopeMarket=1600`).then(validateFeed), labels()]);
  return { feed, selections: parseSelections(feed,eventId,names) };
}
export function parseSelections(feed: Feed, rootId: number, names: Map<number,Label>): Selection[] {
  const root = feed.events.find(e => e.id === rootId); if(!root) return [];
  const events = new Map(feed.events.map(e => [e.id,e]));
  const belongs = (event: FeedEvent) => { let e: FeedEvent|undefined=event; for(let i=0;e && i<5;i++){ if(e.id===rootId)return true; e=events.get(e.parentId ?? -1); } return false; };
  const blocked = new Set((feed.eventBlocks ?? []).map(b => b.e ?? b.id));
  const result: Selection[] = [], seen = new Set<string>();
  for(const group of feed.customFactors) {
    const event = events.get(group.e); if(!event || !belongs(event))continue;
    for(const factor of group.factors) {
      const parameter = factor.pt ?? (factor.p === undefined ? "" : String(factor.p/100));
      const key = `${event.id}:${factor.f}:${parameter}`;
      if(seen.has(key))continue; seen.add(key);
      const def = names.get(factor.f);
      const replace = (s: string) => s.replace(/%1/g, root.team1 ?? "Хозяева").replace(/%2/g, root.team2 ?? "Гости").replace(/%P/g,parameter);
      const label = (event.id===rootId ? "" : `${event.name ?? "Период"}: `) + (def ? replace(def.label) + (parameter && !def.label.includes("%P") ? ` (${parameter})` : "") : `Исход Фонбета #${factor.f} (${parameter})`);
      const rule = event.id===rootId && event.kind===1 ? factorRule(factor.f,parameter) : null;
      result.push({ key, eventId:event.id, factorId:factor.f, parameter, label, group: [event.id===rootId ? "Матч" : event.name, def ? replace(def.group) : "Без описания"].filter(Boolean).join(" / "), odds:factor.v, rule, manual:!rule,
        enabled: Boolean(def) && !/%[A-Za-z0-9]/.test(label) && !factor.blocked && !blocked.has(rootId) && !blocked.has(event.id) && event.place==="line" && Number.isFinite(factor.v) && factor.v>1 && factor.v<=1000 });
    }
  }
  return result;
}
