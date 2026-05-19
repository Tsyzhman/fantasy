"use client";

import { Crosshair, Layers3 } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { I18nText } from "@/components/i18n-text";

export function ModeLeaguesLink() {
  const pathname = usePathname();
  const isMachete = pathname.startsWith("/machete");
  const isMixerr = pathname.startsWith("/mixerr");

  if (isMixerr) {
    return (
      <Link className="inline-flex items-center gap-2 rounded px-3 py-2 hover:bg-slate-100" href="/mixerr">
        <Crosshair className="h-4 w-4" />
        Shot maps
      </Link>
    );
  }

  return (
    <Link className="inline-flex items-center gap-2 rounded px-3 py-2 hover:bg-slate-100" href={isMachete ? "/machete/leagues" : "/baltika/leagues"}>
      <Layers3 className="h-4 w-4" />
      <I18nText en="Leagues" ru="Лиги" />
    </Link>
  );
}
