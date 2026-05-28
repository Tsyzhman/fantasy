import { ArrowLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { I18nText } from "@/components/i18n-text";

export type BreadcrumbItem = {
  label: ReactNode;
  href: string;
};

export function PageBreadcrumbs({ items, backHref, backLabel }: { items: BreadcrumbItem[]; backHref?: string; backLabel?: ReactNode }) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      {backHref && backLabel ? (
        <Link href={backHref} className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-ink">
          <ArrowLeft className="h-4 w-4" />
          {backLabel}
        </Link>
      ) : (
        <span />
      )}
      <nav aria-labelledby="page-breadcrumbs-label" className="flex flex-wrap items-center gap-1 text-sm text-slate-500">
        <span id="page-breadcrumbs-label" className="sr-only">
          <I18nText en="Breadcrumb" ru="Навигационная цепочка" />
        </span>
        {items.map((item, index) => (
          <span key={`${item.href}:${index}`} className="inline-flex items-center gap-1">
            {index > 0 ? <ChevronRight className="h-4 w-4 text-slate-400" /> : null}
            <Link href={item.href} className={index === items.length - 1 ? "font-semibold text-ink" : "hover:text-ink"}>
              {item.label}
            </Link>
          </span>
        ))}
      </nav>
    </div>
  );
}
