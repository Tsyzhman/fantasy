import { MacheteShell } from "@/components/machete/MacheteShell";
import { MacheteSyncJobList } from "@/components/machete/MacheteSyncJobList";
import { PageBreadcrumbs } from "@/components/page-breadcrumbs";
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
          backLabel="Back to Machete leagues"
          items={[
            { label: "Machete", href: "/machete/leagues" },
            { label: "Sync jobs", href: "/machete/sync-jobs" }
          ]}
        />
      </div>
      <section className="mt-8">
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
