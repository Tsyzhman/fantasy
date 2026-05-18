import type { ImportStatus } from "@prisma/client";

import { cn } from "@/lib/cn";

const statusStyles: Record<string, string> = {
  EMPTY: "bg-slate-100 text-slate-700 ring-slate-200",
  UPLOADING: "bg-blue-50 text-blue-700 ring-blue-200",
  PARSING: "bg-blue-50 text-blue-700 ring-blue-200",
  VALIDATED: "bg-cyan-50 text-cyan-700 ring-cyan-200",
  READY: "bg-amber-50 text-amber-800 ring-amber-200",
  PUBLISHED: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  ERROR: "bg-rose-50 text-rose-700 ring-rose-200",
  OUTDATED: "bg-orange-50 text-orange-700 ring-orange-200",
  ARCHIVED: "bg-slate-100 text-slate-600 ring-slate-200"
};

export function StatusBadge({ status, className }: { status: ImportStatus | "EMPTY" | string; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset",
        statusStyles[status] ?? statusStyles.EMPTY,
        className
      )}
    >
      {status}
    </span>
  );
}
