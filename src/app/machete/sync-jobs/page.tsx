import { MacheteShell } from "@/components/machete/MacheteShell";
import { MacheteSyncJobList } from "@/components/machete/MacheteSyncJobList";
import { PageBreadcrumbs } from "@/components/page-breadcrumbs";
import { I18nText } from "@/components/i18n-text";
import { prisma } from "@/lib/db";
import { macheteLeagueDisplayName } from "@/lib/leagues/display";

export const dynamic = "force-dynamic";

export default async function MacheteSyncJobsPage() {
  const jobs = await prisma.macheteSyncJob.findMany({
    orderBy: { createdAt: "desc" },
    take: 50,
    include: {
      league: true,
      team: true
    }
  });

  return (
    <MacheteShell>
      <div className="mt-6">
        <PageBreadcrumbs
          backHref="/machete/leagues"
          backLabel={<I18nText en="Back to Machete leagues" ru="Назад к лигам Machete" />}
          items={[
            { label: "Machete", href: "/machete/leagues" },
            { label: <I18nText en="Data jobs" ru="Задачи данных" />, href: "/machete/sync-jobs" }
          ]}
        />
      </div>
      <section className="mt-8">
        <p className="kicker">
          <I18nText en="Machete operations" ru="Операции Machete" />
        </p>
        <h2 className="mt-2 text-2xl font-bold text-ink">
          <I18nText en="Data job history" ru="История задач данных" />
        </h2>
        <p className="mt-2 max-w-2xl text-sm text-slate-600">
          <I18nText
            en="Recent FotMob jobs with their scope, status, finish time and errors."
            ru="Последние задачи FotMob с областью запуска, статусом, временем завершения и ошибками."
          />
        </p>
      </section>
      <section className="mt-6">
        <MacheteSyncJobList
          jobs={jobs.map((job) => ({
            id: job.id,
            type: job.type,
            status: job.status,
            leagueName: job.league ? macheteLeagueDisplayName(job.league) : null,
            teamName: job.team?.name ?? null,
            createdAt: job.createdAt,
            startedAt: job.startedAt,
            finishedAt: job.finishedAt,
            errorMessage: job.errorMessage
          }))}
        />
      </section>
    </MacheteShell>
  );
}
