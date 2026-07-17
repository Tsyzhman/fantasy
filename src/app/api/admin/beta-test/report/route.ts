import { NextResponse } from "next/server";

import { buildBetaUserTestReport } from "@/beta/user-test";
import { withApiHandler } from "@/lib/api-handler";
import { requireApiAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const reportWindowDays = 30;

export const GET = withApiHandler(async () => {
  const auth = await requireApiAdmin();
  if (auth.response) return auth.response;

  const since = new Date(Date.now() - reportWindowDays * 24 * 60 * 60 * 1_000);
  const runs = await prisma.betaTestRun.findMany({
    where: { startedAt: { gte: since } },
    select: {
      id: true,
      userId: true,
      deviceClass: true,
      synthetic: true,
      valid: true,
      withoutHelp: true,
      transferReasonUnderstood: true,
      usabilityRating: true,
      criticalIssue: true,
      moderatedEnvironment: true,
      invalidReason: true,
      submittedAt: true,
      startedAt: true,
      observations: {
        select: {
          kind: true,
          name: true,
          route: true,
          value: true,
          rating: true,
          count: true,
          createdAt: true
        },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }]
      }
    },
    orderBy: [{ startedAt: "asc" }, { id: "asc" }]
  });
  const report = {
    scope: { since: since.toISOString(), sinceDays: reportWindowDays },
    ...buildBetaUserTestReport(runs)
  };
  const date = new Date().toISOString().slice(0, 10);

  return NextResponse.json(report, {
    headers: {
      "Cache-Control": "private, no-store",
      "Content-Disposition": `attachment; filename="beta-user-test-${date}.json"`
    }
  });
});
