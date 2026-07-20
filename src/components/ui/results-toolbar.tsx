import Link from "next/link";
import type { ReactNode } from "react";

import { I18nText } from "@/components/i18n-text";
import { cn } from "@/lib/cn";

export function ResultsToolbar({
  title,
  meta,
  resetHref,
  children,
  className
}: {
  title: ReactNode;
  meta?: ReactNode;
  resetHref?: string;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("ui-card flex flex-col gap-3 px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between", className)}>
      <div>
        <p className="font-semibold text-ink">{title}</p>
        {meta ? <p className="mt-1 text-slate-500">{meta}</p> : null}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {children}
        {resetHref ? (
          <Link
            href={resetHref}
            className="ui-button"
          >
            <I18nText en="Reset filters" ru="Сбросить фильтры" />
          </Link>
        ) : null}
      </div>
    </div>
  );
}
