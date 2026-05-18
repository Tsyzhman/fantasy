import { formatDate } from "@/lib/format";

import { MacheteStatusBadge } from "./MacheteStatusBadge";

export type MacheteSyncJobRow = {
  id: string;
  type: string;
  status: string;
  leagueName: string | null;
  teamName: string | null;
  createdAt: Date | string;
  startedAt: Date | string | null;
  finishedAt: Date | string | null;
  errorMessage: string | null;
};

export function MacheteSyncJobList({ jobs }: { jobs: MacheteSyncJobRow[] }) {
  return (
    <div className="overflow-hidden rounded border border-slate-200 bg-white shadow-soft">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500">
            <tr>
              <th className="px-4 py-3">Job</th>
              <th className="px-4 py-3">Scope</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Created</th>
              <th className="px-4 py-3">Finished</th>
              <th className="px-4 py-3">Error</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {jobs.map((job) => (
              <tr key={job.id} className="hover:bg-slate-50">
                <td className="whitespace-nowrap px-4 py-3 font-medium text-ink">{job.type.replace(/_/g, " ")}</td>
                <td className="whitespace-nowrap px-4 py-3 text-slate-600">
                  {[job.leagueName, job.teamName].filter(Boolean).join(" / ") || "Global"}
                </td>
                <td className="whitespace-nowrap px-4 py-3">
                  <MacheteStatusBadge status={job.status} />
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-slate-600">{formatDate(job.createdAt)}</td>
                <td className="whitespace-nowrap px-4 py-3 text-slate-600">{formatDate(job.finishedAt)}</td>
                <td className="max-w-xs truncate px-4 py-3 text-rose-700">{job.errorMessage ?? "-"}</td>
              </tr>
            ))}
            {jobs.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-slate-500">
                  No Machete sync jobs yet.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
