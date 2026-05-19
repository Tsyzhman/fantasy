"use client";

import { Crosshair } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useRouter } from "next/navigation";

import { I18nText } from "@/components/i18n-text";
import { LanguageToggle } from "@/components/language-toggle";
import { ModeBrand } from "@/components/mode-brand";
import { ModeLeaguesLink } from "@/components/mode-leagues-link";
import { ModePlayersLink } from "@/components/mode-players-link";
import { ModeSwitchLink } from "@/components/mode-switch-link";
import { ModelSettingsLink } from "@/components/model-settings-link";
import { ThemeToggle } from "@/components/theme-toggle";

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
            <Link className="inline-flex items-center gap-2 rounded px-3 py-2 hover:bg-white/70" href="/mixerr">
              <Crosshair className="h-4 w-4" />
              <I18nText en="MiXerr" ru="Миксер" />
            </Link>
            <LanguageToggle />
            <ThemeToggle />
          </nav>
        </div>
      </header>
    );
  }

  return (
    <header className="border-b border-slate-200 bg-white/88 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
        <ModeBrand />
        <nav className="flex items-center gap-2 text-sm font-medium text-slate-600">
          <ModeLeaguesLink />
          <ModePlayersLink />
          {isMixerr ? (
            <>
              <Link className="rounded px-3 py-2 hover:bg-slate-100" href="/machete/leagues">
                Machete
              </Link>
              <Link className="rounded px-3 py-2 hover:bg-slate-100" href="/baltika/leagues">
                <I18nText en="Baltika" ru="Балтика" />
              </Link>
            </>
          ) : (
            <Link className="inline-flex items-center gap-2 rounded px-3 py-2 hover:bg-slate-100" href="/mixerr">
              <Crosshair className="h-4 w-4" />
              <I18nText en="MiXerr" ru="Миксер" />
            </Link>
          )}
          <ModeSwitchLink />
          <ModelSettingsLink />
          {user?.role === "ADMIN" ? (
            <>
              <a className="rounded px-3 py-2 hover:bg-slate-100" href="/admin/ingestion">
                Ingestion
              </a>
              <a className="rounded px-3 py-2 hover:bg-slate-100" href="/admin/users">
                Users
              </a>
            </>
          ) : null}
          {user ? (
            <button
              type="button"
              onClick={logout}
              className="rounded px-3 py-2 text-slate-600 hover:bg-slate-100"
              title={user.name ?? user.email}
            >
              Sign out
            </button>
          ) : null}
          <LanguageToggle />
          <ThemeToggle />
        </nav>
      </div>
    </header>
  );
}
