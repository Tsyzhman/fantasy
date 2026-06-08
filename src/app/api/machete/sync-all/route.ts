import { withApiHandler } from "@/lib/api-handler";
import { requireApiAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { macheteJobResponse } from "@/lib/machete-job-response";
import { runMacheteJob } from "@/providers/fotmob/jobs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = withApiHandler(async () => {
  const auth = await requireApiAdmin();
  if (auth.response) return auth.response;

  const result = await runMacheteJob(prisma, {
    type: "SYNC_ALL_LEAGUES"
  });

  return macheteJobResponse(result);
});
