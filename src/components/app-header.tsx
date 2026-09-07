"use client";

import { Crosshair, Layers3, Loader2, Menu, Settings, ShieldCheck, UserRound, Users } from "lucide-react";
import Link, { useLinkStatus } from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";

import { I18nText } from "@/components/i18n-text";
import { LanguageToggle } from "@/components/language-toggle";
import { localizedText, useLanguage } from "@/components/localized-option";
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
  const isPublicAuthPage = pathname === "/login" || pathname === "/setup";

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

  return (
    <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur">
      <div className="relative mx-auto flex min-h-14 min-w-0 max-w-7xl items-center justify-end px-4 sm:px-6 lg:px-8">
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
          onClick={(event) => {
            if (event.target instanceof Element && event.target.closest("a")) setMobileMenuOpen(false);
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape") setMobileMenuOpen(false);
          }}
          className={cn(
            mobileMenuOpen ? "grid" : "hidden",
            "ui-surface-elevated absolute right-4 top-full z-30 mt-1 max-h-[calc(100vh-5rem)] w-[min(21rem,calc(100vw-2rem))] grid-cols-1 gap-1 overflow-y-auto p-2 text-sm font-medium text-slate-600 [@supports(height:100dvh)]:max-h-[calc(100dvh-5rem)] sm:right-6 sm:grid-cols-2 [&_a]:justify-start [&_button:not([data-icon-button])]:justify-start",
            "xl:static xl:mt-0 xl:flex xl:max-h-none xl:w-full xl:flex-1 xl:flex-wrap xl:items-center xl:justify-start xl:overflow-visible xl:border-0 xl:bg-transparent xl:p-0 xl:shadow-none"
          )}
        >
          <HeaderNavigationItems pathname={pathname} user={user} logout={logout} />
        </nav>
      </div>
    </header>
  );
}

function HeaderNavigationItems({ pathname, user, logout }: {
  pathname: string;
  user?: HeaderUser | null;
  logout: () => Promise<void>;
}) {
  const language = useLanguage();

  return (
    <>
      <HeaderLink href="/machete/leagues" active={pathname.startsWith("/machete/leagues")} icon={<Layers3 className="h-4 w-4" />}>
        <I18nText en="Leagues" ru="Лиги" />
      </HeaderLink>
      <HeaderLink href="/machete/squad" active={pathname.startsWith("/machete/squad")} icon={<Users className="h-4 w-4" />}>
        <I18nText en="Squad" ru="Состав" />
      </HeaderLink>
      <HeaderLink href="/machete/fpl/squad" active={pathname.startsWith("/machete/fpl/squad")} icon={<Users className="h-4 w-4" />}>
        <I18nText en="FPL" ru="FPL" />
      </HeaderLink>
      <HeaderLink href="/machete/khl/squad" active={pathname.startsWith("/machete/khl/")} icon={<Users className="h-4 w-4" />}>
        <I18nText en="KHL" ru="КХЛ" />
      </HeaderLink>
      <HeaderLink href="/machete/players" active={pathname.startsWith("/machete/players")} icon={<UserRound className="h-4 w-4" />}>
        <I18nText en="Players" ru="Игроки" />
      </HeaderLink>
      <HeaderLink href="/mixerr" active={pathname.startsWith("/mixerr")} icon={<Crosshair className="h-4 w-4" />}>
        <I18nText en="MiXerr" ru="Миксер" />
      </HeaderLink>
      <HeaderLink href="/machete/models" active={pathname.startsWith("/machete/models")} icon={<Settings className="h-4 w-4" />}>
        <I18nText en="Model" ru="Модель" />
      </HeaderLink>
      {user?.role === "ADMIN" ? (
        <HeaderLink href="/admin/ingestion" active={pathname.startsWith("/admin")} icon={<ShieldCheck className="h-4 w-4" />}>
          <I18nText en="Admin" ru="Админ" />
        </HeaderLink>
      ) : null}
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

function HeaderLink({ href, active = false, icon, children }: {
  href: string;
  active?: boolean;
  icon?: ReactNode;
  children: ReactNode;
}) {
  const router = useRouter();

  return (
    <Link
      href={href}
      prefetch={false}
      onPointerEnter={() => router.prefetch(href)}
      onFocus={() => router.prefetch(href)}
      aria-current={active ? "page" : undefined}
      className={cn("inline-flex shrink-0 items-center gap-2 rounded px-3 py-2", active ? "bg-slate-100 text-ink" : "text-slate-600", "hover:bg-slate-100")}
    >
      <HeaderLinkIcon icon={icon} />
      {children}
    </Link>
  );
}

function HeaderLinkIcon({ icon }: { icon?: ReactNode }) {
  const { pending } = useLinkStatus();
  return pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : icon;
}
