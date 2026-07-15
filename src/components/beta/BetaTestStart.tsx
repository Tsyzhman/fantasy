"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { I18nText } from "@/components/i18n-text";
import { localizedText, useLanguage } from "@/components/localized-option";
import { getBetaTestSession, startBetaTestSession, type StoredBetaTestSession } from "@/lib/beta-telemetry-client";

export function BetaTestStart({ synthetic }: { synthetic: boolean }) {
  const language = useLanguage();
  const router = useRouter();
  const [session, setSession] = useState<StoredBetaTestSession | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const handle = window.setTimeout(() => setSession(getBetaTestSession()), 0);
    return () => window.clearTimeout(handle);
  }, []);

  async function start() {
    setPending(true);
    setError(null);
    try {
      const nextSession = await startBetaTestSession({ synthetic });
      setSession(nextSession);
      router.push("/machete/players");
    } catch {
      setError(localizedText(language, "Could not start the beta test. Ask the moderator to check the server.", "Не удалось начать beta-тест. Попросите модератора проверить сервер."));
      setPending(false);
    }
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-soft">
      <p className="text-sm font-semibold uppercase tracking-wide text-emerald-700"><I18nText en="Closed beta measurement" ru="Измерение закрытой beta" /></p>
      <h1 className="mt-2 text-3xl font-bold text-ink"><I18nText en="Start a moderated test run" ru="Начать модерируемый прогон" /></h1>
      <div className="mt-4 space-y-3 text-sm leading-6 text-slate-600">
        <p><I18nText en="The five-minute timer starts only after you press the button. The moderator gives the task separately; this page does not reveal the next steps." ru="Пятиминутный таймер запускается только после нажатия кнопки. Задание отдельно даёт модератор; эта страница не подсказывает следующие шаги." /></p>
        <p><I18nText en="The app records an opaque run ID, page paths, required journey milestones, device class, Web Vitals, and coarse client-error categories. It does not record search text, typed content, email, or name in the report." ru="Приложение записывает непрозрачный ID прогона, пути страниц, контрольные этапы сценария, класс устройства, Web Vitals и категории клиентских ошибок. Поисковый текст, введённые данные, email и имя в отчёт не записываются." /></p>
        <p><I18nText en="Completion is not accepted automatically: the moderator must separately confirm validity, no assistance, transfer understanding, usability rating, and critical issues." ru="Прохождение не принимается автоматически: модератор отдельно подтверждает валидность, отсутствие помощи, понимание трансфера, оценку удобства и критические проблемы." /></p>
      </div>
      {session ? (
        <div className="mt-5 rounded border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950" role="status">
          <I18nText en={`A run is already active: ${session.runId.slice(0, 8)}. Continue it in the same tab.`} ru={`Прогон уже активен: ${session.runId.slice(0, 8)}. Продолжайте в этой же вкладке.`} />
        </div>
      ) : null}
      {error ? <p className="mt-4 rounded border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800" role="alert">{error}</p> : null}
      <div className="mt-6 flex flex-wrap gap-3">
        <button type="button" onClick={() => void start()} disabled={pending || Boolean(session)} className="rounded bg-emerald-700 px-5 py-3 font-semibold text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-60">
          {pending ? <I18nText en="Starting..." ru="Запуск..." /> : <I18nText en="Consent and start timer" ru="Согласиться и запустить таймер" />}
        </button>
        {session ? (
          <button type="button" onClick={() => router.push("/machete/players")} className="rounded border border-slate-300 bg-white px-5 py-3 font-semibold text-slate-700 hover:bg-slate-50">
            <I18nText en="Continue run" ru="Продолжить прогон" />
          </button>
        ) : null}
      </div>
      {synthetic ? <p className="mt-4 text-xs font-semibold text-amber-700"><I18nText en="Synthetic QA mode: this run is permanently excluded from the user gate." ru="Синтетический QA-режим: этот прогон навсегда исключён из пользовательского gate." /></p> : null}
    </section>
  );
}
