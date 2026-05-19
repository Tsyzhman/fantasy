"use client";

import { Settings } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { I18nText } from "@/components/i18n-text";

export function ModelSettingsLink() {
  const pathname = usePathname();
  const isMachete = pathname.startsWith("/machete");
  const isMixerr = pathname.startsWith("/mixerr");

  if (isMixerr) return null;

  return (
    <Link
      className="inline-flex items-center gap-2 rounded px-3 py-2 hover:bg-slate-100"
      href={isMachete ? "/machete/models" : "/baltika/models"}
    >
      <Settings className="h-4 w-4" />
      <I18nText en="Model settings" ru="Модель" />
    </Link>
  );
}
