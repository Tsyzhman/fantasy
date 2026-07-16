import { NextResponse } from "next/server";

import { parseBetaTelemetryCommand } from "@/beta/user-test";
import { jsonError, withApiHandler } from "@/lib/api-handler";
import { requireApiUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const maximumPayloadBytes = 4_096;
const maximumRunsPerUserPerDay = 20;
const maximumObservationsPerRun = 250;

export const POST = withApiHandler(async (request: Request) => {
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (Number.isFinite(contentLength) && contentLength > maximumPayloadBytes) {
    return jsonError("PAYLOAD_TOO_LARGE", "Beta telemetry payload is too large.", 413);
  }
  const auth = await requireApiUser(request);
  if (auth.response) return auth.response;
  const rawBody = await request.text();
  if (Buffer.byteLength(rawBody, "utf8") > maximumPayloadBytes) {
    return jsonError("PAYLOAD_TOO_LARGE", "Beta telemetry payload is too large.", 413);
  }
  let payload: unknown;
  try {
    payload = JSON.parse(rawBody || "null") as unknown;
  } catch {
    return jsonError("BAD_REQUEST", "Beta telemetry payload must be valid JSON.", 400);
  }
  const parsed = parseBetaTelemetryCommand(payload);
  if (!parsed.ok) return jsonError("BAD_REQUEST", parsed.error, 400);
  const command = parsed.command;

  if (command.action === "start") {
    const existing = await prisma.betaTestRun.findUnique({ where: { id: command.runId }, select: { userId: true } });
    if (existing && existing.userId !== auth.user.id) return jsonError("NOT_FOUND", "Beta test run not found.", 404);
    if (!existing) {
      const recentRuns = await prisma.betaTestRun.count({
        where: { userId: auth.user.id, createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1_000) } }
      });
      if (recentRuns >= maximumRunsPerUserPerDay) {
        return jsonError("RATE_LIMITED", "Too many beta test runs were started for this account today.", 429);
      }
      await prisma.betaTestRun.create({
        data: {
          id: command.runId,
          userId: auth.user.id,
          deviceClass: command.deviceClass,
          viewportWidth: command.viewportWidth,
          synthetic: command.synthetic,
          observations: {
            create: { kind: "MILESTONE", name: "JOURNEY_STARTED", route: "/beta-test" }
          }
        }
      });
    }
    return accepted(command.runId, existing ? 200 : 201);
  }

  const run = await prisma.betaTestRun.findFirst({
    where: { id: command.runId, userId: auth.user.id },
    select: { id: true }
  });
  if (!run) return jsonError("NOT_FOUND", "Beta test run not found for this account.", 404);
  const uniqueKey = {
    runId_kind_name_route: {
      runId: command.runId,
      kind: command.kind,
      name: command.name,
      route: command.route
    }
  };
  const existingObservation = await prisma.betaTestObservation.findUnique({ where: uniqueKey, select: { id: true } });
  if (!existingObservation) {
    const observationCount = await prisma.betaTestObservation.count({ where: { runId: command.runId } });
    if (observationCount >= maximumObservationsPerRun) {
      return jsonError("RATE_LIMITED", "Beta test run has reached its observation limit.", 429);
    }
  }
  await prisma.betaTestObservation.upsert({
    where: uniqueKey,
    create: {
      runId: command.runId,
      kind: command.kind,
      name: command.name,
      route: command.route,
      value: command.value,
      rating: command.rating
    },
    update: {
      // The unique key is the client idempotency key. A lost response may make
      // the browser retry the same observation, which must not invent another
      // page view, milestone, or error.
      route: command.route,
      ...(command.kind === "WEB_VITAL" ? { value: command.value, rating: command.rating } : {})
    }
  });
  return accepted(command.runId, 200);
});

function accepted(runId: string, status: number) {
  return NextResponse.json(
    { accepted: true, runId },
    { status, headers: { "Cache-Control": "private, no-store" } }
  );
}
