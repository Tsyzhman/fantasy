"use client";

import { ShieldCheck } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { I18nText } from "@/components/i18n-text";
import { cn } from "@/lib/cn";

export function ModeBrand() {
  const pathname = usePathname();
  const isAdmin = pathname.startsWith("/admin") || pathname.startsWith("/api/admin");
  const isMachete = pathname.startsWith("/machete") || pathname.startsWith("/api/machete");
  const isMixerr = pathname.startsWith("/mixerr") || pathname.startsWith("/api/shot-map") || pathname.includes("/shot-map");

  if (isAdmin) {
    return (
      <Link href="/admin/ingestion" className="group flex min-w-0 items-center gap-3 rounded px-1 py-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-300">
        <span className="mode-logo-frame mode-logo-frame-admin">
          <ShieldCheck className="h-7 w-7 text-slate-700" />
        </span>
        <span className="min-w-0">
          <span className="block truncate text-sm font-semibold uppercase tracking-wide text-slate-500"><I18nText en="Administration" ru="Администрирование" /></span>
          <span className="block truncate text-xs font-medium text-slate-400">
            <I18nText en="System controls" ru="Системное управление" />
          </span>
        </span>
      </Link>
    );
  }

  const href = isMixerr ? "/mixerr" : isMachete ? "/machete/leagues" : "/baltika/leagues";
  const imageSrc = isMixerr ? "/mode-logos/mixerr-mode.svg" : isMachete ? "/mode-logos/fotmob-mode.png" : "/mode-logos/wyscout-mode.jpg";
  const frameClassName = isMixerr ? "mode-logo-frame-mixerr" : isMachete ? "mode-logo-frame-machete" : "mode-logo-frame-baltika";
  const imageClassName = isMixerr ? "mode-logo-image-mixerr" : isMachete ? "mode-logo-image-machete" : "mode-logo-image-baltika";
  const label = isMixerr ? "MiXerr" : isMachete ? "Machete" : "Baltika";
  const subtitle = isMixerr ? (
    <I18nText en="FotMob shot maps" ru="Карты ударов FotMob" />
  ) : isMachete ? (
    <I18nText en="FotMob mode" ru="Режим FotMob" />
  ) : (
    <I18nText en="Wyscout Excel mode" ru="Режим Wyscout Excel" />
  );

  return (
    <Link href={href} className="group flex min-w-0 items-center gap-3 rounded px-1 py-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-300">
      <span className={cn("mode-logo-frame", frameClassName)}>
        <Image
          src={imageSrc}
          alt={`${label} logo`}
          width={48}
          height={48}
          className={cn("mode-logo-image", imageClassName)}
          priority
        />
      </span>
      <span className="min-w-0">
        <span className="block truncate text-sm font-semibold uppercase tracking-wide text-slate-500">
          {isMixerr ? <I18nText en={label} ru="Миксер" /> : isMachete ? label : <I18nText en={label} ru="Балтика" />}
        </span>
        <span className="block truncate text-xs font-medium text-slate-400">{subtitle}</span>
      </span>
    </Link>
  );
}
