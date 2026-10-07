"use client";
/** @spec spec://modules/machete/FEAT-008-platform-transfer-trends#ui */
import { useEffect, useState } from "react";
import { ArrowDownLeft, ArrowUpRight, RefreshCw, Users } from "lucide-react";
import { I18nText } from "@/components/i18n-text";
import { localizedText, useLanguage } from "@/components/localized-option";
import type { PlatformTransferEntry, PlatformTransferTrends } from "@/machete/platform-transfer-trends";

const positions: Record<string, string> = { GK: "ВР", DEF: "ЗЩ", MID: "ПЗ", FWD: "НП", G: "ВР", D: "ЗЩ", F: "НП" };

export function PlatformTransferTrendsPanel({ contestId, module = "football" }: {
  contestId: string | null;
  module?: "football" | "khl";
}) {
  const language = useLanguage();
  const scope = `${module}:${contestId ?? ""}`;
  const [revision, setRevision] = useState(0);
  const [result, setResult] = useState<{ scope: string; revision: number; data: PlatformTransferTrends | null } | null>(null);
  const settled = result?.scope === scope && result.revision === revision;
  const data = settled ? result.data : null;

  useEffect(() => {
    const refresh = () => setRevision(n => n + 1);
    window.addEventListener("machete:squad-saved", refresh);
    return () => window.removeEventListener("machete:squad-saved", refresh);
  }, []);

  useEffect(() => {
    if (!contestId) return;
    const controller = new AbortController();
    const query = new URLSearchParams({ contestId, module });
    void fetch(`/api/machete/platform-transfers?${query}`, { signal: controller.signal, cache: "no-store" })
      .then(async response => {
        if (!response.ok) throw new Error("PLATFORM_TRANSFERS_UNAVAILABLE");
        const value = await response.json() as PlatformTransferTrends;
        if (value.contestId !== contestId) throw new Error("PLATFORM_TRANSFERS_SCOPE_MISMATCH");
        if (!controller.signal.aborted) setResult({ scope, revision, data: value });
      })
      .catch(() => {
        if (!controller.signal.aborted) setResult({ scope, revision, data: null });
      });
    return () => controller.abort();
  }, [contestId, module, scope, revision]);

  if (!contestId) return null;
  return (
    <section data-testid="platform-transfer-trends" aria-label={localizedText(language, "Platform transfers", "Трансферы участников платформы")}
      className="mt-3 min-w-0 rounded border border-slate-200 bg-white p-3 text-sm shadow-soft">
      <div className="flex items-start justify-between gap-2">
        <h3 className="font-semibold text-ink"><I18nText en="Popular transfers on the platform" ru="Берут и продают на платформе" /></h3>
        <button type="button" onClick={() => setRevision(n => n + 1)} disabled={!settled}
          aria-label={localizedText(language, "Refresh platform transfers", "Обновить трансферы платформы")}
          className="flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded text-slate-500 hover:bg-slate-100 disabled:opacity-40">
          <RefreshCw aria-hidden="true" className={`h-3.5 w-3.5${!settled ? " animate-spin motion-reduce:animate-none" : ""}`} />
        </button>
      </div>
      <div aria-live="polite">
        {!settled ? <p className="text-xs text-slate-500"><I18nText en="Comparing saved squads…" ru="Сравниваем сохранённые составы…" /></p> : null}
        {settled && !data ? <p role="alert" className="text-xs text-rose-700"><I18nText en="Could not load platform transfers. Try refreshing." ru="Не удалось загрузить трансферы платформы. Нажмите обновить." /></p> : null}
        {data ? (
          <>
            {data.baselineRound ? <p className="text-xs text-slate-500">
              {data.baselineRound.label} <span aria-hidden="true">→</span> {module === "khl"
                ? localizedText(language, "Saved plan", "Сохранённый план") : data.targetRound?.label}
            </p> : null}
            {data.status === "READY" ? (
              <>
                <p className="mt-2 flex items-center gap-1.5 text-xs text-slate-500">
                  <Users aria-hidden="true" className="h-3.5 w-3.5" />
                  <I18nText en={`Compared ${data.compared} of ${data.participants} participants`} ru={`Сравнено участников: ${data.compared} из ${data.participants}`} />
                </p>
                <div className="mt-3 grid min-w-0 grid-cols-1 gap-3 min-[400px]:grid-cols-2">
                  <TransferList entries={data.buys} direction="buys" language={language} />
                  <TransferList entries={data.sells} direction="sells" language={language} />
                </div>
              </>
            ) : <p className="mt-2 text-xs text-slate-600">
              {data.status === "NO_BASELINE" ? <I18nText en="No published squad baseline for the latest round yet." ru="Для крайнего тура пока нет опубликованного состава для сравнения." /> : null}
              {data.status === "NO_NEXT_ROUND" ? <I18nText en="No upcoming round to compare saved plans for." ru="В расписании пока нет следующего тура для сравнения планов." /> : null}
              {data.status === "NO_COMPARABLE_SQUADS" ? <I18nText en="No complete saved plans with a squad from the latest round yet." ru="Пока нет полных сохранённых планов с составом из крайнего тура." /> : null}
            </p>}
            {data.excluded > 0 ? <p className="mt-2 text-[11px] leading-snug text-slate-500">
              <I18nText en={`Excluded: ${data.excluded} participants without a comparable plan and latest-round squad.`}
                ru={`Не учтено: ${data.excluded} участников без сравнимого плана и состава крайнего тура.`} />
            </p> : null}
            <p className="mt-3 text-[11px] leading-snug text-slate-500">
              <I18nText en="Saved plans on this platform · one latest variant per participant. Percentage of compared participants."
                ru="Сохранённые планы на платформе · последний вариант каждого участника. Процент от сравнимых участников." />
            </p>
            <p className="mt-1 text-[10px] text-slate-400">
              <I18nText en="As of " ru="Срез: " />
              <time dateTime={data.asOf}>{new Date(data.asOf).toLocaleString(language === "ru" ? "ru-RU" : "en-GB", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Moscow" })} МСК</time>
            </p>
          </>
        ) : null}
      </div>
    </section>
  );
}

function TransferList({ entries, direction, language }: { entries: PlatformTransferEntry[]; direction: "buys" | "sells"; language: "en" | "ru" }) {
  const buys = direction === "buys";
  const Icon = buys ? ArrowDownLeft : ArrowUpRight;
  return <div className="min-w-0 rounded border border-slate-100 bg-slate-50 p-2">
    <h4 className={`flex items-center gap-1 text-xs font-semibold ${buys ? "text-emerald-700" : "text-rose-700"}`}>
      <Icon aria-hidden="true" className="h-3.5 w-3.5" /><I18nText en={buys ? "Most added" : "Most removed"} ru={buys ? "Берут" : "Продают"} />
    </h4>
    {!entries.length ? <p className="mt-2 text-xs text-slate-500"><I18nText en="No changes yet" ru="Пока без изменений" /></p> : <ol className="mt-2 space-y-2">
      {entries.map((entry, i) => <li key={entry.playerId} className="flex min-w-0 items-start justify-between gap-2 text-xs">
        <div className="min-w-0">
          <p className="break-words font-medium text-ink"><span className="text-slate-400">{i + 1}. </span>{entry.name}</p>
          <p className="break-words text-[10px] text-slate-500">{[entry.team, entry.position ? language === "ru" ? positions[entry.position] ?? entry.position : entry.position : null].filter(Boolean).join(" · ")}</p>
        </div>
        <div className="shrink-0 text-right num-tabular" title={localizedText(language, `${entry.count} participants`, `Участников: ${entry.count}`)}>
          <p className="font-semibold text-ink">{entry.count}</p>
          <p className="text-[10px] text-slate-500">{entry.percent.toLocaleString(language === "ru" ? "ru-RU" : "en-GB", { maximumFractionDigits: 1 })}%</p>
        </div>
      </li>)}
    </ol>}
  </div>;
}
