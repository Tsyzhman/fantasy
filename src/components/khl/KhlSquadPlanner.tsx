"use client";
/** @spec spec://modules/khl/FEAT-002-khl-squad#layout */
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { compareNullable, formatToi, formatKhlNumber, historicalTableStats, playerStatFields, unknown, type KhlPlayer, type KhlPosition, type KhlWeek, type KhlSquad, type Observation } from "@/khl/contracts";
import { KHL_RULES, validateRoster } from "@/khl/rules";
import { previewTransfers } from "@/khl/transfers";
import { khlViolationText } from "@/khl/messages";
import { khlCellHelp, khlStatHelp, type KhlHelpKey } from "@/khl/stat-help";
import { KhlCalendar, KhlPlayerDetails } from "./KhlDataPanels";
import { KhlSyncStatusPanel } from "./KhlSyncStatusPanel";
import type { KhlSyncStatus } from "@/khl/sync-status";
import { useKhlOptimizer } from "./useKhlOptimizer";
export type KhlViewPreferences = { position?: KhlPosition | "ALL"; query?: string; club?: string; maximum?: string; compare?: string[]; direction?: 1 | -1; sortField?: "price" | "ep" | "officialFp" | "toiSeconds" | "ppToiSeconds" | "pkToiSeconds" | "attackZoneSeconds" | "ixg" | "saves" | "goalsAgainst" | "goals" | "assists" | "shotsOnGoal" | "pimMinutes" | "plusMinus"; minimumToi?: string };
type Props = { protocolNotice?: string; syncStatus?: KhlSyncStatus; contestId: string; season: string; players: KhlPlayer[]; weeks: KhlWeek[]; initialSquad: KhlSquad | null; initialPreferences?: KhlViewPreferences; tab: "squad" | "players" | "calendar" };
import styles from "./KhlSquadPlanner.module.css";
import { KhlSquadCard } from "./KhlSquadCard";
import { PlatformTransferTrendsPanel } from "@/components/machete/PlatformTransferTrendsPanel";
const control = styles.control;
/** @spec spec://modules/khl/FEAT-002-khl-squad#cards */
function KhlTimeStat({ value, games }: { value: Observation<number> | undefined; games: number }) {
  return <><span>{formatToi(value?.value ?? null)}</span><small className={styles.coverage} title="Матчи с известным значением / сыгранные матчи">{value?.knownGames ?? 0}/{value?.totalGames ?? games} матчей</small></>;
}
export function KhlSquadPlanner({ contestId, season, players: initialPlayers, weeks, initialSquad, protocolNotice, syncStatus, initialPreferences: preferences = {}, tab }: Props) {
  const [loadedPlayers, setLoadedPlayers] = useState<{ source: KhlPlayer[]; historyWindow: number; players: KhlPlayer[] } | null>(null);
  const [statPeriod, setStatPeriod] = useState<"season" | "recent" | "previous">("season");
  const [rolling, setRolling] = useState(true);
  const [historyWindow, setHistoryWindow] = useState<5 | 10 | 20>(10);
  const [refreshRevision, setRefreshRevision] = useState(0);
  const [pendingStats, setPendingStats] = useState<{ source: KhlPlayer[]; historyWindow: number; refreshRevision: number } | null>(null);
  const statsBusy = pendingStats?.source === initialPlayers && pendingStats.historyWindow === historyWindow && pendingStats.refreshRevision === refreshRevision;
  const sourcePlayers = loadedPlayers?.source === initialPlayers && loadedPlayers.historyWindow === historyWindow ? loadedPlayers.players : initialPlayers;
  const [activeTab, setActiveTab] = useState(tab);
  const [entries, setEntries] = useState(initialSquad?.entries ?? []);
  const [saved, setSaved] = useState(initialSquad);
  const [name, setName] = useState(initialSquad?.name ?? "Мой вариант КХЛ");
  const [bank, setBank] = useState<number | null>(initialSquad?.bankUnits ?? null);
  const [position, setPosition] = useState<KhlPosition | "ALL">(preferences.position ?? "ALL");
  const [query, setQuery] = useState(preferences.query ?? "");
  const [club, setClub] = useState(preferences.club ?? "");
  const [maximum, setMaximum] = useState(preferences.maximum ?? "");
  const [weekId, setWeekId] = useState(weeks[0]?.id ?? "");
  const [horizonWeeks, setHorizonWeeks] = useState(1);
  const [compare, setCompare] = useState<string[]>(preferences.compare ?? []);
  const [message, setMessage] = useState("");
  const [statsMessage, setStatsMessage] = useState("");
  const [exporting, setExporting] = useState(false);
  const [exportMessage, setExportMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [importing, setImporting] = useState(false);
  const [profileRequired, setProfileRequired] = useState(false);
  const [capital, setCapital] = useState(initialSquad?.capitalUnits ?? 20000);
  const [outId, setOutId] = useState("");
  const [inId, setInId] = useState("");
  const [page, setPage] = useState(0);
  const [direction, setDirection] = useState<1 | -1>(preferences.direction ?? -1);
  const [sortField, setSortField] = useState<NonNullable<KhlViewPreferences["sortField"]>>(preferences.sortField ?? "ep");
  const [minimumToi, setMinimumToi] = useState(preferences.minimumToi ?? "");
  const periodLabel = statPeriod === "previous" ? "Прошлый сезон · сумма" : statPeriod === "season" ? "Текущий сезон · сумма" : `Последние ${historyWindow} матчей · среднее`;
  const cellHelp = (player: KhlPlayer, key: KhlHelpKey) => khlCellHelp(player, key,
    key === "ep" ? rolling ? "Ближайшие 7 дней" : `Выбранные fantasy-недели: ${horizonWeeks}`
      : key === "officialFp" ? `Последние ${historyWindow} матчей с официальной оценкой · среднее FP`
      : key === "ixg" ? `Последние ${historyWindow} известных матчей · среднее ixG`
      : key === "price" ? "Текущая цена" : periodLabel);
  const players = useMemo(() => sourcePlayers.map(original => {
    const p = { ...original };
    const stats = statPeriod === "previous" ? p.previousSeasonStats && historicalTableStats(p.previousSeasonStats) : p.seasonStats;
    if (statPeriod !== "recent") for (const field of playerStatFields) {
      const total = stats?.totals[field];
      const archive = p.previousSeasonStats;
      const pastSource = archive?.protocolStats && total === archive.protocolStats.totals[field] ? archive.protocolStats.source : archive?.source;
      p[field] = { value: total?.value ?? null, quality: total?.value == null ? "UNKNOWN" : "FACT", source: statPeriod === "previous" ? pastSource ?? null : "Протоколы матчей", asOf: stats?.asOf ?? null, knownGames: total?.knownGames ?? 0, totalGames: stats?.games ?? 0, reason: `Сумма ${statPeriod === "previous" ? "прошлого" : "текущего"} сезона: ${total?.knownGames ?? 0} из ${stats?.games ?? 0} матчей` };
    }
    if (rolling) return { ...p, fixtures: p.fixtures.filter(f => p.forecastHorizonEnd && f.startsAt < p.forecastHorizonEnd) };
    const ordered = [...weeks].sort((a, b) => (a.startsAt ?? "").localeCompare(b.startsAt ?? ""));
    const start = ordered.findIndex(w => w.id === weekId);
    const horizon = ordered.slice(start, start + horizonWeeks);
    const fixtures = p.fixtures.filter(f => horizon.some(w => w.id === f.weekId));
    const scheduled = fixtures.filter(f => f.status === "SCHEDULED");
    const complete = horizon.length === horizonWeeks && horizon.every(w => w.verified) && scheduled.length > 0 && scheduled.every(f => f.expectedPoints?.value != null);
    return { ...p, fixtures, ep: complete ? { ...scheduled[0].expectedPoints!, value: scheduled.reduce((n, f) => n + f.expectedPoints!.value!, 0) } : unknown<number>("Нет полного прогноза выбранной недели") };
  }), [sourcePlayers, weekId, weeks, horizonWeeks, rolling, statPeriod]);
  const [detailId, setDetailId] = useState<string | null>(null);
  const optimizer = useKhlOptimizer();
  useEffect(() => {
    if (historyWindow === 10 && refreshRevision === 0) return;
    const abort = new AbortController();
    async function refresh() {
      setPendingStats({ source: initialPlayers, historyWindow, refreshRevision });
      const pool: KhlPlayer[] = []; let cursor: string | null = null, revision: number | null = null;
      for (let page = 0; page < 10; page++) {
        const params = new URLSearchParams({ contestId, limit: "100", historyWindow: String(historyWindow) });
        if (cursor) params.set("cursor", cursor);
        const r = await fetch(`/api/machete/khl/players?${params}`, { signal: abort.signal, cache: "no-store" });
        const result = await r.json(); if (abort.signal.aborted) return; if (!r.ok) throw new Error(result.error?.message ?? "Ошибка загрузки игроков");
        if (revision !== null && revision !== result.data.poolRevision) throw new Error("Каталог изменился во время загрузки. Повторите выбор окна.");
        revision = result.data.poolRevision; pool.push(...result.data.players); cursor = result.data.nextCursor;
        if (!cursor) { setLoadedPlayers({ source: initialPlayers, historyWindow, players: pool }); setStatsMessage("Статистика обновлена."); return; }
      }
      throw new Error("Каталог превышает 1000 игроков");
    }
    void refresh().catch(e => { if (!abort.signal.aborted) setStatsMessage(e.message); }).finally(() => { if (!abort.signal.aborted) setPendingStats(null); });
    return () => abort.abort();
  }, [contestId, historyWindow, initialPlayers, refreshRevision]);
  async function exportPlayers() {
    setExporting(true); setExportMessage("");
    try {
      const params = new URLSearchParams({ contestId, historyWindow: String(historyWindow) });
      const result = await fetch(`/api/machete/khl/players-export?${params}`, { cache: "no-store" });
      if (!result.ok) throw new Error((await result.json()).error?.message ?? "Не удалось выгрузить игроков");
      const url = URL.createObjectURL(await result.blob());
      const anchor = document.createElement("a");
      anchor.href = url; anchor.download = `khl-all-players-${season.replace(/[^0-9-]/g, "-")}.xlsx`;
      document.body.appendChild(anchor); anchor.click(); anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setExportMessage(`Excel готов: ${result.headers.get("X-Export-Row-Count") ?? "все"} игроков, 7 листов.`);
    } catch (error) { setExportMessage(error instanceof Error ? error.message : "Ошибка выгрузки"); }
    finally { setExporting(false); }
  }
  async function savePreferences() {
    try {
      const r = await fetch("/api/machete/khl/preferences", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ contestId, schemaVersion: 1, preferences: { position, club, query, maximum, direction, compare, sortField, minimumToi } }) });
      if (!r.ok) throw new Error("Не удалось сохранить настройки");
      setMessage("Фильтры и сравнение сохранены для этого турнира.");
    } catch (e) { setMessage(e instanceof Error ? e.message : "Ошибка настроек"); }
  }
  const selected = entries.map(e => players.find(p => p.id === e.id)).filter((p): p is KhlPlayer => Boolean(p));
  const value = selected.some(p => p.price.value === null) ? null : selected.reduce((n, p) => n + p.price.value!, 0);
  const filtered = useMemo(() => players.filter(p => (position === "ALL" || p.position === position) && (!club || p.clubId === club) && p.name.toLocaleLowerCase().includes(query.toLocaleLowerCase()) && (!maximum || p.price.value !== null && p.price.value <= Number(maximum)) && (!minimumToi || p.toiSeconds.value !== null && p.toiSeconds.value >= Number(minimumToi) * 60)).sort((a, b) => compareNullable(a[sortField]?.value ?? null, b[sortField]?.value ?? null, direction)
    || (sortField === "ep" && a.ep.value === null && b.ep.value === null ? compareNullable(a.toiSeconds.value, b.toiSeconds.value, -1) : 0)
    || a.id.localeCompare(b.id)), [players, position, club, query, maximum, direction, sortField, minimumToi]);
  const week = weeks.find(w => w.id === weekId);
  function toggle(p: KhlPlayer) {
    if (importing) return;
    optimizer.cancel();
    if (!entries.some(e => e.id === p.id) && selected.filter(player => player.position === p.position).length >= KHL_RULES.positions[p.position]) {
      setMessage(`Все места ${p.position} уже заняты. Сначала уберите игрока этой позиции.`); return;
    }
    setEntries(current => current.some(e => e.id === p.id) ? current.filter(e => e.id !== p.id) : current.length < 17 ? [...current, { id: p.id, keepForOptimizer: false }] : current);
  }
  function move(id: string, delta: number) {
    if (importing) return;
    optimizer.cancel();
    const from = entries.findIndex(e => e.id === id);
    const pos = players.find(p => p.id === id)?.position;
    const peers = entries.map((e, i) => ({ e, i })).filter(({ e }) => players.find(p => p.id === e.id)?.position === pos);
    const target = peers[peers.findIndex(({ i }) => i === from) + delta]?.i;
    if (target === undefined) return;
    const next = [...entries]; [next[from], next[target]] = [next[target], next[from]]; setEntries(next);
  }
  function sortBy(field: NonNullable<KhlViewPreferences["sortField"]>) {
    setSortField(field); setDirection(sortField === field ? (direction === 1 ? -1 : 1) : field === "price" ? 1 : -1); setPage(0);
  }
  async function importSports() {
    optimizer.cancel(); setImporting(true); setProfileRequired(false); setMessage("Загружается текущий состав Sports…");
    try {
      const response = await fetch("/api/machete/khl/squads/import-sports-ru", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ contestId, squadId: saved?.id, expectedVersion: saved?.revision }) });
      const payload = await response.json();
      if (!response.ok) { setProfileRequired(payload.error?.code === "SPORTS_PROFILE_REQUIRED"); throw new Error(payload.error?.message ?? "Не удалось импортировать состав Sports"); }
      const squad: KhlSquad = payload.data.squad;
      setSaved(squad); setEntries(squad.entries); setBank(squad.bankUnits); setName(squad.name); setCapital(squad.capitalUnits ?? 20000);
      const url = new URL(window.location.href); url.searchParams.set("squadId", squad.id); url.searchParams.delete("new"); window.history.replaceState(null, "", url);
      setRefreshRevision(n => n + 1); setMessage(`Состав Sports загружен и сохранён: ${squad.entries.length}/17 игроков.`);
      window.dispatchEvent(new CustomEvent("machete:squad-saved"));
    } catch (error) { setMessage(error instanceof Error ? error.message : "Ошибка импорта Sports"); }
    finally { setImporting(false); }
  }
  async function save() {
    setBusy(true);
    try {
      const result = await fetch(`/api/machete/khl/squads${saved ? `/${saved.id}` : ""}`, { method: saved ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ contestId, name, expectedVersion: saved?.revision, entries, bankUnits: bank, mode: "DRAFT" }) });
      const data = await result.json();
      if (!result.ok) throw new Error(data.error?.message ?? "Ошибка сохранения");
      setSaved({ ...data.data, capitalUnits: capital });
      const url = new URL(window.location.href); url.searchParams.set("squadId", data.data.id); window.history.replaceState(null, "", url);
      setMessage("Локальный вариант сохранён. На Sports.ru трансферы не выполнены.");
      window.dispatchEvent(new CustomEvent("machete:squad-saved"));
    } catch (error) { setMessage(error instanceof Error ? error.message : "Ошибка сохранения"); }
    finally { setBusy(false); }
  }
  async function scenario(now: number) {
    optimizer.cancel();
    if (saved) {
      if (JSON.stringify(saved.entries) !== JSON.stringify(entries) || saved.bankUnits !== bank) { setMessage("Сначала сохраните изменения черновика."); return; }
      setBusy(true);
      try {
        const endpoint = `/api/machete/khl/squads/${saved.id}`;
        const previewResponse = await fetch(`${endpoint}/transfer-preview`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ contestId, weekId, expectedVersion: saved.revision, steps: [{ out: outId, in: inId }] }) });
        const previewBody = await previewResponse.json(); if (!previewResponse.ok) throw new Error(previewBody.error?.message ?? "Ошибка preview");
        const quote = previewBody.data;
        const applied = await fetch(`${endpoint}/transfer-plans`, { method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": crypto.randomUUID() }, body: JSON.stringify({ contestId, quoteHash: quote.quoteHash, expectedVersion: saved.revision }) });
        const appliedBody = await applied.json(); if (!applied.ok) throw new Error(appliedBody.error?.message ?? "Ошибка сохранения сценария");
        const result = appliedBody.data.result;
        setEntries(result.entries); setBank(result.bankUnits); setSaved({ ...saved, entries: result.entries, bankUnits: result.bankUnits, revision: saved.revision + 1 });
        window.dispatchEvent(new CustomEvent("machete:squad-saved"));
        setMessage(`Локальный сценарий сохранён. Изменение EP: ${formatKhlNumber(result.ep?.gain)}. ${result.violations.map(khlViolationText).join(", ")}. Внешние трансферы не выполнены.`);
      } catch (e) { setMessage(e instanceof Error ? e.message : "Ошибка сценария"); } finally { setBusy(false); }
      return;
    }
    const result = previewTransfers({ selected, pool: players, bank, used: null, preSeason: false, steps: [{ out: outId, in: inId }], now });
    const structural = result.violations.filter(v => !["UNKNOWN_TRANSFER_BALANCE", "LOCK_UNKNOWN_OR_STALE", "PRICE_UNKNOWN_OR_STALE", "PROVIDER_LOCK", "MATCH_LOCK"].includes(v));
    if (structural.length) { setMessage(structural.map(khlViolationText).join(", ")); return; }
    setEntries(result.players.map(p => ({ id: p.id, keepForOptimizer: entries.find(e => e.id === p.id)?.keepForOptimizer ?? false })));
    setBank(result.bank); setMessage(`Условный локальный сценарий: ${result.violations.map(khlViolationText).join(", ") || "требуется проверка внешнего состояния"}. Остаток трансферов Sports.ru не изменён.`);
  }
  return <section className={`${styles.planner} min-w-0 space-y-4 py-5`}>
    <p className="text-sm font-semibold">{(["G", "D", "F"] as const).map(pos => `${pos} ${selected.filter(p => p.position === pos).length}/${KHL_RULES.positions[pos]}`).join(" · ")}</p>
    <div className="flex flex-wrap items-center gap-3"><h1 className="text-2xl font-bold">Fantasy КХЛ · {season}</h1><span className={styles.notice}>Источники подключены частично</span><button className={control} disabled={statsBusy} onClick={() => { optimizer.cancel(); setRefreshRevision(n => n + 1); }}>Обновить статистику</button><span role="status">{statsBusy ? "Загружаются свежие показатели…" : statsMessage}</span></div>
    <nav aria-label="Разделы КХЛ" className={styles.tabs}>{([["squad", "Состав"], ["players", "Игроки"], ["calendar", "Календарь"]] as const).map(([key, label]) => <Link className={control} aria-current={activeTab === key ? "page" : undefined} key={key} href={`/machete/khl/${key}?contestId=${encodeURIComponent(contestId)}${saved ? `&squadId=${saved.id}` : ""}`} onClick={event => { event.preventDefault(); optimizer.cancel(); setActiveTab(key); setRefreshRevision(n => n + 1); const url = new URL(window.location.href); url.pathname = `/machete/khl/${key}`; window.history.replaceState(null, "", url); }}>{label}</Link>)}</nav>
    {syncStatus && <KhlSyncStatusPanel contestId={contestId} initialStatus={syncStatus}/>}
    {/* @spec spec://modules/machete/FEAT-008-platform-transfer-trends#ui */}
    {activeTab === "squad" && <PlatformTransferTrendsPanel contestId={contestId} module="khl" />}
    {protocolNotice && <p role="status" className={styles.notice}>{protocolNotice}</p>}
    <p className={styles.notice}>{players.some(p => p.ep.value !== null) ? "Доступен опубликованный EP. Модель и качество указаны в источниках карточки; beta-прогноз не подтверждает готовность xG-модели." : "Прогноз выбранного периода пока не готов."} Неизвестное обозначено «—». Внешнее выполнение трансферов отсутствует.</p>
    <label className="block">Период прогноза <select className={control} value={rolling ? "rolling" : "week"} onChange={e => { optimizer.cancel(); setRolling(e.target.value === "rolling"); }}><option value="rolling">Ближайшие 7 дней · оценка</option><option value="week">Официальная фэнтези-неделя</option></select></label>
    {(!rolling || activeTab === "calendar") && <label className="block">Официальная неделя <select className={control} value={weekId} onChange={e => { optimizer.cancel(); setWeekId(e.target.value); }}>{!weeks.length && <option value="">Календарь не импортирован</option>}{weeks.map(w => <option key={w.id} value={w.id}>{w.label}</option>)}</select></label>}
    {(!rolling || activeTab === "calendar") && week && <p className="text-sm">{week.verified ? `${week.startsAt} — ${week.endsAt}` : "Точное время границ недели не подтверждено. Автоматического сброса по понедельникам нет."}</p>}
    {activeTab === "calendar" ? <KhlCalendar key={weekId} contestId={contestId} weekId={weekId}/> : <div className={activeTab === "squad" ? styles.workspace : styles.catalog}>
    {activeTab === "squad" && <div className={styles.roster}>
      <Link className={control} href={`/machete/khl/squad?contestId=${encodeURIComponent(contestId)}&new=1`}>Новый вариант</Link>
      <label className="block">Название варианта <input aria-label="Название варианта" className={`${control} max-w-full`} disabled={importing} value={name} maxLength={128} onChange={e => setName(e.target.value)}/></label>
      <div className={styles.summary}><p>Выбрано<br/><strong>{selected.length}/17</strong></p><p>Стоимость<br/><strong>{value ?? "—"}</strong> / {capital.toLocaleString("ru-RU")}</p><label>Банк локального варианта<input aria-label="Банк локального варианта" disabled={importing} className={control} type="number" min="0" value={bank ?? ""} placeholder="Неизвестно" onChange={e => { optimizer.cancel(); setBank(e.target.value === "" ? null : Number(e.target.value)); }}/></label><p>Начальный бюджет: 20 000</p><p>Официальный остаток трансферов: неизвестно</p></div>
      <div className="flex flex-wrap gap-2"><button className={`${control} ${styles.primary}`} disabled={busy || importing || optimizer.running} onClick={save}>Сохранить план</button><button className={control} disabled={busy || importing} onClick={importSports}>{importing ? "Загружается состав Sports…" : "Импортировать состав Sports"}</button><button className={control} disabled={importing || optimizer.running} onClick={() => {
        if (!saved || JSON.stringify(saved.entries) !== JSON.stringify(entries) || saved.bankUnits !== bank) { setMessage("Сохраните изменения перед подбором."); return; }
        void optimizer.run(contestId, weekId, saved, (next, nextBank) => { setEntries(next); setBank(nextBank); }, setMessage, horizonWeeks);
      }}>Подобрать состав</button>{optimizer.running && <button className={control} onClick={optimizer.cancel}>Отменить подбор</button>}</div>
      <h2 className="text-sm font-semibold uppercase tracking-wide">Ваш состав</h2>
      <div className={styles.rink} aria-label="Хоккейный состав, все 17 активны">
        {(["G", "D", "F"] as const).map(pos => <section key={pos} className={styles.group}>
          <h2>{({ G: "Вратари", D: "Защитники", F: "Нападающие" })[pos]} · {selected.filter(p => p.position === pos).length}/{KHL_RULES.positions[pos]}</h2>
          <div className={`${styles.slots} ${pos === "G" ? styles.goalies : ""}`}>{Array.from({ length: KHL_RULES.positions[pos] }, (_, index) => {
            const p = selected.filter(p => p.position === pos)[index];
            return p ? <KhlSquadCard key={p.id} player={p} keep={entries.find(e => e.id === p.id)?.keepForOptimizer ?? false}
              disabled={importing} onKeep={keep => { optimizer.cancel(); setEntries(entries.map(item => item.id === p.id ? { ...item, keepForOptimizer: keep } : item)); }}
              onMove={delta => move(p.id, delta)} onRemove={() => toggle(p)} onDetails={() => { setDetailId(p.id); document.getElementById("khl-player-details")?.scrollIntoView({ behavior: "smooth", block: "start" }); }}/>
              : <button type="button" key={`${pos}-${index}`} className={styles.empty} disabled={importing} onClick={() => { setPosition(pos); setPage(0); document.getElementById("khl-player-search")?.focus(); }}><span aria-hidden="true">+</span><span>{pos} · свободное место {index + 1}</span></button>;
          })}</div>
        </section>)}
      </div><p className="text-xs text-slate-500">Все 17 активны. Расположение не влияет на очки и не означает клубные звенья.</p>
      <details className="rounded border p-3"><summary className="min-h-11 cursor-pointer">Локальный трансферный сценарий</summary><div className="flex flex-wrap gap-2"><select aria-label="Продать" className={`${control} max-w-full`} value={outId} onChange={e => setOutId(e.target.value)}><option value="">Продать</option>{selected.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select><select aria-label="Купить" className={`${control} max-w-full`} value={inId} onChange={e => setInId(e.target.value)}><option value="">Купить</option>{players.filter(p => !entries.some(e => e.id === p.id)).map(p => <option key={p.id} value={p.id}>{p.name} · {p.position} · {formatKhlNumber(p.price.value)}</option>)}</select><button className={control} disabled={!outId || !inId} onClick={event => scenario(performance.timeOrigin + event.timeStamp)}>Применить к черновику</button></div></details>
      <p className="text-sm text-amber-800">{validateRoster(selected, capital).map(khlViolationText).join(" · ")}</p>
    </div>}
    <div className={styles.catalog}><div className="flex flex-wrap items-center gap-3"><h2 className="text-sm font-semibold uppercase tracking-wide">Подбор игроков</h2><button className={control} disabled={exporting} onClick={exportPlayers} title="Весь каталог турнира: все страницы и клубы, независимо от фильтров. Текущий и прошлый сезон, средние, прогнозы и справка.">{exporting ? "Готовлю Excel…" : "Excel · все игроки"}</button><span role="status" className="text-sm">{exportMessage}</span></div>
    <div className="flex flex-wrap gap-2"><input id="khl-player-search" aria-label="Поиск игрока" className={`${control} min-w-0 max-w-full`} value={query} onChange={e => { setQuery(e.target.value); setPage(0); }} placeholder="Поиск игрока"/><select aria-label="Позиция" className={control} value={position} onChange={e => { setPosition(e.target.value as KhlPosition | "ALL"); setPage(0); }}>{["ALL", "G", "D", "F"].map(p => <option key={p}>{p}</option>)}</select><select aria-label="Клуб" className={`${control} max-w-full`} value={club} onChange={e => { setClub(e.target.value); setPage(0); }}><option value="">Все клубы</option>{[...new Map(players.map(p => [p.clubId, p.clubName])).entries()].map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select><input aria-label="Максимальная цена" className={`${control} w-40`} type="number" value={maximum} placeholder="Цена до" onChange={e => { setMaximum(e.target.value); setPage(0); }}/></div>
    <div className={styles.tableScroll}><table className="w-full text-left text-sm"><caption className="p-3 text-left">Каталог · {filtered.length} игроков · {statPeriod === "previous" ? "прошлый сезон · суммы" : statPeriod === "season" ? "текущий сезон · суммы" : "средние по известным матчам"}. EP — ближайшие матчи; FP — среднее текущих официальных очков.</caption><thead><tr>
      {([["player", "Игрок"], ["club", "Клуб / позиция"], ["selection", "Выбор"], ["compare", "Сравнить"]] as const).map(([key, h]) => <th key={key} scope="col" title={khlStatHelp[key]}>{h}</th>)}
      {([["price", "Цена"], ["toiSeconds", "TOI"], ["ppToiSeconds", "PP"], ["pkToiSeconds", "PK"], ["attackZoneSeconds", "Атака"], ["officialFp", "FP"], ["ep", "EP"], ["ixg", "ixG"], ["shotsOnGoal", "Броски"], ["goals", "Голы"], ["assists", "Передачи"], ["pimMinutes", "Штраф, мин"], ["plusMinus", "+/−"]] as const).map(([field, label]) => <th key={field} scope="col" title={khlStatHelp[field]} aria-sort={sortField === field ? direction === 1 ? "ascending" : "descending" : "none"}><button className={styles.sortButton} aria-label={`Сортировать: ${label}`} onClick={() => sortBy(field)}>{label} <span aria-hidden="true">{sortField === field ? direction === 1 ? "↑" : "↓" : "↕"}</span></button></th>)}
    </tr></thead><tbody>{filtered.slice(page * 50, (page + 1) * 50).map(p => <tr key={p.id}>
      <td className="font-medium" title={cellHelp(p, "player")}>{p.name}</td><td title={cellHelp(p, "club")}>{p.clubName} / {p.position}</td><td title={cellHelp(p, "selection")}><button className={control} disabled={importing} onClick={() => toggle(p)}>{entries.some(e => e.id === p.id) ? "Убрать" : "Выбрать"}</button></td><td title={cellHelp(p, "compare")}><input aria-label={`Сравнить ${p.name}`} type="checkbox" checked={compare.includes(p.id)} disabled={!compare.includes(p.id) && compare.length >= 4} onChange={() => setCompare(compare.includes(p.id) ? compare.filter(id => id !== p.id) : [...compare, p.id])}/></td><td title={cellHelp(p, "price")}>{formatKhlNumber(p.price.value)}</td>
      {(["toiSeconds", "ppToiSeconds", "pkToiSeconds", "attackZoneSeconds"] as const).map(field => <td className={styles.timeCell} key={field} title={cellHelp(p, field)}><KhlTimeStat value={p[field]} games={p.seasonStats?.games ?? 0}/></td>)}
      <td title={cellHelp(p, "officialFp")}>{formatKhlNumber(p.officialFp.value)}</td><td title={cellHelp(p, "ep")}><button className="min-h-11 min-w-11 underline decoration-dotted underline-offset-4" aria-label={`Разобрать прогноз: ${p.name}`} onClick={() => { setDetailId(p.id); requestAnimationFrame(() => document.getElementById("khl-player-details")?.scrollIntoView({ behavior: "smooth", block: "start" })); }}>{formatKhlNumber(p.ep.value)}</button></td><td title={cellHelp(p, "ixg")}>{formatKhlNumber(p.ixg.value)}</td>
      {(["shotsOnGoal", "goals", "assists", "pimMinutes", "plusMinus"] as const).map(field => <td className={styles.timeCell} key={field} title={cellHelp(p, field)}><span>{formatKhlNumber(p[field]?.value)}</span><small className={styles.coverage}>{p[field]?.knownGames ?? 0}/{p[field]?.totalGames ?? 0} матчей</small></td>)}
    </tr>)}</tbody></table></div>
    <details className="rounded border p-3"><summary className="min-h-11 cursor-pointer">Справка показателей</summary><dl className="space-y-3 text-sm">{Object.entries(khlStatHelp).map(([key, help]) => <div key={key}><dt className="font-semibold">{({player:'Игрок',club:'Клуб / позиция',selection:'Выбор',compare:'Сравнение',price:'Цена',toiSeconds:'TOI',ppToiSeconds:'PP',pkToiSeconds:'PK',attackZoneSeconds:'Атака',officialFp:'FP',ep:'EP',ixg:'ixG',shotsOnGoal:'Броски',goals:'Голы',assists:'Передачи',pimMinutes:'Штрафные минуты',plusMinus:'Плюс-минус',blockedShots:'Блоки',saves:'Сэйвы',goalsAgainst:'Пропущено'} as Record<string,string>)[key]}</dt><dd>{help}</dd></div>)}</dl></details>
    <div className="flex gap-2"><button className={control} disabled={!page} onClick={() => setPage(page - 1)}>Назад</button><button className={control} disabled={(page + 1) * 50 >= filtered.length} onClick={() => setPage(page + 1)}>Далее</button></div>
    <label className="block">Период статистики <select className={control} value={statPeriod} onChange={e => { setStatPeriod(e.target.value as typeof statPeriod); setPage(0); }}><option value="season">Текущий сезон · сумма протоколов</option><option value="recent">Последние матчи · среднее</option><option value="previous">Прошлый сезон · КХЛ и Sports</option></select></label>
    {statPeriod === "previous" && <p className="text-sm">Архив доступен у {players.filter(p => p.previousSeasonStats?.games).length} из {players.length} игроков. У новичков лиги прошлый сезон КХЛ может отсутствовать. Броски и подробное время показаны только при наличии в источнике.</p>}
    <label className="block">История для средних <select className={control} value={historyWindow} onChange={e => setHistoryWindow(Number(e.target.value) as 5 | 10 | 20)}>{[5, 10, 20].map(n => <option key={n} value={n}>{n} матчей</option>)}</select></label>
    {!rolling && <label className="block">Горизонт EP <select className={control} value={horizonWeeks} onChange={e => { optimizer.cancel(); setHorizonWeeks(Number(e.target.value)); }}>{[1, 2, 3, 4].map(n => <option key={n} value={n}>{n} нед.</option>)}</select></label>}
    <div className="flex flex-wrap gap-2"><select aria-label="Профиль таблицы" className={control} value="" onChange={e => { const pos = e.target.value as KhlPosition; setPosition(pos); setSortField(pos === "G" ? "saves" : pos === "D" ? "toiSeconds" : "ixg"); setDirection(-1); setPage(0); }}><option value="">Профиль G / D / F</option><option value="G">G · сэйвы</option><option value="D">D · игровое время</option><option value="F">F · готовый ixG</option></select><select aria-label="Сортировать по" className={control} value={sortField} onChange={e => { setSortField(e.target.value as typeof sortField); setPage(0); }}>{[["price", "Цена"], ["ep", "EP"], ["officialFp", "FP"], ["toiSeconds", "TOI"], ["ppToiSeconds", "PP TOI"], ["pkToiSeconds", "PK TOI"], ["attackZoneSeconds", "Атака"], ["ixg", "ixG"], ["shotsOnGoal", "Броски"], ["goals", "Голы"], ["assists", "Передачи"], ["pimMinutes", "Штраф, мин"], ["plusMinus", "+/−"], ["saves", "SV"], ["goalsAgainst", "GA"]].map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select><input aria-label="Минимальный TOI в минутах" className={`${control} w-44`} type="number" min="0" value={minimumToi} placeholder="TOI от, минуты" onChange={e => { setMinimumToi(e.target.value); setPage(0); }}/></div>
    <div className="flex flex-wrap gap-2"><button className={control} onClick={savePreferences}>Сохранить настройки вида</button><select aria-label="Открыть карточку игрока" className={`${control} max-w-full`} value={detailId ?? ""} onChange={e => setDetailId(e.target.value || null)}><option value="">Карточка и история игрока</option>{filtered.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></div>
    <div id="khl-player-details">{detailId && players.some(p => p.id === detailId) && <KhlPlayerDetails period={rolling ? "Ближайшие 7 дней" : `Выбранные недели: ${horizonWeeks}`} key={detailId} player={players.find(p => p.id === detailId)!} onClose={() => setDetailId(null)}/>}</div>
    {compare.length >= 2 && <section className="rounded border p-4"><h2 className="font-bold">Сравнение · выбранный период</h2><div className="grid gap-3 sm:grid-cols-2">{players.filter(p => compare.includes(p.id)).map(p => <article key={p.id}><h3>{p.name} · {p.position}</h3><p>Цена {formatKhlNumber(p.price.value)} · TOI {formatToi(p.toiSeconds.value)} · EP {formatKhlNumber(p.ep.value)}</p><p>{p.position === "G" ? `SV ${formatKhlNumber(p.saves.value)} / GA ${formatKhlNumber(p.goalsAgainst.value)}` : `ixG ${formatKhlNumber(p.ixg.value)} / PP ${formatToi(p.ppToiSeconds.value)}`}</p></article>)}</div></section>}
    </div></div>}
    {profileRequired && <Link className={control} href="/profile">Привязать профиль Sports</Link>}
    <p role="status" aria-live="polite" className="text-sm">{message}</p>
  </section>;
}



