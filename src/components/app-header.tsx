"use client";

import { usePathname } from "next/navigation";

import { LanguageToggle } from "@/components/language-toggle";
import { ModeBrand } from "@/components/mode-brand";
import { ModeLeaguesLink } from "@/components/mode-leagues-link";
import { ModePlayersLink } from "@/components/mode-players-link";
import { ModeSwitchLink } from "@/components/mode-switch-link";
import { ModelSettingsLink } from "@/components/model-settings-link";
import { ThemeToggle } from "@/components/theme-toggle";

export function AppHeader() {
  const pathname = usePathname();
  const isHome = pathname === "/";

  if (isHome) {
    return (
      <header className="absolute inset-x-0 top-0 z-10">
        <div className="mx-auto flex max-w-7xl justify-end px-4 py-4 sm:px-6 lg:px-8">
          <nav className="flex items-center gap-2 text-sm font-medium text-slate-600">
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
          <ModeSwitchLink />
          <ModelSettingsLink />
          <LanguageToggle />
          <ThemeToggle />
        </nav>
      </div>
    </header>
  );
}
