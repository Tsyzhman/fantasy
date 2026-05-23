import Link from "next/link";
import { X } from "lucide-react";
import type { ReactNode } from "react";

import { I18nText } from "@/components/i18n-text";
import { cn } from "@/lib/cn";

export type ActiveFilterChip = {
  key: string;
  label: ReactNode;
  removeHref: string;
};

export function ActiveFilterChips({
  chips,
  resetHref,
  className
}: {
  chips: ActiveFilterChip[];
  resetHref?: string;
  className?: string;
}) {
  if (chips.length === 0) return null;
  return (
    <div className={cn("chip-row", className)} aria-label="Active filters">
      {chips.map((chip) => (
        <span key={chip.key} className="chip">
          <span>{chip.label}</span>
          <Link
            href={chip.removeHref}
            aria-label={`Remove filter ${typeof chip.label === "string" ? chip.label : chip.key}`}
            className="chip-remove"
          >
            <X className="h-3 w-3" />
          </Link>
        </span>
      ))}
      {resetHref ? (
        <Link
          href={resetHref}
          className="inline-flex items-center rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50"
        >
          <I18nText en="Clear all" ru="Сбросить все" />
        </Link>
      ) : null}
    </div>
  );
}
