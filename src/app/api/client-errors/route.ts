import { NextResponse } from "next/server";

import { jsonError, withApiHandler } from "@/lib/api-handler";
import { isDatabaseConfigured, prisma } from "@/lib/db";
import { acceptClientErrorRequest, parseClientCriticalErrorPayload } from "@/monitoring/client-critical-errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const maximumPayloadBytes = 256;
const maximumEventsPerMinute = 100;
const retentionDays = 30;

export const POST = withApiHandler(async (request: Request) => {
  if (!isDatabaseConfigured()) return jsonError("DATABASE_NOT_CONFIGURED", "Client error collection is unavailable.", 503);
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (Number.isFinite(contentLength) && contentLength > maximumPayloadBytes) {
    return jsonError("PAYLOAD_TOO_LARGE", "Client error payload is too large.", 413);
  }
  if (!acceptClientErrorRequest()) {
    return jsonError("RATE_LIMITED", "Client error collection limit reached.", 429);
  }

  const rawBody = await readBoundedRequestBody(request, maximumPayloadBytes);
  if (rawBody === null) {
    return jsonError("PAYLOAD_TOO_LARGE", "Client error payload is too large.", 413);
  }
  let rawPayload: unknown;
  try {
    rawPayload = JSON.parse(rawBody || "null") as unknown;
  } catch {
    return jsonError("BAD_REQUEST", "Client error payload must be valid JSON.", 400);
  }
  const payload = parseClientCriticalErrorPayload(rawPayload);
  if (!payload) return jsonError("BAD_REQUEST", "Client error payload is invalid.", 400);

  const occurredMinute = minuteStart(new Date());
  const retentionCutoff = new Date(occurredMinute.getTime() - retentionDays * 24 * 60 * 60 * 1_000);
  const accepted = await prisma.$transaction(async (transaction) => {
    const lock = await transaction.$queryRaw<Array<{ acquired: boolean }>>`
      SELECT pg_try_advisory_xact_lock(hashtextextended('client-critical-errors', 0)) AS "acquired"
    `;
    if (lock[0]?.acquired !== true) return false;
    await transaction.clientCriticalErrorEvent.deleteMany({ where: { occurredMinute: { lt: retentionCutoff } } });
    const aggregate = await transaction.clientCriticalErrorEvent.aggregate({
      where: { occurredMinute },
      _sum: { count: true }
    });
    if ((aggregate._sum.count ?? 0) >= maximumEventsPerMinute) return false;
    await transaction.clientCriticalErrorEvent.upsert({
      where: {
        kind_routeGroup_occurredMinute: {
          kind: payload.kind,
          routeGroup: payload.routeGroup,
          occurredMinute
        }
      },
      create: { ...payload, occurredMinute },
      update: { count: { increment: 1 } }
    });
    return true;
  });

  if (!accepted) return jsonError("RATE_LIMITED", "Client error collection limit reached.", 429);
  return new NextResponse(null, { status: 202, headers: { "Cache-Control": "no-store" } });
});

function minuteStart(value: Date) {
  const result = new Date(value);
  result.setUTCSeconds(0, 0);
  return result;
}

async function readBoundedRequestBody(request: Request, maximumBytes: number) {
  if (!request.body) return "";
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      totalBytes += value.byteLength;
      if (totalBytes > maximumBytes) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const body = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(body);
}
