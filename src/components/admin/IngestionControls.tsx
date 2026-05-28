"use client";

import { RefreshCw, Square, UploadCloud } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { I18nText } from "@/components/i18n-text";
import { localizedText, useLanguage } from "@/components/localized-option";

type Props = {
  hasActiveJob: boolean;
  initialBackfillCompleted: boolean;
};

export function IngestionControls({ hasActiveJob, initialBackfillCompleted }: Props) {
  const router = useRouter();
  const language = useLanguage();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  async function post(endpoint: string, body?: Record<string, unknown>) {
    setError(null);
    const response = await fetch(endpoint, {
      method: "POST",
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined
    });
    if (!response.ok) {
      const responseBody = await response.json().catch(() => null);
      setError(language === "ru" ? localizedText(language, "Request failed.", "Запрос не удался.") : responseBody?.error?.message ?? localizedText(language, "Request failed.", "Запрос не удался."));
      return;
    }
    startTransition(() => router.refresh());
  }

  return (
    <div className="flex flex-wrap gap-3">
      <button
        type="button"
        disabled={hasActiveJob || isPending}
        onClick={() => post("/api/admin/ingestion/initial-backfill/start", { mode: "current_league_47" })}
        className="inline-flex items-center gap-2 rounded bg-ink px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-45"
      >
        <UploadCloud className="h-4 w-4" />
        <I18nText en="Quick EPL current season" ru="Быстро: АПЛ текущий сезон" />
      </button>
      <button
        type="button"
        disabled={hasActiveJob || isPending}
        onClick={() => post("/api/admin/ingestion/initial-backfill/start", { mode: "full" })}
        className="inline-flex items-center gap-2 rounded border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-45"
      >
        <UploadCloud className="h-4 w-4" />
        <I18nText en="Full FotMob backfill" ru="Полная выгрузка FotMob" />
      </button>
      <button
        type="button"
        disabled={hasActiveJob || isPending || !initialBackfillCompleted}
        onClick={() => post("/api/admin/ingestion/incremental-update/start")}
        className="inline-flex items-center gap-2 rounded border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-45"
      >
        <RefreshCw className="h-4 w-4" />
        <I18nText en="Run incremental update" ru="Запустить обновление" />
      </button>
      <button
        type="button"
        disabled={!hasActiveJob || isPending}
        onClick={() => post("/api/admin/ingestion/cancel")}
        className="inline-flex items-center gap-2 rounded border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-semibold text-rose-700 hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-45"
      >
        <Square className="h-4 w-4" />
        <I18nText en="Cancel" ru="Отменить" />
      </button>
      {error ? <p className="basis-full rounded bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p> : null}
    </div>
  );
}
