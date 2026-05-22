import type { ReactNode } from "react";

import { cn } from "@/lib/cn";

export function EmptyState({
  icon,
  title,
  description,
  action,
  className
}: {
  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("rounded border border-dashed border-slate-300 bg-white p-8 text-center shadow-soft", className)}>
      {icon ? <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded bg-slate-100 text-slate-500">{icon}</div> : null}
      <h2 className="text-base font-semibold text-ink">{title}</h2>
      {description ? <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-slate-500">{description}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}
