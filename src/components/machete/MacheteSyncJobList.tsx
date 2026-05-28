import { I18nText } from "@/components/i18n-text";
import { SortableTable } from "@/components/sortable-table";
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
        <SortableTable className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500">
            <tr>
              <th className="px-4 py-3"><I18nText en="Job" ru="Задача" /></th>
              <th className="px-4 py-3"><I18nText en="Scope" ru="Область" /></th>
              <th className="px-4 py-3"><I18nText en="Status" ru="Статус" /></th>
              <th className="px-4 py-3"><I18nText en="Created" ru="Создано" /></th>
              <th className="px-4 py-3"><I18nText en="Finished" ru="Завершено" /></th>
              <th className="px-4 py-3"><I18nText en="Error" ru="Ошибка" /></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {jobs.map((job) => {
              const label = macheteJobLabel(job.type);

              return (
                <tr key={job.id} className="hover:bg-slate-50">
                  <td className="whitespace-nowrap px-4 py-3 font-medium text-ink"><I18nText en={label.en} ru={label.ru} /></td>
                  <td className="whitespace-nowrap px-4 py-3 text-slate-600">
                    {[job.leagueName, job.teamName].filter(Boolean).join(" / ") || <I18nText en="Global" ru="Глобально" />}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">
                    <MacheteStatusBadge status={job.status} />
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-slate-600">{formatDate(job.createdAt)}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-slate-600">{formatDate(job.finishedAt)}</td>
                  <td className="max-w-xs truncate px-4 py-3 text-rose-700">{job.errorMessage ? <I18nText en={job.errorMessage} ru="Ошибка при выполнении задачи" /> : "-"}</td>
                </tr>
              );
            })}
            {jobs.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-slate-500">
                  <I18nText en="No Machete data jobs yet." ru="Задач данных Machete пока нет." />
                </td>
              </tr>
            ) : null}
          </tbody>
        </SortableTable>
      </div>
    </div>
  );
}

function macheteJobLabel(type: string) {
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

  return labels[type] ?? { en: type.replace(/_/g, " "), ru: type.replace(/_/g, " ") };
}
