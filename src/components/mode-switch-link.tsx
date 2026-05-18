"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { I18nText } from "@/components/i18n-text";

export function ModeSwitchLink() {
  const pathname = usePathname();
  const isMachete = pathname.startsWith("/machete");

  return (
    <Link className="rounded px-3 py-2 hover:bg-slate-100" href={isMachete ? "/baltika/leagues" : "/machete/leagues"}>
      {isMachete ? <I18nText en="Baltika" ru="Балтика" /> : "Machete"}
    </Link>
  );
}
