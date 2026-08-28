"use client";

import { BarChart3, Layers3, ListChecks, Loader2, Settings, Users, type LucideIcon } from "lucide-react";
import Link, { useLinkStatus } from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";

import { I18nText } from "@/components/i18n-text";
import { cn } from "@/lib/cn";

const navItems = [
  { href: "/machete/leagues", icon: Layers3, label: <I18nText en="Leagues" ru="Лиги" /> },
  { href: "/machete/players", icon: BarChart3, label: <I18nText en="Players" ru="Игроки" /> },
  { href: "/machete/squad", icon: Users, label: <I18nText en="Squad" ru="Состав" /> },
  { href: "/machete/fpl/squad", icon: Users, label: <I18nText en="FPL" ru="FPL" /> },
  { href: "/machete/sync-jobs", icon: ListChecks, label: <I18nText en="Data jobs" ru="Задачи данных" /> },
  { href: "/machete/models", icon: Settings, label: <I18nText en="Model" ru="Модель" /> }
] as const;

export function MacheteShell({ children, compact = false }: { children: ReactNode; compact?: boolean }) {
  const pathname = usePathname();
  const router = useRouter();
  const workspaceNavigation = (
    <nav
      aria-labelledby="machete-workspace-nav-label"
      className={cn(
        "text-sm font-semibold",
        compact
          ? "hidden min-w-0 flex-1 gap-1.5 overflow-x-auto pb-1 sm:flex"
          : "grid grid-cols-3 gap-2 sm:flex sm:flex-wrap sm:overflow-visible lg:justify-end"
      )}
    >
      <span id="machete-workspace-nav-label" className="sr-only">
        <I18nText en="Machete workspace navigation" ru="Навигация рабочего пространства Machete" />
      </span>
      {navItems.map((item) => {
        const Icon = item.icon;
        const active = macheteNavItemIsActive(pathname, item.href);

        return (
          <Link
            key={item.href}
            href={item.href}
            prefetch={false}
            onPointerEnter={() => router.prefetch(item.href)}
            onFocus={() => router.prefetch(item.href)}
            aria-current={active ? "page" : undefined}
            className={cn(
              "inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-sm border sm:justify-start",
              compact ? "px-2.5 py-1.5" : "px-3 py-2",
              active
                ? "border-brand-600 bg-brand-50 text-brand-700"
                : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
            )}
          >
            <MacheteNavigationIcon icon={Icon} />
            <span className="whitespace-nowrap">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );

  return (
    <main
      className={cn(
        "mx-auto w-full px-4 sm:px-5 lg:px-6 2xl:px-8",
        compact
          ? "max-w-7xl pb-[calc(5.25rem+env(safe-area-inset-bottom))] pt-3 sm:py-4 2xl:max-w-[1760px] 3xl:max-w-[1920px] 3xl:px-10"
          : "max-w-7xl py-5 sm:py-7 2xl:max-w-[1600px] 3xl:max-w-[1760px]"
      )}
    >
      {compact ? (
        <div className="hidden min-w-0 items-center gap-3 border-b border-slate-200 pb-2.5 sm:flex">
          <span className="hidden shrink-0 text-xs font-semibold text-slate-500 sm:inline">Machete</span>
          {workspaceNavigation}
        </div>
      ) : (
        <div className="border-b border-slate-200 pb-3 sm:pb-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="kicker">Machete</p>
              <h1 className="mt-1 text-[clamp(24px,2.6vw,32px)] font-bold leading-[1.08] tracking-[-0.03em] text-ink">
                <I18nText en="FotMob data workspace" ru="Рабочее пространство FotMob" />
              </h1>
            </div>
            {workspaceNavigation}
          </div>
          <p className="mt-3 max-w-3xl text-xs leading-5 text-slate-600 sm:text-sm">
            <I18nText
              en="Shared FotMob data refreshes automatically at 03:00 Moscow time; admins manage ingestion from the admin panel."
              ru="Общие данные FotMob обновляются автоматически в 03:00 по Москве; ingestion управляется из админ-панели."
            />
          </p>
        </div>
      )}
      {children}
      {compact ? (
        <nav aria-labelledby="machete-mobile-nav-label" className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 pb-[env(safe-area-inset-bottom)] shadow-[0_-8px_24px_rgba(15,23,42,0.10)] backdrop-blur sm:hidden">
          <span id="machete-mobile-nav-label" className="sr-only"><I18nText en="Main Machete sections" ru="Основные разделы Machete" /></span>
          <div className="mx-auto grid max-w-lg grid-cols-4 px-1.5 py-1">
            {navItems.slice(0, 4).map((item) => {
              const Icon = item.icon;
              const active = macheteNavItemIsActive(pathname, item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  prefetch={false}
                  onPointerEnter={() => router.prefetch(item.href)}
                  onFocus={() => router.prefetch(item.href)}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "inline-flex min-h-14 flex-col items-center justify-center gap-0.5 rounded px-1 text-[11px] font-semibold",
                    active ? "bg-brand-50 text-brand-700" : "text-slate-600"
                  )}
                >
                  <MacheteNavigationIcon icon={Icon} />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </div>
        </nav>
      ) : null}
    </main>
  );
}

function macheteNavItemIsActive(pathname: string, href: string) {
  return pathname === href
    || pathname.startsWith(`${href}/`)
    || (href === "/machete/squad" && pathname.startsWith("/machete/franchise-squads"));
}

function MacheteNavigationIcon({ icon: Icon }: { icon: LucideIcon }) {
  const { pending } = useLinkStatus();
  return pending
    ? <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden="true" />
    : <Icon className="h-4 w-4 shrink-0" />;
}
