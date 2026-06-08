"use client";

import { I18nText } from "@/components/i18n-text";

export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <main className="mx-auto flex min-h-screen max-w-3xl items-center px-4 py-12 sm:px-6 lg:px-8">
          <section className="w-full rounded border border-rose-200 bg-white p-6 shadow-soft">
            <p className="text-sm font-semibold uppercase tracking-wide text-rose-700">
              <I18nText en="Application error" ru="Ошибка приложения" />
            </p>
            <h1 className="mt-2 text-2xl font-bold text-ink">
              <I18nText en="Fantasy Scout needs to reload this view." ru="Fantasy Scout нужно перезагрузить этот экран." />
            </h1>
            <p className="mt-3 text-sm text-slate-600">
              <I18nText
                en="The app shell failed before the page could finish rendering."
                ru="Оболочка приложения сломалась до завершения отрисовки страницы."
              />
            </p>
            <button
              type="button"
              onClick={() => reset()}
              className="btn-brand mt-5 inline-flex items-center justify-center rounded px-4 py-2 text-sm font-semibold"
            >
              <I18nText en="Reload" ru="Перезагрузить" />
            </button>
          </section>
        </main>
      </body>
    </html>
  );
}
