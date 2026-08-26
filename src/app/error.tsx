"use client";

import { RotateCcw } from "lucide-react";
import { useEffect } from "react";

import { I18nText } from "@/components/i18n-text";
import { reportClientCriticalError } from "@/monitoring/report-client-critical-error";

export default function Error({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    reportClientCriticalError("REACT_ERROR_BOUNDARY");
  }, []);

  return (
    <main className="mx-auto flex min-h-[calc(100vh-5rem)] max-w-3xl items-center px-4 py-12 sm:px-6 lg:px-8">
      <section className="ui-card w-full border-rose-200 p-6">
        <p className="kicker text-rose-700">
          <I18nText en="Something went wrong" ru="Что-то пошло не так" />
        </p>
        <h1 className="mt-2 text-2xl font-bold tracking-tight text-ink">
          <I18nText en="This screen could not be loaded." ru="Этот экран не удалось загрузить." />
        </h1>
        <p className="mt-3 max-w-[56ch] text-sm leading-6 text-slate-600">
          <I18nText
            en="Try loading it again. If the error repeats, the latest action may need a server check."
            ru="Попробуйте загрузить его снова. Если ошибка повторится, последнее действие может требовать проверки сервера."
          />
        </p>
        <button
          type="button"
          onClick={() => reset()}
          className="ui-button ui-button-primary mt-5"
        >
          <RotateCcw className="h-4 w-4" />
          <I18nText en="Try again" ru="Повторить" />
        </button>
      </section>
    </main>
  );
}
