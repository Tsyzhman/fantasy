"use client";
import { useEffect, useState } from "react";
import { formatToi, type KhlPlayer, type Observation } from "@/khl/contracts";

const control = "min-h-11 rounded border px-3 py-2";
export function KhlCalendar({ contestId, weekId }: { contestId: string; weekId: string }) {
  const [state, setState] = useState<{ rows: { id: string; match: { startsAt: string; status: string; home: { name: string }; away: { name: string } } }[]; message: string }>({ rows: [], message: "" });
  useEffect(() => {
    if (!weekId) return;
    const abort = new AbortController();
    fetch(`/api/machete/khl/calendar?contestId=${encodeURIComponent(contestId)}&weekId=${encodeURIComponent(weekId)}`, { signal: abort.signal }).then(async r => { const body = await r.json(); if (!r.ok) throw new Error(body.error?.message); return body; }).then(body => setState({ rows: body.data, message: body.data.length ? "" : "Назначения матчей этой неделе ещё не импортированы." })).catch(e => { if (!abort.signal.aborted) setState({ rows: [], message: e.message ?? "Ошибка календаря" }); });
    return () => abort.abort();
  }, [contestId, weekId]);
  return <section aria-label="Матчи недели" className="space-y-2"><p>{!weekId ? "Выберите официальную неделю." : state.message}</p>{state.rows.map(row => <article key={row.id} className="rounded border p-3"><p>{row.match.home.name} — {row.match.away.name}</p><p>{new Date(row.match.startsAt).toLocaleString("ru-RU", { timeZone: "Europe/Moscow" })} МСК · {row.match.status}</p></article>)}</section>;
}

type History = { stats: { id: string; toiSeconds: number | null; ppToiSeconds: number | null; pkToiSeconds: number | null; participationStatus: string; match: { startsAt: string; home: { name: string }; away: { name: string } } }[]; scores: { id: string; points: number | null; source: string; observedAt: string }[]; prices: { id: string; sequence: number; observedAt: string; value: { currentPriceUnits?: number; providerLock?: boolean } }[] };
export function KhlPlayerDetails({ player, onClose }: { player: KhlPlayer; onClose: () => void }) {
  const [tab, setTab] = useState("summary");
  const [history, setHistory] = useState<History | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    const abort = new AbortController();
    fetch(`/api/machete/khl/players/${encodeURIComponent(player.id)}/history?contestId=${encodeURIComponent(player.contestId)}`, { signal: abort.signal }).then(async r => { const body = await r.json(); if (!r.ok) throw new Error(body.error?.message); return body; }).then(body => setHistory(body.data)).catch(e => { if (!abort.signal.aborted) setError(e.message); });
    return () => abort.abort();
  }, [player.id, player.contestId]);
  const fields: [string, Observation<number | string | boolean>][] = [["Цена", player.price], ["Lock", player.providerLock], ["Травма", player.injury], ["TOI", player.toiSeconds], ["PP TOI", player.ppToiSeconds], ["PK TOI", player.pkToiSeconds], ["Официальные FP", player.officialFp], ["EP", player.ep], ["ixG", player.ixg], ["SV", player.saves], ["GA", player.goalsAgainst]];
  return <section aria-label={`Карточка ${player.name}`} className="space-y-3 rounded border bg-white p-4"><div className="flex justify-between gap-2"><h2 className="text-lg font-bold">{player.name} · {player.position}</h2><button className={control} onClick={onClose}>Закрыть карточку</button></div><nav className="flex flex-wrap gap-2" aria-label="Данные игрока">{[["summary", "Показатели"], ["history", "История матчей"], ["prices", "История цены"], ["sources", "Источники"]].map(([id, label]) => <button key={id} aria-pressed={tab === id} className={control} onClick={() => setTab(id)}>{label}</button>)}</nav>
    {tab === "summary" && <dl className="grid grid-cols-2 gap-2">{fields.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value.value === null ? "—" : typeof value.value === "boolean" ? String(value.value) : label.includes("TOI") ? formatToi(Number(value.value)) : value.value}<span className="ml-2 text-xs text-slate-500">{value.quality}</span></dd></div>)}</dl>}
    {tab === "sources" && fields.map(([label, value]) => <p key={label} className="text-sm">{label}: {value.source ?? "Источник не подключён"} · {value.asOf ?? "дата неизвестна"}. {value.reason}</p>)}
    {tab === "history" && <div className="space-y-2">{history?.stats.map(s => <p key={s.id}>{s.match.startsAt.slice(0, 10)} · {s.match.home.name} — {s.match.away.name} · {s.participationStatus} · TOI {formatToi(s.toiSeconds)} / PP {formatToi(s.ppToiSeconds)} / PK {formatToi(s.pkToiSeconds)}</p>)}{history?.scores.map(s => <p key={s.id}>FP {s.points ?? "—"} · {s.source} · {s.observedAt}</p>)}{history && !history.stats.length && !history.scores.length && <p>История матчей не импортирована.</p>}</div>}
    {tab === "prices" && <div>{history?.prices.map(p => <p key={p.id}>{p.observedAt} · {p.value.currentPriceUnits ?? "—"} · версия {p.sequence}</p>)}{history && !history.prices.length && <p>История цены не импортирована.</p>}</div>}
    <p role="status">{error}</p>
  </section>;
}
