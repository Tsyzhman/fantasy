import type { Metadata } from "next";
import Link from "next/link";

import "./globals.css";

export const metadata: Metadata = {
  title: "Fantasy Scout",
  description: "Excel-first fantasy football scouting"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="min-h-screen">
          <header className="border-b border-slate-200 bg-white/88 backdrop-blur">
            <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
              <Link href="/admin/leagues" className="flex items-center gap-3">
                <span className="grid h-9 w-9 place-items-center rounded bg-ink text-sm font-bold text-white">FS</span>
                <span>
                  <span className="block text-sm font-semibold uppercase tracking-wide text-slate-500">Fantasy Scout</span>
                  <span className="block text-xs text-slate-500">Excel-first scouting admin</span>
                </span>
              </Link>
              <nav className="flex items-center gap-2 text-sm font-medium text-slate-600">
                <Link className="rounded px-3 py-2 hover:bg-slate-100" href="/admin/leagues">
                  Admin
                </Link>
                <Link className="rounded px-3 py-2 hover:bg-slate-100" href="/players">
                  Players
                </Link>
              </nav>
            </div>
          </header>
          {children}
        </div>
      </body>
    </html>
  );
}
