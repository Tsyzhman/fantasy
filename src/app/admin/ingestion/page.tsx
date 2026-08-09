import { DatabaseZap } from "lucide-react";
import type { ReactNode } from "react";

import { AdminNav } from "@/components/admin/AdminNav";
import { FantasySourceSyncControls } from "@/components/admin/FantasySourceSyncControls";
import { I18nText } from "@/components/i18n-text";
import { IngestionAutoRefresh } from "@/components/admin/IngestionAutoRefresh";
import { IngestionControls } from "@/components/admin/IngestionControls";
import { getIngestionAdminStatus } from "@/core_data/ingestion-jobs";
import { requireAdminUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { formatDate, formatNumber } from "@/lib/format";
import {
  foontasyScopeOption,
  loadFoontasySyncScopes,
  loadSportsRuPriceSyncScopes,
  sportsRuScopeOption
} from "@/machete/fantasy-source-sync-config";

export const dynamic = "force-dynamic";

export default async function AdminIngestionPage() {
  await requireAdminUser();
  const [status, priceScopes, foontasyScopes] = await Promise.all([
    getIngestionAdminStatus(prisma),
    loadSportsRuPriceSyncScopes(prisma),
    loadFoontasySyncScopes(prisma)
  ]);
  const job = status.active_job ?? status.latest_job;
  const progress = calculateProgress(job);
  const dataQuality = summarizeDataQuality(job?.metadata);

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <IngestionAutoRefresh enabled={Boolean(status.active_job)} />
      <AdminNav />
      <section className="mt-6 rounded border border-slate-200 bg-white p-5 shadow-soft">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
              <DatabaseZap className="h-4 w-4" />
              <I18nText en="Data ingestion" ru="Загрузка данных" />
            </p>
            <h1 className="mt-2 text-3xl font-bold text-ink"><I18nText en="Shared FotMob backfill" ru="Общая загрузка FotMob" /></h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
              {status.initial_backfill_completed
                ? <I18nText en="Initial backfill completed. Future runs should use incremental updates." ru="Первичная загрузка завершена. Дальше используйте инкрементальные обновления." />
                : <I18nText en="Initial backfill has not been completed. It starts at 2023/2024 for autumn-spring leagues and 2023 for calendar-year leagues, then walks forward to the current season." ru="Первичная загрузка еще не завершена. Она стартует с 2023/2024 для лиг осень-весна и с 2023 для лиг календарного года, затем идет вперед до текущего сезона." />}
            </p>
          </div>
          <IngestionControls hasActiveJob={Boolean(status.active_job)} initialBackfillCompleted={status.initial_backfill_completed} />
        </div>
      </section>

      <FantasySourceSyncControls
        priceOptions={priceScopes.map(sportsRuScopeOption)}
        foontasyOptions={foontasyScopes.map(foontasyScopeOption)}
      />

      <section className="mt-6 rounded border border-slate-200 bg-white p-5 shadow-soft">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-lg font-bold text-ink"><I18nText en="Status" ru="Статус" /></h2>
            <p className="mt-1 text-sm text-slate-500">
              {job ? (
                <>
                  <IngestionJobTypeLabel type={job.job_type} /> / <IngestionStatusLabel status={job.status} />
                </>
              ) : (
                <I18nText en="No ingestion job has run yet." ru="Задачи загрузки еще не запускались." />
              )}
            </p>
          </div>
          <span className="rounded bg-slate-100 px-3 py-1 text-sm font-semibold text-slate-700">
            <I18nText en="Overall" ru="Всего" /> {formatProgress(progress.overall)}
          </span>
        </div>
        <div className="mt-4 h-2 overflow-hidden rounded bg-slate-100">
          <div className="h-full bg-emerald-500" style={{ width: `${progress.overall}%` }} />
        </div>
        {progress.current_scope !== null ? (
          <>
            <div className="mt-4 flex flex-col gap-1 text-sm text-slate-500 sm:flex-row sm:items-center sm:justify-between">
              <span>
                <I18nText en="Current league-season scope" ru="Текущая лига-сезон" />
                {progress.current_scope_index ? ` ${formatNumber(progress.current_scope_index)} / ${formatNumber(progress.total_scopes)}` : ""}
              </span>
              <span className="font-medium text-slate-700">
                {formatNumber(progress.current_scope_processed ?? 0)} / {formatNumber(progress.current_scope_total ?? 0)} <I18nText en="matches" ru="матчей" /> ·{" "}
                {formatProgress(progress.current_scope)}
              </span>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded bg-slate-100">
              <div className="h-full bg-sky-500" style={{ width: `${progress.current_scope}%` }} />
            </div>
          </>
        ) : null}

        <dl className="mt-6 grid grid-cols-1 gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <Metric label={<I18nText en="Total configured leagues" ru="Всего настроенных лиг" />} value={formatNumber(status.total_configured_leagues)} />
          <Metric label={<I18nText en="Total configured scopes" ru="Всего настроенных периодов" />} value={formatNumber(status.total_configured_scopes)} />
          <Metric label={<I18nText en="Total discovered matches" ru="Всего найдено матчей" />} value={formatNumber(job?.total_matches ?? 0)} />
          <Metric label={<I18nText en="Fetched matches" ru="Загружено матчей" />} value={formatNumber(job?.fetched_matches ?? 0)} />
          <Metric label={<I18nText en="Skipped matches" ru="Пропущено матчей" />} value={formatNumber(job?.skipped_matches ?? 0)} />
          <Metric label={<I18nText en="Failed matches" ru="Матчей с ошибкой" />} value={formatNumber(job?.failed_matches ?? 0)} />
          <Metric label={<I18nText en="Processed scopes" ru="Обработано периодов" />} value={`${formatNumber(job?.processed_scopes ?? 0)} / ${formatNumber(job?.total_scopes ?? status.total_configured_scopes)}`} />
          <Metric label={<I18nText en="Processing league" ru="Текущая лига" />} value={job?.current_league_id ?? "-"} />
          <Metric label={<I18nText en="Processing scope season" ru="Текущий сезон" />} value={job?.current_season ?? "-"} />
          <Metric label={<I18nText en="Processing match" ru="Текущий матч" />} value={job?.current_match_id ?? "-"} />
          <Metric label={<I18nText en="Repaired data links" ru="Восстановлено связей" />} value={formatNumber(dataQuality.repaired)} />
          <Metric label={<I18nText en="Dropped invalid rows" ru="Пропущено битых строк" />} value={formatNumber(dataQuality.dropped)} />
          <Metric label={<I18nText en="Started at" ru="Старт" />} value={formatIso(job?.started_at)} />
          <Metric label={<I18nText en="Finished at" ru="Финиш" />} value={formatIso(job?.finished_at ?? status.initial_backfill_completed_at)} />
        </dl>

        {job?.error_message ? (
          <div className="mt-5 rounded bg-rose-50 px-3 py-2 text-sm text-rose-700">
            <span className="font-semibold"><I18nText en="Last error:" ru="Последняя ошибка:" /></span> {job.error_message}
          </div>
        ) : null}
      </section>
    </main>
  );
}

