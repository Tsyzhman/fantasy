import { BarChart3, Layers3, ListChecks, Settings } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { I18nText } from "@/components/i18n-text";

export function MacheteShell({ children }: { children: ReactNode }) {
  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="flex flex-col gap-5 border-b border-slate-200 pb-6 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">Machete</p>
          <h1 className="mt-2 text-3xl font-bold text-ink">
            <I18nText en="FotMob data workspace" ru="Рабочее место данных FotMob" />
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-600">
            <I18nText
              en="Sync leagues, teams, fixtures and player snapshots from FotMob, then compare them with fantasy scoring."
              ru="Синхронизируйте лиги, команды, календарь и снапшоты игроков FotMob, затем сравнивайте их через fantasy scoring."
            />
          </p>
        </div>
        <nav className="flex flex-wrap gap-2 text-sm font-semibold">
          <Link className="inline-flex items-center gap-2 rounded border border-slate-200 bg-white px-3 py-2 text-slate-700 hover:bg-slate-50" href="/machete/leagues">
            <Layers3 className="h-4 w-4" />
            <I18nText en="Leagues" ru="Лиги" />
          </Link>
          <Link className="inline-flex items-center gap-2 rounded border border-slate-200 bg-white px-3 py-2 text-slate-700 hover:bg-slate-50" href="/machete/sync-jobs">
            <ListChecks className="h-4 w-4" />
            <I18nText en="Sync jobs" ru="Синхронизации" />
          </Link>
          <Link className="inline-flex items-center gap-2 rounded border border-slate-200 bg-white px-3 py-2 text-slate-700 hover:bg-slate-50" href="/machete/players">
            <BarChart3 className="h-4 w-4" />
            <I18nText en="Players" ru="Игроки" />
          </Link>
          <Link className="inline-flex items-center gap-2 rounded border border-slate-200 bg-white px-3 py-2 text-slate-700 hover:bg-slate-50" href="/machete/models">
            <Settings className="h-4 w-4" />
            <I18nText en="Model" ru="Модель" />
          </Link>
        </nav>
      </div>
      {children}
    </main>
  );
}
