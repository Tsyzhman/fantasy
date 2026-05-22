"use client";

import { Crosshair, DatabaseZap, Layers3, ShieldCheck, Users } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";

import { I18nText } from "@/components/i18n-text";
import { LanguageToggle } from "@/components/language-toggle";
import { ModeBrand } from "@/components/mode-brand";
import { ModeLeaguesLink } from "@/components/mode-leagues-link";
import { ModePlayersLink } from "@/components/mode-players-link";
import { ModeSwitchLink } from "@/components/mode-switch-link";
import { ModelSettingsLink } from "@/components/model-settings-link";
import { ThemeToggle } from "@/components/theme-toggle";
import { cn } from "@/lib/cn";

type AppHeaderProps = {
  user?: {
    email: string;
    name: string | null;
    role: string;
  } | null;
};

export function AppHeader({ user }: AppHeaderProps) {
  const pathname = usePathname();
  const router = useRouter();
  const isHome = pathname === "/";
  const isPublicAuthPage = pathname === "/login" || pathname === "/setup";
  const isAdmin = pathname.startsWith("/admin");
  const isMixerr = pathname.startsWith("/mixerr");

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  if (isPublicAuthPage) return null;

  if (isHome) {
    return (
      <header className="absolute inset-x-0 top-0 z-10">
        <div className="mx-auto flex max-w-7xl justify-end px-4 py-4 sm:px-6 lg:px-8">
          <nav className="flex items-center gap-2 text-sm font-medium text-slate-600">
            <HeaderLink href="/mixerr" hoverClassName="hover:bg-white/70" icon={<Crosshair className="h-4 w-4" />}>
              <I18nText en="MiXerr" ru="Миксер" />
            </HeaderLink>
            <LanguageToggle />
            <ThemeToggle />
          </nav>
        </div>
      </header>
    );
  }

  return (
    <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/88 backdrop-blur">
      <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-3 sm:px-6 md:flex-row md:items-center md:justify-between lg:px-8">
        <ModeBrand />
        <nav className="flex w-full items-center gap-2 overflow-x-auto pb-1 text-sm font-medium text-slate-600 md:w-auto md:flex-wrap md:justify-end md:overflow-visible md:pb-0">
          {isAdmin ? (
            <>
              <HeaderLink href="/machete/leagues" icon={<Layers3 className="h-4 w-4" />}>
                Machete
              </HeaderLink>
              <HeaderLink href="/baltika/leagues" icon={<Layers3 className="h-4 w-4" />}>
                <I18nText en="Baltika" ru="Балтика" />
              </HeaderLink>
              <HeaderLink href="/mixerr" icon={<Crosshair className="h-4 w-4" />}>
                <I18nText en="MiXerr" ru="Миксер" />
              </HeaderLink>
              <span className="mx-1 hidden h-6 w-px bg-slate-200 sm:block" />
              <HeaderLink href="/admin/ingestion" active={pathname.startsWith("/admin/ingestion")} icon={<DatabaseZap className="h-4 w-4" />}>
                <I18nText en="Ingestion" ru="Загрузка" />
              </HeaderLink>
              <HeaderLink href="/admin/users" active={pathname.startsWith("/admin/users")} icon={<Users className="h-4 w-4" />}>
                <I18nText en="Users" ru="Пользователи" />
              </HeaderLink>
            </>
          ) : (
            <>
              <ModeLeaguesLink />
              <ModePlayersLink />
              {isMixerr ? (
                <>
                  <HeaderLink href="/machete/leagues">Machete</HeaderLink>
                  <HeaderLink href="/baltika/leagues">
                    <I18nText en="Baltika" ru="Балтика" />
                  </HeaderLink>
                </>
              ) : (
                <HeaderLink href="/mixerr" icon={<Crosshair className="h-4 w-4" />}>
                  <I18nText en="MiXerr" ru="Миксер" />
                </HeaderLink>
              )}
              <ModeSwitchLink />
              <ModelSettingsLink />
              {user?.role === "ADMIN" ? (
                <HeaderLink href="/admin/ingestion" icon={<ShieldCheck className="h-4 w-4" />}>
                  <I18nText en="Admin" ru="Админ" />
                </HeaderLink>
              ) : null}
            </>
          )}
          {user ? (
            <button
              type="button"
              onClick={logout}
              className="shrink-0 rounded px-3 py-2 text-slate-600 hover:bg-slate-100"
              title={user.name ?? user.email}
            >
              <I18nText en="Sign out" ru="Выйти" />
            </button>
          ) : null}
          <LanguageToggle />
          <ThemeToggle />
        </nav>
      </div>
    </header>
  );
}

function HeaderLink({
  href,
  active = false,
  icon,
  hoverClassName = "hover:bg-slate-100",
  children
}: {
  href: string;
  active?: boolean;
  icon?: ReactNode;
  hoverClassName?: string;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn("inline-flex shrink-0 items-center gap-2 rounded px-3 py-2", active ? "bg-slate-100 text-ink" : "text-slate-600", hoverClassName)}
    >
      {icon}
      {children}
    </Link>
  );
}
