import { requiredStringParam, withApiHandler } from "@/lib/api-handler";
import { requireApiAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { macheteJobResponse } from "@/lib/machete-job-response";
import { runMacheteJob } from "@/providers/fotmob/jobs";

type RouteProps = {
  params: Promise<{ leagueId: string }>;
};

export const POST = withApiHandler(async (_request: Request, { params }: RouteProps) => {
  const auth = await requireApiAdmin();
  if (auth.response) return auth.response;

  const leagueId = requiredStringParam((await params).leagueId, "leagueId");
  const result = await runMacheteJob(prisma, {
    type: "SYNC_SHOTS",
    leagueId
  });

  return macheteJobResponse(result, "MIXERR_SYNC_SHOTS_FAILED");
});
