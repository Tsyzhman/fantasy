"use client";

import { useReportWebVitals } from "next/web-vitals";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { betaWebVitalNames, betaWebVitalRatings, type BetaWebVitalName, type BetaWebVitalRating } from "@/beta/user-test";
import { I18nText } from "@/components/i18n-text";
import { localizedText, useLanguage } from "@/components/localized-option";
import {
  betaSessionChangedEvent,
  betaSessionHasMilestone,
  betaSessionHasRecordedMilestone,
  discardBetaTestSession,
  finishBetaTestSession,
  flushBetaTelemetry,
  getBetaTestSession,
  recordBetaClientError,
  recordBetaPageView,
  recordBetaWebVital,
  rememberBetaTestSubmissionReceipt,
  stopBetaTestSession,
  type StoredBetaTestSession
} from "@/lib/beta-telemetry-client";

export function BetaTelemetryReporter() {
  const language = useLanguage();
  const pathname = usePathname();
  const [session, setSession] = useState<StoredBetaTestSession | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [ending, setEnding] = useState(false);
  const [endError, setEndError] = useState<string | null>(null);
  const runId = session?.runId ?? null;

  const reportWebVital = useCallback((metric: Parameters<Parameters<typeof useReportWebVitals>[0]>[0]) => {
    if (!betaWebVitalNames.includes(metric.name as never) || !betaWebVitalRatings.includes(metric.rating as never)) return;
    void recordBetaWebVital(metric.name as BetaWebVitalName, metric.value, metric.rating as BetaWebVitalRating);
  }, []);

  useReportWebVitals(reportWebVital);

  useEffect(() => {
    const refresh = () => setSession(getBetaTestSession());
    const online = () => void flushBetaTelemetry();
    const windowError = () => void recordBetaClientError("WINDOW_ERROR");
    const rejection = () => void recordBetaClientError("UNHANDLED_REJECTION");
    refresh();
    window.addEventListener(betaSessionChangedEvent, refresh);
    window.addEventListener("online", online);
    window.addEventListener("error", windowError);
    window.addEventListener("unhandledrejection", rejection);
    return () => {
      window.removeEventListener(betaSessionChangedEvent, refresh);
      window.removeEventListener("online", online);
      window.removeEventListener("error", windowError);
      window.removeEventListener("unhandledrejection", rejection);
    };
  }, []);

  useEffect(() => {
    if (!runId) return;
    void recordBetaPageView(pathname);
    void flushBetaTelemetry();
  }, [pathname, runId]);

  useEffect(() => {
    if (!session) return;
    const interval = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(interval);
  }, [session]);

  if (!session) return null;
  const elapsedSeconds = Math.max(0, Math.floor((now - session.startedAt) / 1_000));
  const completionReached = betaSessionHasMilestone("SQUAD_RESTORED");
  const completed = betaSessionHasRecordedMilestone("SQUAD_RESTORED");

  async function endRun() {
    if (!runId) return;
    if (!completionReached) {
      const confirmed = window.confirm(localizedText(
        language,
        "Abort this beta run? The moderator will see it as incomplete.",
        "Прервать beta-прогон? Модератор увидит его как незавершённый."
      ));
      if (!confirmed) return;
    }
    setEnding(true);
    setEndError(null);
    try {
      const sent = completionReached ? await finishBetaTestSession() : await stopBetaTestSession();
      if (sent) {
        if (completionReached) {
          rememberBetaTestSubmissionReceipt(runId);
          window.location.assign("/beta-test");
        }
        return;
      }
      setEndError(localizedText(
        language,
        "The run has not been sent yet. Check the connection and try again.",
        "Прогон ещё не отправлен. Проверьте подключение и повторите."
      ));
    } catch {
      setEndError(localizedText(
        language,
        "The run could not be sent. Your progress is kept; check the connection and try again.",
        "Не удалось отправить прогон. Данные сохранены; проверьте подключение и повторите."
      ));
    } finally {
      setEnding(false);
    }
  }

  function discardRun() {
    const confirmed = window.confirm(localizedText(
      language,
      "Discard the unsent local beta queue? Unsent data will be deleted; observations already accepted by the server will remain. This cannot be undone.",
      "Удалить неотправленную локальную очередь beta-прогона? Неотправленные данные будут удалены; уже принятые сервером наблюдения сохранятся. Отменить это нельзя."
    ));
    if (confirmed) discardBetaTestSession();
  }

  return (
    <aside className="fixed bottom-[calc(0.75rem+env(safe-area-inset-bottom))] left-[calc(0.75rem+env(safe-area-inset-left))] right-[calc(0.75rem+env(safe-area-inset-right))] z-50 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-emerald-300 bg-emerald-950 px-4 py-3 text-sm text-white shadow-xl sm:left-auto sm:max-w-lg" aria-labelledby="beta-telemetry-status">
      <div role="status" aria-live="polite">
        <p id="beta-telemetry-status" className="font-semibold">
          <I18nText
            en={`${completed ? "Beta run is ready to submit" : completionReached ? "Beta completion is sending" : "Beta run is recording"} · ${session.runId.slice(0, 8)}`}
            ru={`${completed ? "Beta-прогон готов к отправке" : completionReached ? "Завершение beta-прогона отправляется" : "Beta-прогон записывается"} · ${session.runId.slice(0, 8)}`}
          />
        </p>
        <p className="text-xs text-emerald-100 num-tabular">
          <I18nText en={`Elapsed: ${formatElapsed(elapsedSeconds)}`} ru={`Прошло: ${formatElapsed(elapsedSeconds)}`} />
        </p>
      </div>
      <div className="flex flex-col items-stretch gap-2 sm:items-end">
        <button type="button" disabled={ending} onClick={() => void endRun()} className="rounded border border-emerald-200 px-3 py-2 text-xs font-semibold hover:bg-emerald-900 disabled:cursor-wait disabled:opacity-60 [@media(pointer:coarse)]:min-h-11 [@media(pointer:coarse)]:text-sm">
          {ending
            ? <I18nText en="Sending..." ru="Отправляем..." />
            : completionReached
              ? <I18nText en="Finish and submit" ru="Завершить и отправить" />
              : <I18nText en="Abort run" ru="Прервать прогон" />}
        </button>
        {endError ? <p className="max-w-xs text-xs text-rose-200" role="alert">{endError}</p> : null}
        {endError ? (
          <button type="button" onClick={discardRun} className="text-left text-xs font-semibold text-rose-200 underline underline-offset-2 sm:text-right">
            <I18nText en="Discard unsent local run" ru="Удалить неотправленный локальный прогон" />
          </button>
        ) : null}
      </div>
    </aside>
  );
}

function formatElapsed(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60).toString().padStart(2, "0");
  const seconds = (totalSeconds % 60).toString().padStart(2, "0");
  return `${minutes}:${seconds}`;
}
