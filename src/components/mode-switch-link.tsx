"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function ModeSwitchLink() {
  const pathname = usePathname();
  const isMachete = pathname.startsWith("/machete");

  return (
    <Link className="rounded px-3 py-2 hover:bg-slate-100" href={isMachete ? "/admin/leagues" : "/machete"}>
      {isMachete ? "Wyscout Excel" : "Machete"}
    </Link>
  );
}
