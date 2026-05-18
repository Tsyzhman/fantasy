"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/cn";
import { I18nText } from "@/components/i18n-text";

export function ModeBrand() {
  const pathname = usePathname();
  const isMachete = pathname.startsWith("/machete") || pathname.startsWith("/api/machete");
  const href = isMachete ? "/machete/leagues" : "/baltika/leagues";
  const imageSrc = isMachete ? "/mode-logos/fotmob-mode.png" : "/mode-logos/wyscout-mode.jpg";
  const label = isMachete ? "Machete" : "Baltika";
  const subtitle = isMachete ? (
    <I18nText en="FotMob mode" ru="Режим FotMob" />
  ) : (
    <I18nText en="Wyscout Excel mode" ru="Режим Wyscout Excel" />
  );

  return (
    <Link href={href} className="group flex min-w-0 items-center gap-3 rounded px-1 py-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-300">
      <span className={cn("mode-logo-frame", isMachete ? "mode-logo-frame-machete" : "mode-logo-frame-baltika")}>
        <Image
          src={imageSrc}
          alt={`${label} logo`}
          width={48}
          height={48}
          className={cn("mode-logo-image", isMachete ? "mode-logo-image-machete" : "mode-logo-image-baltika")}
          priority
        />
      </span>
      <span className="min-w-0">
        <span className="block truncate text-sm font-semibold uppercase tracking-wide text-slate-500">
          {isMachete ? label : <I18nText en={label} ru="Балтика" />}
        </span>
        <span className="block truncate text-xs font-medium text-slate-400">{subtitle}</span>
      </span>
    </Link>
  );
}
