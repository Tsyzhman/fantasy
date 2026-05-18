import type { Metadata } from "next";

import { LanguageToggle } from "@/components/language-toggle";
import { ModeLeaguesLink } from "@/components/mode-leagues-link";
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
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html:
              "try{var l=localStorage.getItem('fantasy-language');if(l==='ru'||l==='en'){document.documentElement.dataset.language=l;document.documentElement.lang=l;}}catch(e){}"
          }}
        />
      </head>
      <body>
        <div className="min-h-screen">
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
          {children}
        </div>
      </body>
    </html>
  );
}
