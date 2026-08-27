"use client";

import { Coins, RefreshCw, Sigma, Trophy, Users } from "lucide-react";
import { useState } from "react";

import { I18nText } from "@/components/i18n-text";
import { useLanguage } from "@/components/localized-option";
import type { FantasySourceSyncOption } from "@/machete/fantasy-source-sync-config";

type SyncScopeResult = {
  leagueId?: string;
  season?: string;
  sourceKey?: string;
  tournamentHru?: string;
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

type FplSyncResult = {
  started?: boolean;
  result?: {
    prices: number;
    mappedPlayers: number;
    mappedTeams: number;
    unmatchedPlayers: number;
    unmatchedTeams: number;
    latestPublishedGameweek: number | null;
  };
  error?: string;
  officialScoreError?: string;
};

type ProbableLineupSourceKey = "epl" | "serie-a" | "bundesliga";

type ProbableLineupSourceResult = {
  source: ProbableLineupSourceKey;
  status: "SUCCEEDED" | "PARTIAL" | "FAILED";
  parsedTeams: number;
  appliedTeams: number;
  unchangedTeams: number;
  skippedTeams: number;
  failedTeams: number;
  error: string | null;
};

type ProbableLineupSyncResult = {
  started: boolean;
  sources: ProbableLineupSourceResult[];
};

const probableLineupSources: Array<{
  sourceKey: ProbableLineupSourceKey;
  labelEn: string;
  labelRu: string;
  provider: string;
  descriptionEn: string;
  descriptionRu: string;
  actionEn: string;
  actionRu: string;
}> = [
  {
    sourceKey: "epl",
    labelEn: "Premier League lineups",
    labelRu: "Составы АПЛ",
    provider: "Fantasy Football Scout",
    descriptionEn: "Parse and apply the current probable XI for all 20 Premier League clubs.",
    descriptionRu: "Загрузить и применить текущие вероятные XI для всех 20 клубов АПЛ.",
    actionEn: "Update EPL lineups",
    actionRu: "Обновить составы АПЛ"
  },
  {
    sourceKey: "serie-a",
    labelEn: "Serie A lineups",
    labelRu: "Составы Серии A",
    provider: "Gazzetta",
    descriptionEn: "Parse and apply the current probable XI for all 20 Serie A clubs.",
    descriptionRu: "Загрузить и применить текущие вероятные XI для всех 20 клубов Серии A.",
    actionEn: "Update Serie A lineups",
    actionRu: "Обновить составы Серии A"
  },
  {
    sourceKey: "bundesliga",
    labelEn: "Bundesliga lineups",
    labelRu: "Составы Бундеслиги",
    provider: "LigaInsider",
    descriptionEn: "Discover all 18 club pages, then parse and apply each probable XI.",
    descriptionRu: "Найти страницы всех 18 клубов, затем загрузить и применить каждый вероятный XI.",
    actionEn: "Update Bundesliga lineups",
    actionRu: "Обновить составы Бундеслиги"
  }
];

export function FantasySourceSyncControls({
  priceOptions,
  foontasyOptions,
  fplEnabled = true
}: {
  priceOptions: FantasySourceSyncOption[];
  foontasyOptions: FantasySourceSyncOption[];
  fplEnabled?: boolean;
}) {
  return (
    <section className="mt-6 ui-card p-5">
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
      <div className="mt-5 grid gap-5 lg:grid-cols-3">
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
        <FplPriceSyncPanel enabled={fplEnabled} />
      </div>
      <div className="mt-6 border-t border-slate-200 pt-5">
        <h3 className="text-base font-bold text-ink">
          <I18nText en="Probable starting lineups" ru="Вероятные стартовые составы" />
        </h3>
        <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-500">
          <I18nText
            en="Run one league independently. Only a complete source with 11 unambiguously mapped players per club can change starting-XI flags."
            ru="Запускайте лиги независимо. Флаги стартового состава меняются только для полного источника и при однозначном сопоставлении всех 11 игроков клуба."
          />
        </p>
        <div className="mt-4 grid gap-5 lg:grid-cols-3">
          {probableLineupSources.map((source) => (
            <ProbableLineupSyncPanel key={source.sourceKey} {...source} />
          ))}
        </div>
      </div>
    </section>
  );
}

function ProbableLineupSyncPanel({
  sourceKey,
  labelEn,
  labelRu,
  provider,
  descriptionEn,
  descriptionRu,
  actionEn,
  actionRu
}: (typeof probableLineupSources)[number]) {
  const language = useLanguage();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ProbableLineupSyncResult | null>(null);

  async function run() {
    setPending(true);
    setError(null);
    setResult(null);
    try {
      const response = await fetch(`/api/admin/fantasy-sources/probable-lineups/${sourceKey}/start`, { method: "POST" });
      const body = await response.json().catch(() => null) as (ProbableLineupSyncResult & { error?: { message?: string } | string }) | null;
      const errorMessage = body && typeof body.error === "object"
        ? body.error.message
        : typeof body?.error === "string"
          ? body.error
          : null;
      if (!response.ok) throw new Error(errorMessage ?? (language === "ru" ? "Обновление составов не запустилось." : "The lineup update could not be started."));
      setResult(body);
    } catch (runError) {
      setError(runError instanceof Error ? runError.message : language === "ru" ? "Неизвестная ошибка." : "Unknown error.");
    } finally {
      setPending(false);
    }
  }

  const sourceResult = result?.sources.find((source) => source.source === sourceKey) ?? null;
  const resultClass = sourceResult?.status === "SUCCEEDED"
    ? "bg-emerald-50 text-emerald-800"
    : sourceResult?.status === "PARTIAL"
      ? "bg-amber-50 text-amber-800"
      : "bg-rose-50 text-rose-700";

  return (
    <div className="rounded border border-slate-200 bg-field p-4">
      <div className="flex items-center gap-2 text-sm font-bold text-ink">
        <Users className="h-4 w-4" />
        <I18nText en={labelEn} ru={labelRu} />
      </div>
      <p className="mt-1 text-xs font-semibold text-slate-400">{provider}</p>
      <p className="mt-1 text-xs leading-5 text-slate-500"><I18nText en={descriptionEn} ru={descriptionRu} /></p>
      <button
        type="button"
        disabled={pending}
        onClick={run}
        className="ui-button ui-button-primary mt-4 disabled:cursor-not-allowed"
      >
        <RefreshCw className={`h-4 w-4 ${pending ? "animate-spin" : ""}`} />
        {pending ? <I18nText en="Updating..." ru="Обновление..." /> : <I18nText en={actionEn} ru={actionRu} />}
      </button>
      {error ? <p className="mt-3 rounded bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</p> : null}
      {sourceResult ? (
        <div className={`mt-3 rounded px-3 py-2 text-xs ${resultClass}`}>
          <p className="font-semibold">
            {sourceResult.status === "SUCCEEDED"
              ? <I18nText en="Completed" ru="Завершено" />
              : sourceResult.status === "PARTIAL"
                ? <I18nText en="Completed with skips" ru="Завершено с пропусками" />
                : <I18nText en="Failed" ru="Ошибка" />}
          </p>
          <p className="mt-1">
            {language === "ru"
              ? `Команд: ${sourceResult.parsedTeams}; применено: ${sourceResult.appliedTeams}; без изменений: ${sourceResult.unchangedTeams}; пропущено: ${sourceResult.skippedTeams}; ошибок: ${sourceResult.failedTeams}.`
              : `Teams: ${sourceResult.parsedTeams}; applied: ${sourceResult.appliedTeams}; unchanged: ${sourceResult.unchangedTeams}; skipped: ${sourceResult.skippedTeams}; errors: ${sourceResult.failedTeams}.`}
          </p>
          {sourceResult.error ? <p className="mt-1">{sourceResult.error}</p> : null}
        </div>
      ) : null}
    </div>
  );
}

function FplPriceSyncPanel({ enabled }: { enabled: boolean }) {
  const language = useLanguage();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<FplSyncResult | null>(null);

  async function run() {
    setPending(true);
    setError(null);
    setResult(null);
    try {
      const response = await fetch("/api/admin/fantasy-sources/fpl/start", { method: "POST" });
      const body = await response.json().catch(() => null) as (Omit<FplSyncResult, "error"> & { error?: string | { message?: string } }) | null;
      const errorMessage = body && typeof body.error === "object"
        ? body.error.message
        : typeof body?.error === "string"
          ? body.error
          : null;
      if (!response.ok) throw new Error(errorMessage ?? (language === "ru" ? "Синхронизация FPL не запустилась." : "FPL synchronization could not be started."));
      setResult(body as FplSyncResult);
    } catch (runError) {
      setError(runError instanceof Error ? runError.message : language === "ru" ? "Неизвестная ошибка." : "Unknown error.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="rounded border border-slate-200 bg-field p-4">
      <div className="flex items-center gap-2 text-sm font-bold text-ink"><Trophy className="h-4 w-4" /><I18nText en="FPL prices" ru="Цены FPL" /></div>
      <p className="mt-1 text-xs leading-5 text-slate-500">
        <I18nText en="Load the official FPL bootstrap price snapshot for CoreLeague 47. Player and club mappings are preserved and unmatched rows remain visible." ru="Загрузить официальный снимок цен FPL для CoreLeague 47. Связи игроков и клубов сохраняются, несопоставленные строки остаются видимыми." />
      </p>
      <button
        type="button"
        disabled={!enabled || pending}
        onClick={run}
        className="ui-button ui-button-primary mt-4 disabled:cursor-not-allowed"
      >
        <RefreshCw className={`h-4 w-4 ${pending ? "animate-spin" : ""}`} />
        {pending ? <I18nText en="Updating..." ru="Обновление..." /> : <I18nText en="Update FPL prices" ru="Обновить цены FPL" />}
      </button>
      {!enabled ? <p className="mt-3 rounded bg-amber-50 px-3 py-2 text-xs text-amber-800"><I18nText en="FPL price sync is disabled by configuration." ru="Синхронизация цен FPL отключена конфигурацией." /></p> : null}
      {error ? <p className="mt-3 rounded bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</p> : null}
      {result?.result ? (
        <p className="mt-3 rounded bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
          <I18nText en="Loaded" ru="Загружено" />: {result.result.prices}; <I18nText en="mapped players" ru="сопоставлено игроков" />: {result.result.mappedPlayers}; <I18nText en="unmatched" ru="без связи" />: {result.result.unmatchedPlayers}
        </p>
      ) : null}
      {result?.officialScoreError ? <p className="mt-3 rounded bg-amber-50 px-3 py-2 text-xs text-amber-800"><I18nText en="Prices loaded; official score refresh was unavailable." ru="Цены загружены; обновление официальных очков недоступно." /></p> : null}
    </div>
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
        className="ui-button ui-button-primary mt-4 disabled:cursor-not-allowed"
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
  const optionByKey = new Map(options.map((option) => [option.key, option]));
  return (
    <div className="mt-4 space-y-2 border-t border-slate-200 pt-3 text-xs">
      <p className="font-semibold text-slate-700">
        <I18nText en="Completed" ru="Завершено" />: {result.succeeded}; <I18nText en="errors" ru="ошибок" />: {result.failed}
        {result.unavailable ? `; ${language === "ru" ? "недоступно" : "unavailable"}: ${result.unavailable}` : ""}
      </p>
      {result.scopes.map((scope, index) => {
        const resultSourceKey = kind === "prices" ? scope.tournamentHru : scope.sourceKey;
        const option = resultSourceKey
          ? optionByKey.get(`${scope.leagueId}:${scope.season}:${resultSourceKey}`)
          : undefined;
        const label = option ? (language === "ru" ? option.labelRu : option.labelEn) : `${scope.leagueId ?? "-"}`;
        const success = scope.status === "SYNCED";
        const unavailable = scope.status === "UNAVAILABLE";
        const details = kind === "prices"
          ? `${scope.prices ?? 0} ${language === "ru" ? "цен" : "prices"}; ${language === "ru" ? "новых связей" : "new mappings"}: ${scope.mapping?.matched ?? 0}; ${language === "ru" ? "осталось" : "remaining"}: ${scope.mapping?.unmatched ?? 0}`
          : `${language === "ru" ? "тур" : "round"} ${scope.roundNumber ?? "-"}; ${scope.rows ?? 0} ${language === "ru" ? "строк" : "rows"}; ${language === "ru" ? "связано" : "mapped"}: ${scope.mapped ?? 0}`;
        return (
          <div key={`${scope.leagueId}:${scope.season}:${resultSourceKey ?? index}`} className={`rounded px-3 py-2 ${
            success ? "bg-emerald-50 text-emerald-800" : unavailable ? "bg-amber-50 text-amber-800" : "bg-rose-50 text-rose-700"
          }`}>
            <span className="font-semibold">{label}</span>: {success ? details : scope.error || scope.status || "FAILED"}
          </div>
        );
      })}
    </div>
  );
}
