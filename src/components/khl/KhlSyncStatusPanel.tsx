"use client";
/** @spec spec://modules/khl/FEAT-002-khl-squad#layout
 * @spec spec://modules/khl/INFRA-001-khl-data-ingestion#sync-status
 */
import React, { useEffect, useState } from "react";
import { formatKhlSyncTime, type KhlSyncStatus } from "@/khl/sync-status";

const outcomes = { DONE: "Успешно", PARTIAL: "Завершилось с ошибками", PENDING: "Не завершено — продолжится в следующем цикле" };
const sources = { DONE: "обновлено", FAILED: "ошибка", PENDING: "остались данные для следующего цикла" };

export function KhlSyncStatusPanel({ contestId, initialStatus }: { contestId: string; initialStatus: KhlSyncStatus }) {
  const [live, setLive] = useState<{ initial: KhlSyncStatus; status: KhlSyncStatus } | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const status = live?.initial === initialStatus ? live.status : initialStatus;
  useEffect(() => {
    let active: AbortController | null = null;
    let disposed = false;
    let lastRequestAt = Date.now();
    async function refresh() {
      if (document.visibilityState !== "visible" || active || Date.now() - lastRequestAt < 60000) return;
      lastRequestAt = Date.now();
      const controller = new AbortController();
      active = controller;
      const timeout = setTimeout(() => controller.abort(), 15000);
      try {
        const response = await fetch(`/api/machete/khl/sync-status?contestId=${encodeURIComponent(contestId)}`, { cache: "no-store", signal: controller.signal });
        if (!response.ok) throw new Error("STATUS_UNAVAILABLE");
        const body = await response.json();
        if (!body.data || typeof body.data.interrupted !== "boolean") throw new Error("INVALID_STATUS");
        if (!disposed) { setLive({ initial: initialStatus, status: body.data }); setUnavailable(false); }
      } catch { if (!disposed) setUnavailable(true); }
      finally { clearTimeout(timeout); active = null; }
    }
    const timer = setInterval(() => { void refresh(); }, 60000);
    const onVisible = () => { void refresh(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => { disposed = true; clearInterval(timer); document.removeEventListener("visibilitychange", onVisible); active?.abort(); };
  }, [contestId, initialStatus]);

  const failed = status.lastAttempt?.sources.filter(s => s.status === "FAILED") ?? [];
  return <section aria-label="Обновление данных КХЛ" className="space-y-1 rounded-xl border border-slate-500/30 px-4 py-3 text-sm">
    <h2 className="font-semibold">Обновление на сервере</h2>
    <p>Каталог и цены: <time dateTime={status.catalogUpdatedAt ?? undefined}>{formatKhlSyncTime(status.catalogUpdatedAt)}</time></p>
    <p>Полное успешное обновление: {status.lastSuccessAt ? <time dateTime={status.lastSuccessAt}>{formatKhlSyncTime(status.lastSuccessAt)}</time> : "ещё не зафиксировано"}</p>
    {status.lastAttempt ? <p>Последняя завершённая попытка: <time dateTime={status.lastAttempt.completedAt}>{formatKhlSyncTime(status.lastAttempt.completedAt)}</time> · <strong>{outcomes[status.lastAttempt.status]}</strong></p> : <p>Завершённых попыток обновления пока нет.</p>}
    {status.runningSince && <p role="status">{status.interrupted ? "Обновление прервано или не завершилось вовремя" : "Сейчас идёт обновление"} · началось <time dateTime={status.runningSince}>{formatKhlSyncTime(status.runningSince)}</time>.</p>}
    {failed.length > 0 && <p className="font-medium text-rose-700 dark:text-rose-300">Ошибки: {failed.map(s => s.source).join("; ")}. Показаны сохранённые данные.</p>}
    {!!status.lastAttempt?.sources.length && <details><summary className="cursor-pointer">Результат по источникам</summary><ul className="mt-2 space-y-1">{status.lastAttempt.sources.map((s, i) => <li key={`${i}:${s.source}`}>{s.source} — {sources[s.status]}</li>)}</ul></details>}
    {unavailable && <p role="status">Статус сейчас проверить не удалось. Показан последний известный результат.</p>}
  </section>;
}
