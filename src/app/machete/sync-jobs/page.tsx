import { MacheteShell } from "@/components/machete/MacheteShell";
import { MacheteSyncJobList } from "@/components/machete/MacheteSyncJobList";
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
      <p className="mt-4 max-w-2xl text-sm text-slate-600">
          <I18nText
            en="Recent FotMob jobs with their scope, status, finish time and errors."
            ru="Последние задачи FotMob с областью запуска, статусом, временем завершения и ошибками."
          />
      </p>
      <section className="mt-4">
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
