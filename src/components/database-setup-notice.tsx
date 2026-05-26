import { I18nText } from "@/components/i18n-text";

const localSetupCommands = ["copy .env.example .env", "docker compose up -d postgres", "npm run prisma:push", "npm run db:seed", "npm run dev"];

export function DatabaseSetupNotice() {
  return (
    <main className="grid min-h-screen place-items-center px-4 py-12">
      <section className="w-full max-w-lg rounded border border-amber-200 bg-amber-50 p-6 shadow-sm">
        <p className="text-sm font-semibold uppercase tracking-wide text-amber-700">Fantasy Scout</p>
        <h1 className="mt-2 text-2xl font-bold text-ink">
          <I18nText en="Database is not configured" ru="База данных не настроена" />
        </h1>
        <p className="mt-3 text-sm leading-6 text-amber-900">
          <I18nText
            en={
              <>
                Set <code className="rounded bg-white/70 px-1 py-0.5 font-mono text-xs">DATABASE_URL</code> in <code className="rounded bg-white/70 px-1 py-0.5 font-mono text-xs">.env</code>, then restart the dev server.
              </>
            }
            ru={
              <>
                Укажите <code className="rounded bg-white/70 px-1 py-0.5 font-mono text-xs">DATABASE_URL</code> в <code className="rounded bg-white/70 px-1 py-0.5 font-mono text-xs">.env</code>, затем перезапустите dev-сервер.
              </>
            }
          />
        </p>
        <ol className="mt-4 list-decimal space-y-2 pl-5 text-sm text-amber-950">
          {localSetupCommands.map((command) => (
            <li key={command}>
              <code className="rounded bg-white/80 px-1.5 py-0.5 font-mono text-xs">{command}</code>
            </li>
          ))}
        </ol>
      </section>
    </main>
  );
}
