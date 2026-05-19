import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { AppHeader } from "@/components/app-header";
import { getCurrentUser } from "@/lib/auth";
import { ensureDatabaseSchema } from "@/lib/db";

import "./globals.css";

export const metadata: Metadata = {
  title: "Fantasy Scout",
  description: "Excel-first fantasy football scouting",
  icons: {
    icon: "/favicon.svg"
  }
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  await ensureDatabaseSchema();
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
            __html:
              "try{var l=localStorage.getItem('fantasy-language');if(l==='ru'||l==='en'){document.documentElement.dataset.language=l;document.documentElement.lang=l;}}catch(e){}"
          }}
        />
      </head>
      <body>
        <div className="min-h-screen">
          <AppHeader user={user} />
          {children}
        </div>
      </body>
    </html>
  );
}

function isPublicPath(pathname: string) {
  return pathname === "/login" || pathname === "/setup";
}
