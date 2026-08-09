"use client";

import { Coins, RefreshCw, Sigma } from "lucide-react";
import { useState } from "react";

import { I18nText } from "@/components/i18n-text";
import { useLanguage } from "@/components/localized-option";
import type { FantasySourceSyncOption } from "@/machete/fantasy-source-sync-config";

type SyncScopeResult = {
  leagueId?: string;
  season?: string;
  status?: string;
  prices?: number;
  rows?: number;
  mapped?: number;
  roundNumber?: number;
  mapping?: { matched?: number; manual?: number; unmatched?: number } | null;
  error?: string;
};

type SyncResult = {
  succeeded: number;
  failed: number;
  unavailable?: number;
  scopes: SyncScopeResult[];
};

export function FantasySourceSyncControls({
  priceOptions,
  foontasyOptions
}: {
  priceOptions: FantasySourceSyncOption[];
  foontasyOptions: FantasySourceSyncOption[];
}) {
  return (
    <section className="mt-6 rounded border border-slate-200 bg-white p-5 shadow-soft">
      <div>
        <h2 className="text-lg font-bold text-ink">
          <I18nText en="Fantasy source updates" ru="Обновление фэнтези-источников" />
        </h2>
        <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-500">
          <I18nText
            en="Choose leagues independently. A failure in one league is reported without stopping the remaining selected leagues. Existing player mappings are preserved."
            ru="Выберите чемпионаты независимо. Ошибка одной лиги будет показана отдельно и не остановит остальные; существующий маппинг игроков сохраняется."
          />
        </p>
      </div>
      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <SourcePanel
          icon={<Coins className="h-4 w-4" />}
          title={<I18nText en="Sports.ru prices" ru="Цены Sports.ru" />}
          description={<I18nText en="Download current prices and map only previously unmapped players." ru="Скачать актуальные цены и замапить только ранее не сопоставленных игроков." />}
          endpoint="/api/admin/fantasy-sources/prices/start"
          options={priceOptions}
          actionLabel={<I18nText en="Update prices" ru="Обновить цены" />}
          resultKind="prices"
        />
        <SourcePanel
          icon={<Sigma className="h-4 w-4" />}
          title={<I18nText en="Foontasy FFO" ru="Очки FFO Foontasy" />}
          description={<I18nText en="Import the current forecast round from each published Foontasy assistant page." ru="Импортировать текущий прогнозный тур с опубликованных страниц ассистента Foontasy." />}
          endpoint="/api/admin/fantasy-sources/foontasy/start"
          options={foontasyOptions}
          actionLabel={<I18nText en="Update FFO" ru="Обновить FFO" />}
          resultKind="foontasy"
        />
      </div>
    </section>
  );
}

