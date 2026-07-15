"use client";

import { useReportWebVitals } from "next/web-vitals";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import { betaWebVitalNames, betaWebVitalRatings, type BetaWebVitalName, type BetaWebVitalRating } from "@/beta/user-test";
import { I18nText } from "@/components/i18n-text";
import {
  betaSessionChangedEvent,
  betaSessionHasMilestone,
  flushBetaTelemetry,
  getBetaTestSession,
  recordBetaClientError,
  recordBetaPageView,
  recordBetaWebVital,
  stopBetaTestSession,
  type StoredBetaTestSession
} from "@/lib/beta-telemetry-client";

export function BetaTelemetryReporter() {
  const pathname = usePathname();
  const [session, setSession] = useState<StoredBetaTestSession | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const runId = session?.runId ?? null;

  useReportWebVitals((metric) => {
    if (!betaWebVitalNames.includes(metric.name as never) || !betaWebVitalRatings.includes(metric.rating as never)) return;
    void recordBetaWebVital(metric.name as BetaWebVitalName, metric.value, metric.rating as BetaWebVitalRating, pathname);
  });

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
  const completed = betaSessionHasMilestone("SQUAD_RESTORED");
  return (
    <aside className="fixed bottom-3 left-3 right-3 z-50 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-emerald-300 bg-emerald-950 px-4 py-3 text-sm text-white shadow-xl sm:left-auto sm:max-w-lg" aria-labelledby="beta-telemetry-status">
      <div role="status" aria-live="polite">
        <p id="beta-telemetry-status" className="font-semibold">
          <I18nText
            en={`${completed ? "Beta run recorded" : "Beta run is recording"} · ${session.runId.slice(0, 8)}`}
            ru={`${completed ? "Beta-прогон записан" : "Beta-прогон записывается"} · ${session.runId.slice(0, 8)}`}
          />
        </p>
        <p className="text-xs text-emerald-100 num-tabular">
          <I18nText en={`Elapsed: ${formatElapsed(elapsedSeconds)}`} ru={`Прошло: ${formatElapsed(elapsedSeconds)}`} />
        </p>
      </div>
      <button type="button" onClick={() => void stopBetaTestSession()} className="rounded border border-emerald-200 px-3 py-2 text-xs font-semibold hover:bg-emerald-900">
        <I18nText en="Stop recording" ru="Остановить запись" />
      </button>
    </aside>
  );
}

function formatElapsed(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60).toString().padStart(2, "0");
  const seconds = (totalSeconds % 60).toString().padStart(2, "0");
  return `${minutes}:${seconds}`;
}
