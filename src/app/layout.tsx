import type { Metadata } from "next";

import { AppHeader } from "@/components/app-header";
import { ensureDatabaseSchema } from "@/lib/db";

import "./globals.css";

export const metadata: Metadata = {
  title: "Fantasy Scout",
  description: "Excel-first fantasy football scouting"
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  await ensureDatabaseSchema();

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
          <AppHeader />
          {children}
        </div>
      </body>
    </html>
  );
}