function Metric({ label, value }: { label: ReactNode; value: string }) {
  return (
    <div className="rounded border border-slate-200 bg-field p-4">
      <dt className="text-xs font-medium uppercase text-slate-400">{label}</dt>
      <dd className="mt-2 font-semibold text-ink">{value}</dd>
    </div>
  );
}

function IngestionJobTypeLabel({ type }: { type: string }) {
  const labels: Record<string, { en: string; ru: string }> = {
    initial_backfill: { en: "Initial backfill", ru: "Первичная загрузка" },
    incremental_update: { en: "Incremental update", ru: "Инкрементальное обновление" }
  };
  const label = labels[type] ?? { en: type.replace(/_/g, " "), ru: type.replace(/_/g, " ") };
  return <I18nText en={label.en} ru={label.ru} />;
}

function IngestionStatusLabel({ status }: { status: string }) {
  const labels: Record<string, { en: string; ru: string }> = {
    pending: { en: "Pending", ru: "В очереди" },
    running: { en: "Running", ru: "Выполняется" },
    completed: { en: "Completed", ru: "Завершено" },
    failed: { en: "Failed", ru: "Ошибка" },
    canceled: { en: "Canceled", ru: "Отменено" }
  };
  const label = labels[status] ?? { en: status, ru: status };
  return <I18nText en={label.en} ru={label.ru} />;
}

function formatIso(value: string | Date | null | undefined) {
  if (!value) return "-";
  return formatDate(value instanceof Date ? value : new Date(value));
}

type AdminIngestionJob = NonNullable<Awaited<ReturnType<typeof getIngestionAdminStatus>>["latest_job"]>;

function calculateProgress(job: AdminIngestionJob | null) {
  const empty = {
    overall: 0,
    current_scope: null as number | null,
    current_scope_processed: null as number | null,
    current_scope_total: null as number | null,
    current_scope_index: null as number | null,
    total_scopes: 0
  };
  if (!job || job.total_scopes <= 0) return empty;
  if (job.status === "completed") return { ...empty, overall: 100, total_scopes: job.total_scopes };

  const metadata = metadataRecord(job.metadata);
  const currentScopeTotal = metadataNumber(metadata, "current_scope_total_matches");
  const currentScopeProcessed = metadataNumber(metadata, "current_scope_processed_matches");
  const currentScopeIndex = metadataNumber(metadata, "current_scope_index");
  const currentScope =
    currentScopeTotal !== null && currentScopeTotal > 0
      ? Math.min(100, Math.max(0, ((currentScopeProcessed ?? 0) / currentScopeTotal) * 100))
      : null;
  const currentScopeFraction = currentScope !== null ? currentScope / 100 : 0;
  const overall = ((job.processed_scopes + currentScopeFraction) / job.total_scopes) * 100;

  return {
    overall: Math.min(job.status === "running" ? 99.9 : 100, Math.max(0, overall)),
    current_scope: currentScope,
    current_scope_processed: currentScopeProcessed,
    current_scope_total: currentScopeTotal,
    current_scope_index: currentScopeIndex,
    total_scopes: job.total_scopes
  };
}

function summarizeDataQuality(metadataValue: unknown): { repaired: number; dropped: number } {
  const metadata = metadataRecord(metadataValue);
  const dataQuality = metadataRecord(metadata.data_quality);
  return {
    repaired: sumMetadataNumbers(metadataRecord(dataQuality.repaired)),
    dropped: sumMetadataNumbers(metadataRecord(dataQuality.dropped))
  };
}

function formatProgress(progress: number) {
  if (progress <= 0) return "0%";
  if (progress < 10) return `${progress.toFixed(1)}%`;
  return `${Math.round(progress)}%`;
}

function metadataRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function metadataNumber(metadata: Record<string, unknown>, key: string) {
  const value = metadata[key];
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function sumMetadataNumbers(metadata: Record<string, unknown>): number {
  return Object.values(metadata).reduce<number>((total, value) => total + (typeof value === "number" && Number.isFinite(value) ? value : 0), 0);
}
