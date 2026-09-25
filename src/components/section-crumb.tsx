import Link from "next/link";
import type { ReactNode } from "react";

import { I18nText } from "@/components/i18n-text";

export type SectionCrumbItem = {
  label: ReactNode;
  href?: string;
};

/**
 * One quiet path line. It replaces a second section menu and a large page title.
 */
export function SectionCrumb({
  items,
  tools,
  note,
  heading = true
}: {
  items: SectionCrumbItem[];
  tools?: ReactNode;
  note?: ReactNode;
  heading?: boolean;
}) {
  return (
    <div className="flex min-h-11 flex-wrap items-center gap-x-3 gap-y-2 border-b border-slate-200 py-1.5">
      <nav aria-labelledby="section-crumb-label" className="flex min-w-0 flex-wrap items-center gap-x-1.5 text-[13px] font-semibold text-slate-500">
        <span id="section-crumb-label" className="sr-only">
          <I18nText en="Breadcrumb" ru="Навигационная цепочка" />
        </span>
        {items.map((item, index) => {
          const last = index === items.length - 1;
          const slash = index > 0 ? <span aria-hidden="true">/</span> : null;
          if (last && heading) {
            return (
              <h1 key={`${index}:current`} className="inline-flex items-center gap-1.5 text-[13px] font-bold leading-none text-ink">
                {slash}
                {item.label}
              </h1>
            );
          }
          return (
            <span key={`${index}:${item.href ?? "current"}`} className="inline-flex items-center gap-1.5">
              {slash}
              {item.href && !last ? <Link href={item.href} className="hover:text-ink">{item.label}</Link> : <span className={last ? "font-bold text-ink" : undefined}>{item.label}</span>}
            </span>
          );
        })}
      </nav>
      {tools}
      {note ? <span className="text-[13px] font-semibold text-slate-500">{note}</span> : null}
    </div>
  );
}
