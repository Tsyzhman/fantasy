"use client";

import { LayoutGrid } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { I18nText } from "@/components/i18n-text";
import { cn } from "@/lib/cn";

export function ModeSwitchLink() {
  const pathname = usePathname();
  const isActive = pathname === "/";

  return (
    <Link
      aria-current={isActive ? "page" : undefined}
      className={cn("inline-flex items-center gap-2 rounded px-3 py-2 hover:bg-slate-100", isActive ? "bg-slate-100 text-ink" : "")}
      href="/"
    >
      <LayoutGrid className="h-4 w-4" />
      <I18nText en="Modes" ru="Режимы" />
    </Link>
  );
}
