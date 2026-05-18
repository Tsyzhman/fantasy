import type { Metadata } from "next";
import Link from "next/link";

import { ModelSettingsLink } from "@/components/model-settings-link";
import { ModeBrand } from "@/components/mode-brand";
import { ModePlayersLink } from "@/components/mode-players-link";
import { ModeSwitchLink } from "@/components/mode-switch-link";
import { ThemeToggle } from "@/components/theme-toggle";

import "./globals.css";

export const metadata: Metadata = {
  title: "Fantasy Scout",
  description: "Excel-first fantasy football scouting"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <div className="min-h-screen">
          <header className="border-b border-slate-200 bg-white/88 backdrop-blur">
            <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
              <ModeBrand />
              <nav className="flex items-center gap-2 text-sm font-medium text-slate-600">
                <Link className="rounded px-3 py-2 hover:bg-slate-100" href="/baltika/leagues">
                  Leagues
                </Link>
                <ModePlayersLink />
                <ModeSwitchLink />
                <ModelSettingsLink />
                <ThemeToggle />
              </nav>
            </div>
          </header>
          {children}
        </div>
      </body>
    </html>
  );
}
