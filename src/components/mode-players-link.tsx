"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { I18nText } from "@/components/i18n-text";
import { cn } from "@/lib/cn";

export function ModePlayersLink() {
  const pathname = usePathname();
  const isMachete = pathname.startsWith("/machete");
  const isMixerr = pathname.startsWith("/mixerr");
  const href = isMixerr || isMachete ? "/machete/players" : "/baltika/players";
  const isActive = pathname.startsWith(href);

  if (isMixerr) {
    return (
      <Link
        aria-current={isActive ? "page" : undefined}
        className={cn("rounded px-3 py-2 hover:bg-slate-100", isActive ? "bg-slate-100 text-ink" : "")}
        href={href}
      >
        <I18nText en="FotMob players" ru="Игроки FotMob" />
      </Link>
    );
  }

  return (
    <Link
      aria-current={isActive ? "page" : undefined}
      className={cn("rounded px-3 py-2 hover:bg-slate-100", isActive ? "bg-slate-100 text-ink" : "")}
      href={href}
    >
      <I18nText en="Players" ru="Игроки" />
    </Link>
  );
}
