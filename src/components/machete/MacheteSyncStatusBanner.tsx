"use client";

import { AlertTriangle, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";

import { I18nText } from "@/components/i18n-text";

type SyncStatusJob = {
  id: string;
  type: string;
  status: string;
  leagueName: string | null;
  teamName: string | null;
};

type SyncStatusPayload = {
  running: boolean;
  jobs: SyncStatusJob[];
};

export function MacheteSyncStatusBanner() {
  const [payload, setPayload] = useState<SyncStatusPayload | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadStatus() {
      const response = await fetch("/api/machete/sync-status", { cache: "no-store" });
      if (!response.ok) return;

      const nextPayload = (await response.json()) as SyncStatusPayload;
      if (!cancelled) setPayload(nextPayload);
    }

    void loadStatus();
    const interval = window.setInterval(() => void loadStatus(), 10_000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, []);

  if (!payload?.running) return null;

  const primaryJob = payload.jobs[0];
  const jobLabel = primaryJob ? syncJobLabel(primaryJob) : null;
  const extraCount = Math.max(0, payload.jobs.length - 1);

  return (
    <section className="border-b border-amber-200 bg-amber-50">
      <div className="mx-auto flex max-w-7xl flex-col gap-2 px-4 py-3 text-sm text-amber-900 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
        <div className="flex items-start gap-2">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <p className="font-semibold">
              <I18nText en="Machete update is running" ru="Идёт обновление Machete" />
            </p>
            <p className="mt-0.5 text-amber-800">
              {jobLabel ? jobLabel : <I18nText en="Data may refresh while the sync is active." ru="Данные могут обновляться, пока синхронизация активна." />}
              {extraCount > 0 ? ` +${extraCount}` : ""}
            </p>
          </div>
        </div>
        <div className="inline-flex items-center gap-2 font-medium text-amber-800">
          <Loader2 className="h-4 w-4 animate-spin" />
          <I18nText en="Checking every 10 seconds" ru="Проверка каждые 10 секунд" />
        </div>
      </div>
    </section>
  );
}

function syncJobLabel(job: SyncStatusJob) {
  const scope = [job.leagueName, job.teamName].filter(Boolean).join(" / ");
  const typeLabel = job.type.replace(/^SYNC_/, "").replace(/_/g, " ").toLowerCase();
  return scope ? `${typeLabel}: ${scope}` : typeLabel;
}
