"use client";

import { Crosshair, Layers3 } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { I18nText } from "@/components/i18n-text";
import { cn } from "@/lib/cn";

export function ModeLeaguesLink() {
  const pathname = usePathname();
  const isMachete = pathname.startsWith("/machete");
  const isMixerr = pathname.startsWith("/mixerr");
  const href = isMachete ? "/machete/leagues" : "/baltika/leagues";
  const isActive = isMixerr ? pathname === "/mixerr" : pathname.startsWith(href);

  if (isMixerr) {
    return (
      <Link
        aria-current={isActive ? "page" : undefined}
        className={cn("inline-flex items-center gap-2 rounded px-3 py-2 hover:bg-slate-100", isActive ? "bg-slate-100 text-ink" : "")}
        href="/mixerr"
      >
        <Crosshair className="h-4 w-4" />
        <I18nText en="Shot maps" ru="Карты ударов" />
      </Link>
    );
  }

  return (
    <Link
      aria-current={isActive ? "page" : undefined}
      className={cn("inline-flex items-center gap-2 rounded px-3 py-2 hover:bg-slate-100", isActive ? "bg-slate-100 text-ink" : "")}
      href={href}
    >
      <Layers3 className="h-4 w-4" />
      <I18nText en="Leagues" ru="Лиги" />
    </Link>
  );
}
