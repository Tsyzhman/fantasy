"use client";

import { Settings } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { I18nText } from "@/components/i18n-text";
import { cn } from "@/lib/cn";

export function ModelSettingsLink() {
  const pathname = usePathname();
  const isMachete = pathname.startsWith("/machete");
  const isMixerr = pathname.startsWith("/mixerr");
  const href = isMachete ? "/machete/models" : "/baltika/models";
  const isActive = pathname.startsWith(href);

  if (isMixerr) return null;

  return (
    <Link
      aria-current={isActive ? "page" : undefined}
      className={cn("inline-flex items-center gap-2 rounded px-3 py-2 hover:bg-slate-100", isActive ? "bg-slate-100 text-ink" : "")}
      href={href}
    >
      <Settings className="h-4 w-4" />
      <I18nText en="Model settings" ru="Модель" />
    </Link>
  );
}
