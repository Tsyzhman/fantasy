import Link from "next/link";

import { I18nText } from "@/components/i18n-text";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-[calc(100vh-5rem)] max-w-3xl items-center px-4 py-12 sm:px-6 lg:px-8">
      <section className="ui-card w-full p-6">
        <p className="kicker">404</p>
        <h1 className="mt-2 text-2xl font-bold tracking-tight text-ink">
          <I18nText en="Page not found" ru="Страница не найдена" />
        </h1>
        <p className="mt-3 max-w-[56ch] text-sm leading-6 text-slate-600">
          <I18nText en="The requested page is not available or the link is outdated." ru="Запрошенная страница недоступна или ссылка устарела." />
        </p>
        <Link href="/" className="ui-button ui-button-primary mt-5">
          <I18nText en="Open dashboard" ru="Открыть дашборд" />
        </Link>
      </section>
    </main>
  );
}
