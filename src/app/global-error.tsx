"use client";

import { I18nText } from "@/components/i18n-text";
import { useEffect } from "react";

import { reportClientCriticalError } from "@/monitoring/report-client-critical-error";

import "./globals.css";

export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    reportClientCriticalError("REACT_ERROR_BOUNDARY");
  }, []);

  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <main className="mx-auto flex min-h-screen max-w-3xl items-center px-4 py-12 sm:px-6 lg:px-8">
          <section className="ui-card w-full border-rose-200 p-6">
            <p className="kicker text-rose-700">
              <I18nText en="Application error" ru="Ошибка приложения" />
            </p>
            <h1 className="mt-2 text-2xl font-bold tracking-tight text-ink">
              <I18nText en="Fantasy Scout needs to reload this view." ru="Fantasy Scout нужно перезагрузить этот экран." />
            </h1>
            <p className="mt-3 max-w-[56ch] text-sm leading-6 text-slate-600">
              <I18nText
                en="The app shell failed before the page could finish rendering."
                ru="Оболочка приложения сломалась до завершения отрисовки страницы."
              />
            </p>
            <button
              type="button"
              onClick={() => reset()}
              className="ui-button ui-button-primary mt-5"
            >
              <I18nText en="Reload" ru="Перезагрузить" />
            </button>
          </section>
        </main>
      </body>
    </html>
  );
}
