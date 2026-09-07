"use client";
/** @spec spec://modules/machete/FEAT-001-global-ranking-strategy#scenarios */
import { useEffect, useState } from "react";
import { I18nText } from "@/components/i18n-text";
import { LocalizedOption, localizedText, useLanguage } from "@/components/localized-option";
import type { FantasySquadStrategy } from "@/machete/squad_logic";
import type { GlobalStrategyEvaluation, GlobalStrategyRequestContext } from "@/machete/global-strategy";
import type { GlobalStrategyAnalysis } from "@/machete/global-strategy-planner";
import type { GlobalStrategyResponse } from "@/server/global-strategy-context";

const reasons: Record<string, string> = {
  PROFILE_NOT_LINKED: "Привяжите профиль провайдера в настройках.", SELECT_PROVIDER_SQUAD: "Выберите команду провайдера: найдено несколько команд.",
  PROFILE_SQUAD_NOT_FOUND: "Привязанная команда не найдена в этом сезоне.", STANDINGS_RECALCULATING: "Тур идёт или рейтинг пересчитывается.",
  INCOMPLETE_CALENDAR: "Полная длина этого турнира пока не подтверждена.", INSUFFICIENT_SCORE_HISTORY: "Недостаточно завершённых туров для масштаба очков.",
  INCOHERENT_STANDINGS: "Источники рейтинга относятся к разным стадиям пересчёта.", STALE_OWNERSHIP: "Данные владения устарели. Нужна синхронизация цен.",
  INCOMPLETE_OWNERSHIP: "Владение известно не для всех кандидатов.", INCOMPLETE_PLAYER_MAPPING: "Не все игроки сопоставлены с провайдером.",
  STALE_CONTEXT: "Контекст устарел. Обновите данные.", PROVIDER_RATE_LIMITED: "Провайдер ограничил запросы. Повторите позже.",
  PROVIDER_REQUEST_FAILED: "Источник временно недоступен.", INCOMPLETE_FORECAST: "Прогноз покрывает не весь выбранный горизонт.",
  NO_AVAILABLE_ROUNDS: "Доступные туры завершены.", SMALL_SCORE_SAMPLE: "Малая выборка очков: только 1–2 тура.", NEUTRAL_STRATEGY: "Нейтральная стратегия."
};
export function GlobalStrategyPanel({ squadId, provider, mode, onMode, onContext, analysis, poolEvaluation }: {
  squadId: string | null; provider: string; mode: FantasySquadStrategy; onMode: (mode: FantasySquadStrategy) => void;
  onContext: (context: GlobalStrategyRequestContext | null) => void; analysis: GlobalStrategyAnalysis | null;
  poolEvaluation?: GlobalStrategyEvaluation | null;
}) {
  const language = useLanguage();
  const [data, setData] = useState<GlobalStrategyResponse | null>(null);
  const [retry, setRetry] = useState(0);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    onContext(null);
    const controller = new AbortController();
    queueMicrotask(() => { if (!controller.signal.aborted) { setData(null); setLoading(mode === "GLOBAL_AUTO" && Boolean(squadId)); } });
    if (mode !== "GLOBAL_AUTO" || !squadId) return () => controller.abort();
    let expiry: ReturnType<typeof setTimeout> | undefined;
    void fetch(`/api/machete/squads/global-strategy?squadId=${encodeURIComponent(squadId)}`, { signal: controller.signal, cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("GLOBAL_STRATEGY_UNAVAILABLE");
        const value = await response.json() as GlobalStrategyResponse;
        if (controller.signal.aborted) return;
        setData(value);
        onContext(value.requestContext);
        if (value.requestContext) {
          const until = Math.min(Date.parse(value.requestContext.context.expiresAt), Date.parse(value.requestContext.ownershipExpiresAt)) - Date.now();
          expiry = setTimeout(() => {
            onContext(null);
            setData({ requestContext: null, evaluation: { ...value.evaluation, status: "UNAVAILABLE", k: null, reasonCodes: ["STALE_CONTEXT"] } });
          }, Math.max(0, until));
        }
      }).catch(() => { if (!controller.signal.aborted) setData({ requestContext: null, evaluation: { status: "UNAVAILABLE", k: null, configVersion: "unavailable", contextRevision: null, rankRisk: null, gapRisk: null, urgency: null, maxLossFraction: 0, reasonCodes: ["PROVIDER_REQUEST_FAILED"] } }); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => { controller.abort(); clearTimeout(expiry); };
  }, [squadId, provider, mode, retry, onContext]);
  const currentAnalysis = analysis?.contextRevision === data?.evaluation.contextRevision ? analysis : null;
  const evaluation = poolEvaluation?.status === "UNAVAILABLE" && poolEvaluation.contextRevision === data?.evaluation.contextRevision
    ? poolEvaluation : currentAnalysis?.evaluation.status === "UNAVAILABLE" ? currentAnalysis.evaluation : data?.evaluation;
  const context = data?.requestContext?.context;
  return <section className="mb-3 rounded border border-slate-200 bg-slate-50 p-3 text-sm" aria-label={localizedText(language, "Selection strategy", "Стратегия подбора")}>
    <label className="flex flex-wrap items-center gap-2"><I18nText en="Strategy" ru="Стратегия" />
      <select value={mode} onChange={(event) => onMode(event.target.value as FantasySquadStrategy)} className="rounded border bg-white px-2 py-1">
        <LocalizedOption value="balanced" en="Balanced" ru="Сбалансированная" /><LocalizedOption value="reliable" en="Reliable" ru="Надёжная" /><LocalizedOption value="upside" en="Upside" ru="Потенциал" />
        <LocalizedOption value="GLOBAL_AUTO" en="Global ranking · experimental" ru="По глобальному рейтингу · эксперимент" />
      </select>
    </label>
    {mode === "GLOBAL_AUTO" && <div className="mt-2 space-y-1" aria-live="polite">
      <p>{localizedText(language, `Experimental ${provider} profile. Parameters are uncalibrated.`, `Экспериментальный профиль ${provider}. Коэффициенты пока не откалиброваны.`)}</p>
      {!squadId ? <p><I18nText en="Save the squad and link your provider profile." ru="Сохраните состав и привяжите профиль провайдера." /></p> : <button type="button" disabled={loading} onClick={() => setRetry((value) => value + 1)} className="text-sky-700 underline disabled:opacity-50">{loading ? localizedText(language, "Loading ranking…", "Загрузка рейтинга…") : localizedText(language, "Refresh ranking", "Обновить рейтинг")}</button>}
      {context && <><p>{localizedText(language, `${context.rank} of ${context.fieldSize} · points ${context.managerPoints} · gap ${context.leaderPoints - context.managerPoints} · ${context.remainingRounds} rounds remaining.`, `${context.rank} из ${context.fieldSize} · очки ${context.managerPoints} · отставание ${context.leaderPoints - context.managerPoints} · осталось ${context.remainingRounds} туров.`)}</p>
        <p>{evaluation?.k != null && <>{evaluation.k === 0 ? localizedText(language, "Neutral strategy", "Нейтральная стратегия") : `K: ${evaluation.k.toFixed(4)} / ${data?.requestContext?.config.kMax}`} · </>}{new Date(context.observedAt).toLocaleString(language === "ru" ? "ru-RU" : "en-GB")}</p></>}
      {evaluation?.reasonCodes.map((reason) => <p key={reason}>{localizedText(language, reason.replaceAll("_", " "), reasons[reason] ?? reason)}</p>)}
      {data?.squadOptions?.length ? <select defaultValue="" aria-label={localizedText(language, "Provider squad", "Команда провайдера")} onChange={(event) => {
        const providerSquadId = event.target.value;
        void fetch("/api/machete/squads/global-strategy", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ squadId, providerSquadId }) }).then((response) => { if (response.ok) setRetry((value) => value + 1); });
      }} className="rounded border bg-white px-2 py-1"><LocalizedOption value="" en="Select squad" ru="Выберите команду" />{data.squadOptions.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}</select> : null}
      {(evaluation?.status === "UNAVAILABLE" || evaluation?.status === "FINISHED") && <p><I18nText en="Balanced selection remains available." ru="Доступен обычный сбалансированный подбор." /></p>}
      {currentAnalysis && currentAnalysis.evaluation.status !== "UNAVAILABLE" && <p>{localizedText(language,
        `Last recommendation: ${currentAnalysis.candidateExpectedPoints.toFixed(2)} EP; baseline ${currentAnalysis.baselineExpectedPoints.toFixed(2)}. Loss ${Math.max(0, currentAnalysis.expectedPointsLoss).toFixed(2)} / limit ${currentAnalysis.maxExpectedPointsLoss.toFixed(2)}.`,
        `Последняя рекомендация: ${currentAnalysis.candidateExpectedPoints.toFixed(2)} EP; база ${currentAnalysis.baselineExpectedPoints.toFixed(2)}. Потеря ${Math.max(0, currentAnalysis.expectedPointsLoss).toFixed(2)} / предел ${currentAnalysis.maxExpectedPointsLoss.toFixed(2)}.`)}</p>}
      <p className="text-xs text-slate-500"><I18nText en="Uses your current standing. XI and captain are evaluated per round; the bench contributes 0 EP without an autosub model. K is not a win probability." ru="Стратегия по текущему положению. Старт и капитан оцениваются отдельно для каждого тура; скамейка без автозамен даёт 0 EP. K не является вероятностью победы." /></p>
    </div>}
  </section>;
}
