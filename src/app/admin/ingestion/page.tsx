import { DatabaseZap } from "lucide-react";

import { IngestionControls } from "@/components/admin/IngestionControls";
import { getIngestionAdminStatus } from "@/core_data/ingestion-jobs";
import { requireAdminUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { formatDate, formatNumber } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function AdminIngestionPage() {
  await requireAdminUser();
  const status = await getIngestionAdminStatus(prisma);
  const job = status.active_job ?? status.latest_job;
  const progress = calculateProgress(job);

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <section className="rounded border border-slate-200 bg-white p-5 shadow-soft">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
              <DatabaseZap className="h-4 w-4" />
              Data ingestion
            </p>
            <h1 className="mt-2 text-3xl font-bold text-ink">Shared FotMob backfill</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
              {status.initial_backfill_completed
                ? "Initial backfill completed. Future runs should use incremental updates."
                : "Initial backfill has not been completed. Start season: 2023/2024 for autumn-spring leagues, 2023 for calendar-year leagues."}
            </p>
          </div>
          <IngestionControls hasActiveJob={Boolean(status.active_job)} initialBackfillCompleted={status.initial_backfill_completed} />
        </div>
      </section>

      <section className="mt-6 rounded border border-slate-200 bg-white p-5 shadow-soft">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-lg font-bold text-ink">Status</h2>
            <p className="mt-1 text-sm text-slate-500">{job ? `${job.job_type} / ${job.status}` : "No ingestion job has run yet."}</p>
          </div>
          <span className="rounded bg-slate-100 px-3 py-1 text-sm font-semibold text-slate-700">{formatProgress(progress)}</span>
        </div>
        <div className="mt-4 h-2 overflow-hidden rounded bg-slate-100">
          <div className="h-full bg-emerald-500" style={{ width: `${progress}%` }} />
        </div>

        <dl className="mt-6 grid grid-cols-1 gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <Metric label="Total configured leagues" value={formatNumber(status.total_configured_leagues)} />
          <Metric label="Total configured scopes" value={formatNumber(status.total_configured_scopes)} />
          <Metric label="Total discovered matches" value={formatNumber(job?.total_matches ?? 0)} />
          <Metric label="Fetched matches" value={formatNumber(job?.fetched_matches ?? 0)} />
          <Metric label="Skipped matches" value={formatNumber(job?.skipped_matches ?? 0)} />
          <Metric label="Failed matches" value={formatNumber(job?.failed_matches ?? 0)} />
          <Metric label="Processed scopes" value={`${formatNumber(job?.processed_scopes ?? 0)} / ${formatNumber(job?.total_scopes ?? status.total_configured_scopes)}`} />
          <Metric label="Processing league" value={job?.current_league_id ?? "-"} />
          <Metric label="Processing scope season" value={job?.current_season ?? "-"} />
          <Metric label="Processing match" value={job?.current_match_id ?? "-"} />
          <Metric label="Started at" value={formatIso(job?.started_at)} />
          <Metric label="Finished at" value={formatIso(job?.finished_at ?? status.initial_backfill_completed_at)} />
        </dl>

        {job?.error_message ? (
          <div className="mt-5 rounded bg-rose-50 px-3 py-2 text-sm text-rose-700">
            <span className="font-semibold">Last error:</span> {job.error_message}
          </div>
        ) : null}
      </section>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-slate-200 bg-field p-4">
      <dt className="text-xs font-medium uppercase text-slate-400">{label}</dt>
      <dd className="mt-2 font-semibold text-ink">{value}</dd>
    </div>
  );
}

function formatIso(value: string | Date | null | undefined) {
  if (!value) return "-";
  return formatDate(value instanceof Date ? value : new Date(value));
}

type AdminIngestionJob = NonNullable<Awaited<ReturnType<typeof getIngestionAdminStatus>>["latest_job"]>;

function calculateProgress(job: AdminIngestionJob | null) {
  if (!job || job.total_scopes <= 0) return 0;
  if (job.status === "completed") return 100;

  const scopeProgress = job.processed_scopes / job.total_scopes;
  const processedMatches = job.fetched_matches + job.skipped_matches + job.failed_matches;
  const hasActiveScope = Boolean(job.current_league_id || job.current_season || job.current_match_id);
  const discoveredScopes = Math.min(job.total_scopes, job.processed_scopes + (hasActiveScope || job.total_matches > 0 ? 1 : 0));
  const matchProgress =
    job.total_matches > 0 && discoveredScopes > 0
      ? (processedMatches / job.total_matches) * (discoveredScopes / job.total_scopes)
      : 0;

  const progress = Math.max(scopeProgress, matchProgress) * 100;
  return Math.min(job.status === "running" ? 99.9 : 100, Math.max(0, progress));
}

function formatProgress(progress: number) {
  if (progress <= 0) return "0%";
  if (progress < 10) return `${progress.toFixed(1)}%`;
  return `${Math.round(progress)}%`;
}
