"use client";

import { BarChart3, Layers3, ListChecks, Settings, Users } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import { I18nText } from "@/components/i18n-text";
import { cn } from "@/lib/cn";

const navItems = [
  { href: "/machete/leagues", icon: Layers3, label: <I18nText en="Leagues" ru="Лиги" /> },
  { href: "/machete/players", icon: BarChart3, label: <I18nText en="Players" ru="Игроки" /> },
  { href: "/machete/squad", icon: Users, label: <I18nText en="Squad" ru="Состав" /> },
  { href: "/machete/sync-jobs", icon: ListChecks, label: <I18nText en="Data jobs" ru="Задачи данных" /> },
  { href: "/machete/models", icon: Settings, label: <I18nText en="Model" ru="Модель" /> }
] as const;

export function MacheteShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  return (
    <main className="mx-auto max-w-7xl px-4 py-7 sm:px-6 lg:px-8">
      <div className="border-b border-slate-200 pb-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">Machete</p>
            <h1 className="mt-1 text-2xl font-bold text-ink sm:text-3xl">
              <I18nText en="FotMob data workspace" ru="Рабочее пространство FotMob" />
            </h1>
          </div>
          <nav aria-labelledby="machete-workspace-nav-label" className="flex gap-2 overflow-x-auto pb-1 text-sm font-semibold lg:flex-wrap lg:justify-end lg:overflow-visible lg:pb-0">
            <span id="machete-workspace-nav-label" className="sr-only">
              <I18nText en="Machete workspace navigation" ru="Навигация рабочего пространства Machete" />
            </span>
            {navItems.map((item) => {
              const Icon = item.icon;
              const active = pathname === item.href || pathname.startsWith(`${item.href}/`);

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "inline-flex shrink-0 items-center gap-2 rounded border px-3 py-2",
                    active
                      ? "border-ink bg-ink text-white"
                      : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>
        <p className="mt-3 max-w-3xl text-sm text-slate-600">
          <I18nText
            en="Shared FotMob data refreshes automatically at 03:00 Moscow time; admins manage ingestion from the admin panel."
            ru="Общие данные FotMob обновляются автоматически в 03:00 по Москве; ingestion управляется из админ-панели."
          />
        </p>
      </div>
      {children}
    </main>
  );
}
