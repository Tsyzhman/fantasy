"use client";

import { BarChart3, Layers3, Loader2, Users, type LucideIcon } from "lucide-react";
import Link, { useLinkStatus } from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";

import { I18nText } from "@/components/i18n-text";
import { SectionCrumb, type SectionCrumbItem } from "@/components/section-crumb";
import { cn } from "@/lib/cn";

const mobileItems = [
  { href: "/machete/leagues", icon: Layers3, label: <I18nText en="Leagues" ru="Лиги" /> },
  { href: "/machete/players", icon: BarChart3, label: <I18nText en="Players" ru="Игроки" /> },
  { href: "/machete/squad", icon: Users, label: <I18nText en="Squad" ru="Состав" /> },
  { href: "/machete/fpl/squad", icon: Users, label: <I18nText en="FPL" ru="FPL" /> }
] as const;

export function MacheteShell({
  children,
  compact = false,
  tools,
  section,
  parent
}: {
  children: ReactNode;
  compact?: boolean;
  tools?: ReactNode;
  section?: ReactNode;
  parent?: SectionCrumbItem;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const current = sectionFromPath(pathname);
  const items: SectionCrumbItem[] = [
    { label: "Machete", href: "/machete/leagues" },
    ...(parent ? [parent] : []),
    { label: section ?? current.label }
  ];
  const scheduleNote = pathname === "/machete/leagues" && !section
    ? <I18nText en="FotMob refresh at 03:00 Moscow time" ru="обновление в 03:00 МСК" />
    : null;

  return (
    <main
      className={cn(
        "mx-auto w-full px-4 sm:px-5 lg:px-6 2xl:px-8",
        compact
          ? "max-w-7xl pb-[calc(5.25rem+env(safe-area-inset-bottom))] pt-3 sm:pb-4 sm:pt-3 2xl:max-w-[1760px] 3xl:max-w-[1920px] 3xl:px-10"
          : "max-w-7xl py-4 sm:py-5 2xl:max-w-[1600px] 3xl:max-w-[1760px]"
      )}
    >
      <SectionCrumb items={items} tools={tools} note={scheduleNote} />
      {children}
      {compact ? (
        <nav aria-labelledby="machete-mobile-nav-label" className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white pb-[env(safe-area-inset-bottom)] sm:hidden">
          <span id="machete-mobile-nav-label" className="sr-only"><I18nText en="Main Machete sections" ru="Основные разделы Machete" /></span>
          <div className="mx-auto grid max-w-lg grid-cols-4 px-1.5 py-1">
            {mobileItems.map((item) => {
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

function sectionFromPath(pathname: string) {
  if (pathname.startsWith("/machete/khl")) return { label: <I18nText en="KHL" ru="КХЛ" /> };
  if (pathname.startsWith("/machete/fpl")) return { label: <I18nText en="FPL" ru="FPL" /> };
  if (pathname.startsWith("/machete/squad") || pathname.startsWith("/machete/franchise-squads")) return { label: <I18nText en="Squad" ru="Состав" /> };
  if (pathname.startsWith("/machete/players")) return { label: <I18nText en="Players" ru="Игроки" /> };
  if (pathname.startsWith("/machete/sync-jobs")) return { label: <I18nText en="Data jobs" ru="Задачи данных" /> };
  if (pathname.startsWith("/machete/models")) return { label: <I18nText en="Model" ru="Модель" /> };
  return { label: <I18nText en="Leagues" ru="Лиги" /> };
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
