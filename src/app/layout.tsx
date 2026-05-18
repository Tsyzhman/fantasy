import type { Metadata } from "next";
import Link from "next/link";
import { Settings } from "lucide-react";

import { ModeBrand } from "@/components/mode-brand";

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
              <ModeBrand />
              <nav className="flex items-center gap-2 text-sm font-medium text-slate-600">
                <Link className="rounded px-3 py-2 hover:bg-slate-100" href="/admin/leagues">
                  Admin
                </Link>
                <Link className="rounded px-3 py-2 hover:bg-slate-100" href="/players">
                  Players
                </Link>
                <Link className="rounded px-3 py-2 hover:bg-slate-100" href="/machete">
                  Machete
                </Link>
                <Link
                  className="inline-flex items-center gap-2 rounded px-3 py-2 hover:bg-slate-100"
                  href="/admin/models"
                >
                  <Settings className="h-4 w-4" />
                  Model settings
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
