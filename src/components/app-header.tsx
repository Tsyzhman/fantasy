"use client";

import { Crosshair, DatabaseZap, Layers3, Menu, ShieldCheck, UserRound, Users } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";

import { CommandPalette } from "@/components/command-palette";
import { I18nText } from "@/components/i18n-text";
import { LanguageToggle } from "@/components/language-toggle";
import { localizedText, useLanguage } from "@/components/localized-option";
import { ModeBrand } from "@/components/mode-brand";
import { ModeLeaguesLink } from "@/components/mode-leagues-link";
import { ModePlayersLink } from "@/components/mode-players-link";
import { ModeSwitchLink } from "@/components/mode-switch-link";
import { ModelSettingsLink } from "@/components/model-settings-link";
import { ThemeToggle } from "@/components/theme-toggle";
import { betaSessionHasMilestone, discardBetaTestSession, finishBetaTestSession, stopBetaTestSession } from "@/lib/beta-telemetry-client";
import { cn } from "@/lib/cn";

type AppHeaderProps = {
  user?: HeaderUser | null;
};

type HeaderUser = {
  email: string;
  name: string | null;
  role: string;
};

export function AppHeader({ user }: AppHeaderProps) {
  const language = useLanguage();
  const pathname = usePathname();
  const router = useRouter();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const isHome = pathname === "/";
  const isPublicAuthPage = pathname === "/login" || pathname === "/setup";
  const isAdmin = pathname.startsWith("/admin");
  const isMixerr = pathname.startsWith("/mixerr");

  async function logout() {
    const telemetryStopped = betaSessionHasMilestone("SQUAD_RESTORED")
      ? await finishBetaTestSession()
      : await stopBetaTestSession();
    if (!telemetryStopped) {
      const discardAndLogout = window.confirm(localizedText(
        language,
        "The active beta run has not been sent. Press Cancel to keep it and retry, or OK to discard its local queue and sign out anyway.",
        "Активный beta-прогон не отправлен. Нажмите «Отмена», чтобы сохранить его и повторить, или OK, чтобы удалить локальную очередь и выйти."
      ));
      if (!discardAndLogout) return;
      discardBetaTestSession();
    }
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  if (isPublicAuthPage) return null;

  if (isHome) {
    return (
      <header className="absolute inset-x-0 top-0 z-10">
        <div className="mx-auto flex max-w-7xl justify-end px-4 py-4 sm:px-6 lg:px-8">
          <nav
            aria-label={localizedText(language, "Global navigation", "Глобальная навигация")}
            className="flex items-center gap-2 text-sm font-medium text-slate-600"
          >
            <HeaderLink href="/mixerr" hoverClassName="hover:bg-white/70" icon={<Crosshair className="h-4 w-4" />}>
              <I18nText en="MiXerr" ru="Миксер" />
            </HeaderLink>
            <CommandPalette showAdmin={user?.role === "ADMIN"} />
            <LanguageToggle />
            <ThemeToggle />
          </nav>
        </div>
      </header>
    );
  }

  const navigationProps = { isAdmin, isMixerr, pathname, user, logout };

  return (
    <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur">
      <div className="relative mx-auto flex min-h-14 min-w-0 max-w-7xl items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
        <ModeBrand />
        <button
          type="button"
          aria-controls="global-navigation"
          aria-expanded={mobileMenuOpen}
          onClick={() => setMobileMenuOpen((isOpen) => !isOpen)}
          className="ui-button text-sm xl:hidden"
        >
          <Menu className="h-4 w-4" aria-hidden="true" />
          <I18nText en="Menu" ru="Меню" />
        </button>
        <nav
          id="global-navigation"
          aria-label={localizedText(language, "Global navigation", "Глобальная навигация")}
          onClick={() => setMobileMenuOpen(false)}
          onKeyDown={(event) => {
            if (event.key === "Escape") setMobileMenuOpen(false);
          }}
          className={cn(
            mobileMenuOpen ? "grid" : "hidden",
            "ui-surface-elevated absolute right-4 top-full z-30 mt-1 max-h-[calc(100vh-5rem)] w-[min(21rem,calc(100vw-2rem))] grid-cols-1 gap-1 overflow-y-auto p-2 text-sm font-medium text-slate-600 [@supports(height:100dvh)]:max-h-[calc(100dvh-5rem)] sm:right-6 sm:grid-cols-2 [&_a]:justify-start [&_button:not([data-icon-button])]:justify-start",
            "xl:static xl:mt-0 xl:flex xl:max-h-none xl:w-auto xl:flex-wrap xl:items-center xl:justify-end xl:overflow-visible xl:border-0 xl:bg-transparent xl:p-0 xl:shadow-none"
          )}
        >
          <HeaderNavigationItems {...navigationProps} />
        </nav>
      </div>
    </header>
  );
}

function HeaderNavigationItems({
  isAdmin,
  isMixerr,
  pathname,
  user,
  logout
}: {
  isAdmin: boolean;
  isMixerr: boolean;
  pathname: string;
  user?: HeaderUser | null;
  logout: () => Promise<void>;
}) {
  const language = useLanguage();

  return (
    <>
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
          <span className="mx-1 hidden h-6 w-px bg-slate-200 xl:block" />
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
      <CommandPalette showAdmin={user?.role === "ADMIN" || isAdmin} />
      {user ? (
        <>
          <HeaderLink href="/profile" active={pathname === "/profile"} icon={<UserRound className="h-4 w-4" />}>
            <I18nText en="Profile" ru="Профиль" />
          </HeaderLink>
          <button
            type="button"
            onClick={logout}
            className="shrink-0 rounded px-3 py-2 text-slate-600 hover:bg-slate-100"
            aria-label={localizedText(language, `Sign out ${user.name ?? user.email}`, `Выйти: ${user.name ?? user.email}`)}
          >
            <I18nText en="Sign out" ru="Выйти" />
          </button>
        </>
      ) : null}
      <LanguageToggle />
      <ThemeToggle />
    </>
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
