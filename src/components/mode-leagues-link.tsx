"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function ModeLeaguesLink() {
  const pathname = usePathname();
  const isMachete = pathname.startsWith("/machete");

  return (
    <Link className="rounded px-3 py-2 hover:bg-slate-100" href={isMachete ? "/machete/leagues" : "/baltika/leagues"}>
      Leagues
    </Link>
  );
}
