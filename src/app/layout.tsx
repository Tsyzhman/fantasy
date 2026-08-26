import type { Metadata } from "next";
import { JetBrains_Mono, Onest } from "next/font/google";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { AppHeader } from "@/components/app-header";
import { BetaTelemetryReporter } from "@/components/beta/BetaTelemetryReporter";
import { ClientCriticalErrorReporter } from "@/components/ClientCriticalErrorReporter";
import { getCurrentUser } from "@/lib/auth";

import "./globals.css";

const onest = Onest({
  subsets: ["cyrillic", "latin"],
  display: "swap",
  variable: "--font-onest"
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["cyrillic", "latin"],
  display: "swap",
  variable: "--font-jetbrains-mono"
});

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
      <body className={`${onest.variable} ${jetbrainsMono.variable}`}>
        <div className="min-h-screen">
          <AppHeader user={user} />
          {children}
          <ClientCriticalErrorReporter />
          {user ? <BetaTelemetryReporter /> : null}
        </div>
      </body>
    </html>
  );
}

function isPublicPath(pathname: string) {
  return pathname === "/login" || pathname === "/setup";
}
