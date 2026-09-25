"use client";
/** @spec spec://modules/machete/FEAT-006-sports-popularity#contracts */
import { useEffect, useState } from "react";
import { I18nText } from "@/components/i18n-text";
import { localizedText, useLanguage } from "@/components/localized-option";
import type { SportsTrendsView } from "@/machete/sports-trends";

const categoryLabels: Record<string, { en: string; ru: string }> = {
  BUYS: { en: "Buys", ru: "Покупки" },
  SELLS: { en: "Sells", ru: "Продажи" },
  OWNERSHIP: { en: "Ownership", ru: "Популярность" },
  CAPTAINS: { en: "Captains", ru: "Капитаны" },
  OWNERSHIP_DELTA_PP: { en: "Ownership change", ru: "Рост доли" }
};

const positionLabels: Record<string, string> = { GK: "ВР", DEF: "ЗЩ", MID: "ПЗ", FWD: "НП" };

function categoryLabel(category: string, language: string): string {
  const label = categoryLabels[category];
  if (!label) return category;
  return language === "ru" ? label.ru : label.en;
}

export function SportsTrendsPanel({
  contestId,
  roundKey,
  roundLabel
}: {
  contestId: string | null;
  roundKey: string | null;
  roundLabel: string | null;
}) {
  const language = useLanguage();
  const [data, setData] = useState<SportsTrendsView | null>(null);
  const [loading, setLoading] = useState(false);
  const [retry, setRetry] = useState(0);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!contestId || !open) return;
    const controller = new AbortController();
    const query = new URLSearchParams({ contestId });
    if (roundKey) query.set("roundKey", roundKey);
    queueMicrotask(() => {
      if (!controller.signal.aborted) setLoading(true);
    });
    void fetch(`/api/machete/sports-trends?${query.toString()}`, { signal: controller.signal, cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("SPORTS_TRENDS_UNAVAILABLE");
        const value = (await response.json()) as SportsTrendsView;
        if (!controller.signal.aborted) setData(value);
      })
      .catch(() => {
        if (!controller.signal.aborted) setData(null);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [contestId, roundKey, open, retry]);

  if (!contestId) return null;
  return (
    <details className="mt-3 rounded border border-slate-200 bg-white p-3 text-sm shadow-soft" open={open} onToggle={(event) => setOpen((event.target as HTMLDetailsElement).open)}>
      <summary className="cursor-pointer font-semibold text-ink">
        <I18nText en="Popular on Sports" ru="Популярное на Sports" />
        {roundLabel ? <span className="ml-2 text-xs font-normal text-slate-500">{roundLabel}</span> : null}
      </summary>
      <div className="mt-2 space-y-3" aria-live="polite">
        {loading ? <p className="text-slate-500"><I18nText en="Loading Sports ratings…" ru="Загрузка рейтингов Sports…" /></p> : null}
        {!loading && !data ? (
          <p className="text-slate-500"><I18nText en="Sports ratings are unavailable right now." ru="Рейтинги Sports сейчас недоступны." /></p>
        ) : null}
        {!loading && data ? (
          <>
            {data.status === "NOT_PUBLISHED" ? (
              <p className="text-slate-600"><I18nText en="Sports has not published a rating for this round yet." ru="Sports пока не опубликовал рейтинг этого тура." /></p>
            ) : null}
            {data.status === "FAILED" ? <p className="text-rose-700">{data.statusReason ?? localizedText(language, "Sports parser failed.", "Парсер Sports завершился ошибкой.")}</p> : null}
            {data.sections.map((section) => (
              <div key={`${section.category}:${section.sectionKey}:${section.populationScope}`} className="rounded border border-slate-100 bg-slate-50 p-2">
                <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
                  <span className="font-semibold text-ink">{categoryLabel(section.category, language)}</span>
                  {section.position ? <span className="rounded bg-white px-1.5 py-0.5">{positionLabels[section.position] ?? section.position}</span> : null}
                  {section.populationScope === "TOP_1000_MANAGERS" ? <span className="rounded bg-white px-1.5 py-0.5"><I18nText en="top-1000" ru="топ-1000" /></span> : null}
                  <span>{localizedText(language, `found ${section.availableCount}`, `найдено ${section.availableCount}`)}</span>
                  <span>{new Date(section.observedAt).toLocaleString(language === "ru" ? "ru-RU" : "en-GB")}</span>
                  {section.sourceUrl ? (
                    <a className="text-sky-700 underline" href={section.sourceUrl} target="_blank" rel="noreferrer noopener">
                      <I18nText en="source ↗" ru="источник ↗" />
                    </a>
                  ) : null}
                </div>
                <ol className="mt-1 space-y-0.5">
                  {section.entries.map((entry) => (
                    <li key={`${entry.rank}:${entry.name}`} className="flex items-baseline justify-between gap-2">
                      <span className="min-w-0 truncate">
                        <span className="text-slate-400">{entry.rank}.</span> {entry.name}
                        {entry.team ? <span className="text-slate-500">, {entry.team}</span> : null}
                        {entry.position ? <span className="text-slate-400"> · {positionLabels[entry.position] ?? entry.position}</span> : null}
                      </span>
                      <span className="shrink-0 font-medium text-ink">{entry.valueText ?? (entry.value == null ? "—" : entry.value)}</span>
                    </li>
                  ))}
                </ol>
                {section.statusReason ? <p className="mt-1 text-[11px] leading-snug text-slate-500">{section.statusReason}</p> : null}
              </div>
            ))}
            <p className="text-xs text-slate-500">{data.disclaimer}</p>
          </>
        ) : null}
        <button type="button" className="text-sky-700 underline disabled:opacity-50" disabled={loading} onClick={() => setRetry((value) => value + 1)}>
          <I18nText en="Refresh" ru="Обновить" />
        </button>
      </div>
    </details>
  );
}
