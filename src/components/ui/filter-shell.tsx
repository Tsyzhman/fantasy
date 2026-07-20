import Link from "next/link";
import type { ReactNode } from "react";

import { I18nText } from "@/components/i18n-text";
import { cn } from "@/lib/cn";

export function FilterShell({
  title,
  description,
  resetHref,
  children,
  className
}: {
  title: ReactNode;
  description?: ReactNode;
  resetHref?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("ui-card", className)}>
      <div className="flex flex-col gap-3 border-b border-slate-200 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-base font-semibold leading-[22px] text-ink">{title}</h2>
          {description ? <p className="mt-1 text-sm text-slate-500">{description}</p> : null}
        </div>
        {resetHref ? (
          <Link
            href={resetHref}
            className="ui-button text-sm"
          >
            <I18nText en="Reset" ru="Сбросить" />
          </Link>
        ) : null}
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}
