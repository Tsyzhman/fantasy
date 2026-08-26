import { I18nText } from "@/components/i18n-text";

export default function Loading() {
  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8 2xl:max-w-[1600px] 3xl:max-w-[1760px]">
      <section className="ui-card p-5">
        <div className="h-4 w-36 rounded bg-slate-100" />
        <div className="mt-4 h-8 w-full max-w-xl rounded bg-slate-100" />
        <div className="mt-6 grid gap-3 md:grid-cols-3">
          <div className="h-28 rounded border border-slate-200 bg-field" />
          <div className="h-28 rounded border border-slate-200 bg-field" />
          <div className="h-28 rounded border border-slate-200 bg-field" />
        </div>
        <p className="mt-5 text-sm font-medium text-slate-500">
          <I18nText en="Loading data..." ru="Загружаем данные..." />
        </p>
      </section>
    </main>
  );
}
