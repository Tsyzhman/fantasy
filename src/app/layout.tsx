import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { AppHeader } from "@/components/app-header";
import { BetaTelemetryReporter } from "@/components/beta/BetaTelemetryReporter";
import { getCurrentUser } from "@/lib/auth";

import "./globals.css";

const earlyPreferenceScript = `
try {
  var theme = localStorage.getItem("fantasy-theme");
  if (theme !== "dark" && theme !== "light") {
    theme = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;

  var language = localStorage.getItem("fantasy-language");
  if (language === "ru" || language === "en") {
    document.documentElement.dataset.language = language;
    document.documentElement.lang = language;
  }
} catch (error) {}
`;

export const metadata: Metadata = {
  title: "Fantasy Scout",
  description: "Excel-first fantasy football scouting",
  icons: {
    icon: "/favicon.svg"
  }
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const headerStore = await headers();
  const pathname = headerStore.get("x-pathname") ?? "";
  const user = process.env.NEXT_PHASE === "phase-production-build" ? null : await getCurrentUser();

  if (pathname && !isPublicPath(pathname) && !user) {
    redirect(`/login?next=${encodeURIComponent(pathname)}`);
  }

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: earlyPreferenceScript
          }}
        />
      </head>
      <body>
        <div className="min-h-screen">
          <AppHeader user={user} />
          {children}
          {user ? <BetaTelemetryReporter /> : null}
        </div>
      </body>
    </html>
  );
}

function isPublicPath(pathname: string) {
  return pathname === "/login" || pathname === "/setup";
}
