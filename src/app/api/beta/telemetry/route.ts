import { NextResponse } from "next/server";

import { classifyBetaTelemetryMutation, parseBetaTelemetryCommand } from "@/beta/user-test";
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

  const result = await prisma.$transaction(async (transaction) => {
    // Serialize finish and observation requests for this opaque run ID. Without
    // the lock, an observation that read the open state immediately before a
    // concurrent finish could mutate a supposedly immutable submitted run.
    await transaction.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${command.runId}, 0))`;
    const run = await transaction.betaTestRun.findFirst({
      where: { id: command.runId, userId: auth.user.id },
      select: { id: true, submittedAt: true, reviewedAt: true }
    });
    if (!run) return { status: "not_found" as const };

    const mutationStatus = classifyBetaTelemetryMutation(command.action, run);
    if (command.action === "finish") {
      if (!run.submittedAt) {
        await transaction.betaTestRun.update({
          where: { id: command.runId },
          data: { submittedAt: new Date() }
        });
      }
      return { status: "accepted" as const };
    }

    if (mutationStatus === "immutable") return { status: mutationStatus };
    const uniqueKey = {
      runId_kind_name_route: {
        runId: command.runId,
        kind: command.kind,
        name: command.name,
        route: command.route
      }
    };
    const existingObservation = await transaction.betaTestObservation.findUnique({ where: uniqueKey, select: { id: true } });
    if (!existingObservation) {
      const observationCount = await transaction.betaTestObservation.count({ where: { runId: command.runId } });
      if (observationCount >= maximumObservationsPerRun) return { status: "rate_limited" as const };
    }
    await transaction.betaTestObservation.upsert({
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
    return { status: "accepted" as const };
  });

  if (result.status === "not_found") return jsonError("NOT_FOUND", "Beta test run not found for this account.", 404);
  if (result.status === "immutable") return jsonError("RUN_FINALIZED", "Submitted beta test runs cannot accept more observations.", 409);
  if (result.status === "rate_limited") return jsonError("RATE_LIMITED", "Beta test run has reached its observation limit.", 429);
  return accepted(command.runId, 200);
});

function accepted(runId: string, status: number) {
  return NextResponse.json(
    { accepted: true, runId },
    { status, headers: { "Cache-Control": "private, no-store" } }
  );
}
