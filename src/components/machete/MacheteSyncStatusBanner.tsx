"use client";

import { AlertTriangle, Loader2 } from "lucide-react";
import { useCallback } from "react";

import { I18nText } from "@/components/i18n-text";
import { localizedText, useLanguage } from "@/components/localized-option";
import { useAdaptivePoll } from "@/lib/use-adaptive-poll";

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
  const language = useLanguage();
  const fetchStatus = useCallback(async (): Promise<SyncStatusPayload> => {
    const response = await fetch("/api/machete/sync-status", { cache: "no-store" });
    if (!response.ok) return { running: false, jobs: [] };

    return (await response.json()) as SyncStatusPayload;
  }, []);
  const payload = useAdaptivePoll(fetchStatus, {
    activeIntervalMs: 15_000,
    idleIntervalMs: 120_000,
    initialIntervalMs: 5_000,
    isActive: isSyncRunning
  });

  if (!payload?.running) return null;

  const primaryJob = payload.jobs[0];
  const jobLabel = primaryJob ? syncJobLabel(primaryJob, language) : null;
  const extraCount = Math.max(0, payload.jobs.length - 1);

  return (
    <section className="border-b border-amber-200 bg-amber-50">
      <div className="mx-auto flex max-w-7xl flex-col gap-2 px-4 py-3 text-sm text-amber-900 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8 2xl:max-w-[1760px] 3xl:max-w-[1920px] 3xl:px-10">
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
          <I18nText en="Checking every 15 seconds" ru="Проверка каждые 15 секунд" />
        </div>
      </div>
    </section>
  );
}

function syncJobLabel(job: SyncStatusJob, language: "en" | "ru") {
  const scope = [job.leagueName, job.teamName].filter(Boolean).join(" / ");
  const labels: Record<string, { en: string; ru: string }> = {
    SYNC_ALL_LEAGUES: { en: "Sync all leagues", ru: "Синхронизация всех лиг" },
    SYNC_LEAGUE_METADATA: { en: "Sync league metadata", ru: "Синхронизация данных лиги" },
    SYNC_TEAMS: { en: "Sync teams", ru: "Синхронизация команд" },
    SYNC_FIXTURES: { en: "Sync fixtures", ru: "Синхронизация календаря" },
    SYNC_PLAYER_STATS: { en: "Sync player stats", ru: "Синхронизация статистики игроков" },
    SYNC_LEAGUE_FULL: { en: "Full league sync", ru: "Полная синхронизация лиги" },
    SYNC_TEAM: { en: "Sync team", ru: "Синхронизация команды" },
    CALCULATE_FANTASY_SCORES: { en: "Calculate fantasy scores", ru: "Расчет фэнтези-очков" },
    RUN_ENTITY_MATCHING: { en: "Run entity matching", ru: "Сопоставление сущностей" },
    SYNC_SHOTS: { en: "Sync shots", ru: "Синхронизация ударов" }
  };
  const fallback = job.type.replace(/^SYNC_/, "").replace(/_/g, " ").toLowerCase();
  const typeLabel = labels[job.type] ? localizedText(language, labels[job.type].en, labels[job.type].ru) : fallback;
  return scope ? `${typeLabel}: ${scope}` : typeLabel;
}

function isSyncRunning(payload: SyncStatusPayload) {
  return payload.running;
}
