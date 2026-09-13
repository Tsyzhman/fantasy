"use client";
import { useEffect, useState } from "react";
import { formatToi, type KhlPlayer, type Observation } from "@/khl/contracts";

/** @spec spec://modules/khl/FEAT-002-khl-squad#cards */
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

type History = { stats: { id: string; matchId: string; goals: number | null; assists: number | null; plusMinus: number | null; pimMinutes: number | null; saves: number | null; goalsAgainst: number | null; toiSeconds: number | null; ppToiSeconds: number | null; pkToiSeconds: number | null; attackZoneSeconds: number | null; participationStatus: string; match: { startsAt: string; home: { name: string }; away: { name: string } } }[]; scores: { id: string; matchId: string; points: number | null; source: string; observedAt: string }[]; prices: { id: string; sequence: number; observedAt: string; value: { currentPriceUnits?: number; providerLock?: boolean } }[] };
export function KhlPlayerDetails({ player, onClose }: { player: KhlPlayer; onClose: () => void }) {
  const [tab, setTab] = useState("summary");
  const [history, setHistory] = useState<History | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    const abort = new AbortController();
    fetch(`/api/machete/khl/players/${encodeURIComponent(player.id)}/history?contestId=${encodeURIComponent(player.contestId)}`, { signal: abort.signal }).then(async r => { const body = await r.json(); if (!r.ok) throw new Error(body.error?.message); return body; }).then(body => setHistory(body.data)).catch(e => { if (!abort.signal.aborted) setError(e.message); });
    return () => abort.abort();
  }, [player.id, player.contestId]);
  const fields: [string, Observation<number | string | boolean>][] = [["Цена", player.price], ["Lock", player.providerLock], ["Травма", player.injury], ["TOI", player.toiSeconds], ["PP TOI", player.ppToiSeconds], ["PK TOI", player.pkToiSeconds], ["Время в атаке", player.attackZoneSeconds ?? { value: null, quality: "UNKNOWN", source: null, asOf: null }], ["Официальные FP", player.officialFp], ["EP", player.ep], ["ixG", player.ixg], ["SV", player.saves], ["GA", player.goalsAgainst]];
  return <section aria-label={`Карточка ${player.name}`} className="space-y-3 rounded border bg-white p-4"><div className="flex justify-between gap-2"><h2 className="text-lg font-bold">{player.name} · {player.position}</h2><button className={control} onClick={onClose}>Закрыть карточку</button></div><nav className="flex flex-wrap gap-2" aria-label="Данные игрока">{[["summary", "Показатели"], ["history", "История матчей"], ["prices", "История цены"], ["sources", "Источники"]].map(([id, label]) => <button key={id} aria-pressed={tab === id} className={control} onClick={() => setTab(id)}>{label}</button>)}</nav>
    {tab === "summary" && <dl className="grid grid-cols-2 gap-2">{fields.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value.value === null ? "—" : typeof value.value === "boolean" ? String(value.value) : (label.includes("TOI") || label === "Время в атаке") ? formatToi(Number(value.value)) : value.value}<span className="ml-2 text-xs text-slate-500">{value.quality}</span>{value.totalGames != null && <small className="block text-slate-500">Данные: {value.knownGames ?? 0} из {value.totalGames} матчей</small>}</dd></div>)}</dl>}
    {tab === "summary" && player.seasonStats && <section className="space-y-2 border-t pt-3"><h3 className="font-bold">Сезон: сумма протоколов · {player.seasonStats.games} сыгранных матчей</h3><p className="text-sm">Покрытие указано отдельно для каждого показателя. Неполная сумма не равна итогу всего сезона.</p><dl className="grid grid-cols-2 gap-2">{([["toiSeconds", "На льду"], ["ppToiSeconds", "В большинстве"], ["pkToiSeconds", "В меньшинстве"], ["attackZoneSeconds", "В атаке"], ["goals", "Голы"], ["assists", "Передачи"], ["shotsOnGoal", "Броски в створ"], ["blockedShots", "Блоки"], ["saves", "Сэйвы"], ["goalsAgainst", "Пропущено"]] as const).map(([key, label]) => { const stat = player.seasonStats!.totals[key]; return <div key={key}><dt>{label}</dt><dd>{key.endsWith("Seconds") ? formatToi(stat.value) : stat.value ?? "—"} <small>· {stat.knownGames}/{player.seasonStats!.games} матчей</small></dd></div>; })}</dl></section>}
    {tab === "sources" && fields.map(([label, value]) => <p key={label} className="break-words text-sm">{label}: {value.source ?? "Источник не подключён"} · {value.asOf ?? "дата неизвестна"}. {value.reason}</p>)}
    {tab === "history" && <div className="space-y-2">{history?.stats.map(s => <p key={s.id}>{s.match.startsAt.slice(0, 10)} · {s.match.home.name} — {s.match.away.name} · {s.participationStatus === "DNP" ? "Не играл" : s.participationStatus === "PLAYED" ? "Сыграл" : "Участие неизвестно"} · FP {history.scores.find(score => score.matchId === s.matchId)?.points ?? "—"} · TOI {formatToi(s.toiSeconds)} / PP {formatToi(s.ppToiSeconds)} / PK {formatToi(s.pkToiSeconds)} / Атака {formatToi(s.attackZoneSeconds)} · {player.position === "G" ? `Сэйвы ${s.saves ?? "—"} · Пропущено ${s.goalsAgainst ?? "—"}` : `Г ${s.goals ?? "—"} · П ${s.assists ?? "—"} · +/− ${s.plusMinus ?? "—"} · Штраф ${s.pimMinutes ?? "—"} мин`}</p>)}{history?.scores.map(s => <p key={s.id} className="break-words text-xs text-slate-500">FP {s.points ?? "—"} · {s.source} · {s.observedAt}</p>)}{history && !history.stats.length && !history.scores.length && <p>История матчей не импортирована.</p>}</div>}
    {tab === "prices" && <div>{history?.prices.map(p => <p key={p.id}>{p.observedAt} · {p.value.currentPriceUnits ?? "—"} · версия {p.sequence}</p>)}{history && !history.prices.length && <p>История цены не импортирована.</p>}</div>}
    <p role="status">{error}</p>
  </section>;
}
