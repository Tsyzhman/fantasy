"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { I18nText } from "@/components/i18n-text";

export function ModePlayersLink() {
  const pathname = usePathname();
  const isMachete = pathname.startsWith("/machete");

  return (
    <Link className="rounded px-3 py-2 hover:bg-slate-100" href={isMachete ? "/machete/players" : "/baltika/players"}>
      <I18nText en="Players" ru="Игроки" />
    </Link>
  );
}
