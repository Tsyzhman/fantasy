"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";

export function ModeBrand() {
  const pathname = usePathname();
  const isMachete = pathname.startsWith("/machete") || pathname.startsWith("/api/machete");
  const href = isMachete ? "/machete" : "/baltika/leagues";
  const imageSrc = isMachete ? "/mode-logos/fotmob-mode.png" : "/mode-logos/wyscout-mode.jpg";
  const label = isMachete ? "Machete" : "Baltika";
  const subtitle = isMachete ? "FotMob mode" : "Wyscout Excel mode";

  return (
    <Link href={href} className="flex min-w-0 items-center gap-3">
      <span className="grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded bg-white ring-1 ring-slate-200">
        <Image src={imageSrc} alt={`${label} logo`} width={48} height={48} className="h-12 w-12 object-contain" priority />
      </span>
      <span className="min-w-0">
        <span className="block truncate text-sm font-semibold uppercase tracking-wide text-slate-500">{label}</span>
        <span className="block truncate text-xs font-medium text-slate-400">{subtitle}</span>
      </span>
    </Link>
  );
}
