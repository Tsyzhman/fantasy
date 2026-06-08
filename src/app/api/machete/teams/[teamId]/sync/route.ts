import { requiredStringParam, withApiHandler } from "@/lib/api-handler";
import { requireApiAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { macheteJobResponse } from "@/lib/machete-job-response";
import { runMacheteJob } from "@/providers/fotmob/jobs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = withApiHandler(async (_request: Request, { params }: { params: Promise<{ teamId: string }> }) => {
  const auth = await requireApiAdmin();
  if (auth.response) return auth.response;

  const teamId = requiredStringParam((await params).teamId, "teamId");
  const team = await prisma.macheteTeam.findUnique({ where: { id: teamId } });
  const result = await runMacheteJob(prisma, {
    type: "SYNC_TEAM",
    leagueId: team?.leagueId,
    teamId
  });

  return macheteJobResponse(result);
});
