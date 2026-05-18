import { cn } from "@/lib/cn";

const statusStyles: Record<string, string> = {
  NOT_CONFIGURED: "bg-slate-100 text-slate-700 ring-slate-200",
  READY: "bg-cyan-50 text-cyan-700 ring-cyan-200",
  SYNCING: "bg-blue-50 text-blue-700 ring-blue-200",
  SYNCED: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  NEEDS_REVIEW: "bg-amber-50 text-amber-800 ring-amber-200",
  ERROR: "bg-rose-50 text-rose-700 ring-rose-200",
  PENDING: "bg-slate-100 text-slate-700 ring-slate-200",
  RUNNING: "bg-blue-50 text-blue-700 ring-blue-200",
  SUCCEEDED: "bg-emerald-50 text-emerald-700 ring-emerald-200"
};

export function MacheteStatusBadge({ status, className }: { status: string; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset",
        statusStyles[status] ?? statusStyles.NOT_CONFIGURED,
        className
      )}
    >
      {status.replace(/_/g, " ")}
    </span>
  );
}
