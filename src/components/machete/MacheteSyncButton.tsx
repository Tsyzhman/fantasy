"use client";

import { AlertCircle, CheckCircle2, Loader2, RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { useState } from "react";

import { cn } from "@/lib/cn";

type SyncState = {
  status: "idle" | "running" | "success" | "error";
  message?: string;
};

export function MacheteSyncButton({
  endpoint,
  children,
  variant = "primary",
  className
}: {
  endpoint: string;
  children: ReactNode;
  variant?: "primary" | "secondary";
  className?: string;
}) {
  const router = useRouter();
  const [state, setState] = useState<SyncState>({ status: "idle" });

  async function runSync() {
    setState({ status: "running", message: "Running..." });
    const response = await fetch(endpoint, { method: "POST" });
    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
      setState({ status: "error", message: payload?.error ?? payload?.job?.errorMessage ?? "Sync failed." });
      router.refresh();
      return;
    }

    setState({ status: "success", message: "Done" });
    router.refresh();
  }

  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <button
        type="button"
        onClick={() => void runSync()}
        disabled={state.status === "running"}
        className={cn(
          "inline-flex items-center justify-center gap-2 rounded px-3 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-70",
          variant === "primary"
            ? "bg-ink text-white hover:bg-slate-700"
            : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
        )}
      >
        {state.status === "running" ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
        {children}
      </button>
      {state.message && state.status !== "running" ? (
        <p
          className={cn(
            "flex items-center gap-1 text-xs",
            state.status === "error" ? "text-rose-700" : "text-emerald-700"
          )}
        >
          {state.status === "error" ? <AlertCircle className="h-3.5 w-3.5" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
          {state.message}
        </p>
      ) : null}
    </div>
  );
}