function SourcePanel({
  icon,
  title,
  description,
  endpoint,
  options,
  actionLabel,
  resultKind
}: {
  icon: React.ReactNode;
  title: React.ReactNode;
  description: React.ReactNode;
  endpoint: string;
  options: FantasySourceSyncOption[];
  actionLabel: React.ReactNode;
  resultKind: "prices" | "foontasy";
}) {
  const language = useLanguage();
  const [selected, setSelected] = useState(() => new Set(options.map((option) => option.key)));
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SyncResult | null>(null);

  function toggle(key: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  async function run() {
    setPending(true);
    setError(null);
    setResult(null);
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scopes: [...selected] })
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error?.message || (language === "ru" ? "Запуск не удался." : "The update could not be started."));
      setResult(body as SyncResult);
    } catch (runError) {
      setError(runError instanceof Error ? runError.message : language === "ru" ? "Неизвестная ошибка." : "Unknown error.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="rounded border border-slate-200 bg-field p-4">
      <div className="flex items-center gap-2 text-sm font-bold text-ink">{icon}{title}</div>
      <p className="mt-1 text-xs leading-5 text-slate-500">{description}</p>
      <div className="mt-3 flex items-center gap-3 text-xs font-semibold text-slate-500">
        <button type="button" className="hover:text-ink" onClick={() => setSelected(new Set(options.map((option) => option.key)))}>
          <I18nText en="Select all" ru="Выбрать все" />
        </button>
        <button type="button" className="hover:text-ink" onClick={() => setSelected(new Set())}>
          <I18nText en="Clear" ru="Снять все" />
        </button>
      </div>
      <div className="mt-3 grid max-h-52 gap-2 overflow-y-auto pr-1 sm:grid-cols-2">
        {options.map((option) => (
          <label key={option.key} className="flex cursor-pointer items-start gap-2 rounded border border-slate-200 bg-white px-3 py-2 text-sm hover:border-slate-300">
            <input
              type="checkbox"
              className="mt-0.5 h-4 w-4 rounded border-slate-300 text-emerald-600"
              checked={selected.has(option.key)}
              onChange={() => toggle(option.key)}
            />
            <span>
              <span className="block font-semibold text-slate-800">{language === "ru" ? option.labelRu : option.labelEn}</span>
              <span className="block text-xs text-slate-400">{option.season}</span>
            </span>
          </label>
        ))}
        {options.length === 0 ? (
          <p className="col-span-full rounded bg-amber-50 px-3 py-2 text-xs text-amber-800">
            <I18nText en="No current league scopes are configured." ru="Нет настроенных текущих чемпионатов." />
          </p>
        ) : null}
      </div>
      <button
        type="button"
        disabled={pending || selected.size === 0}
        onClick={run}
        className="mt-4 inline-flex items-center gap-2 rounded bg-ink px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-45"
      >
        <RefreshCw className={`h-4 w-4 ${pending ? "animate-spin" : ""}`} />
        {pending ? <I18nText en="Updating..." ru="Обновление..." /> : actionLabel}
      </button>
      {error ? <p className="mt-3 rounded bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</p> : null}
      {result ? <SourceResult result={result} options={options} kind={resultKind} /> : null}
    </div>
  );
}

function SourceResult({ result, options, kind }: { result: SyncResult; options: FantasySourceSyncOption[]; kind: "prices" | "foontasy" }) {
  const language = useLanguage();
  const optionByScope = new Map(options.map((option) => [`${option.leagueId}:${option.season}`, option]));
  return (
    <div className="mt-4 space-y-2 border-t border-slate-200 pt-3 text-xs">
      <p className="font-semibold text-slate-700">
        <I18nText en="Completed" ru="Завершено" />: {result.succeeded}; <I18nText en="errors" ru="ошибок" />: {result.failed}
        {result.unavailable ? `; ${language === "ru" ? "недоступно" : "unavailable"}: ${result.unavailable}` : ""}
      </p>
      {result.scopes.map((scope, index) => {
        const option = optionByScope.get(`${scope.leagueId}:${scope.season}`);
        const label = option ? (language === "ru" ? option.labelRu : option.labelEn) : `${scope.leagueId ?? "-"}`;
        const success = scope.status === "SYNCED";
        const details = kind === "prices"
          ? `${scope.prices ?? 0} ${language === "ru" ? "цен" : "prices"}; ${language === "ru" ? "новых связей" : "new mappings"}: ${scope.mapping?.matched ?? 0}; ${language === "ru" ? "осталось" : "remaining"}: ${scope.mapping?.unmatched ?? 0}`
          : `${language === "ru" ? "тур" : "round"} ${scope.roundNumber ?? "-"}; ${scope.rows ?? 0} ${language === "ru" ? "строк" : "rows"}; ${language === "ru" ? "связано" : "mapped"}: ${scope.mapped ?? 0}`;
        return (
          <div key={`${scope.leagueId}:${scope.season}:${index}`} className={`rounded px-3 py-2 ${success ? "bg-emerald-50 text-emerald-800" : "bg-rose-50 text-rose-700"}`}>
            <span className="font-semibold">{label}</span>: {success ? details : scope.error || scope.status || "FAILED"}
          </div>
        );
      })}
    </div>
  );
}
