import { NextResponse } from "next/server";

import { isDatabaseConfigured, prisma } from "@/lib/db";
import { clientErrorWindowMinutes, clientErrorWindowStart } from "@/monitoring/client-critical-errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const windowMinutes = clientErrorWindowMinutes(process.env.CLIENT_CRITICAL_ERROR_WINDOW_MINUTES);
  if (!isDatabaseConfigured()) return response(false, windowMinutes, null, [], null, 503);

  try {
    const since = clientErrorWindowStart(new Date(), windowMinutes);
    const [aggregate, grouped, latest] = await Promise.all([
      prisma.clientCriticalErrorEvent.aggregate({ where: { occurredMinute: { gte: since } }, _sum: { count: true } }),
      prisma.clientCriticalErrorEvent.groupBy({
        by: ["kind"],
        where: { occurredMinute: { gte: since } },
        _sum: { count: true },
        orderBy: { kind: "asc" }
      }),
      prisma.clientCriticalErrorEvent.findFirst({
        where: { occurredMinute: { gte: since } },
        orderBy: { occurredMinute: "desc" },
        select: { occurredMinute: true }
      })
    ]);
    const total = aggregate._sum.count ?? 0;
    return response(total === 0, windowMinutes, total, grouped.map((row) => ({ kind: row.kind, count: row._sum.count ?? 0 })), latest?.occurredMinute ?? null, total === 0 ? 200 : 503);
  } catch {
    return response(false, windowMinutes, null, [], null, 503);
  }
}

function response(healthy: boolean, windowMinutes: number, total: number | null, byKind: Array<{ kind: string; count: number }>, lastSeenAt: Date | null, status: number) {
  return NextResponse.json({
    status: healthy ? "ok" : "error",
    healthy,
    windowMinutes,
    total,
    byKind,
    lastSeenAt: lastSeenAt?.toISOString() ?? null
  }, { status, headers: { "Cache-Control": "public, max-age=0, must-revalidate" } });
}
