import { NextResponse } from "next/server";

import { requireApiAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { readJsonObject } from "@/lib/request-json";
import { setSportsRuPlayerMapping } from "@/machete/sports_ru_player_mapping";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(request: Request) {
  const auth = await requireApiAdmin();
  if (auth.response) return auth.response;

  const body = await readJsonObject(request);
  const priceId = typeof body.priceId === "string" ? body.priceId : "";
  const playerId = body.playerId === null || body.playerId === "" ? null : parseBigInt(body.playerId);

  if (!priceId) {
    return NextResponse.json({ error: { code: "BAD_REQUEST", message: "priceId is required." } }, { status: 400 });
  }
  if (body.playerId !== null && body.playerId !== "" && !playerId) {
    return NextResponse.json({ error: { code: "BAD_REQUEST", message: "playerId must be empty or integer-like." } }, { status: 400 });
  }

  try {
    const mapping = await setSportsRuPlayerMapping(prisma, {
      priceId,
      playerId
    });
    return NextResponse.json({ mapping });
  } catch (error) {
    return NextResponse.json(
      { error: { code: "BAD_REQUEST", message: error instanceof Error ? error.message : "Failed to save mapping." } },
      { status: 400 }
    );
  }
}

function parseBigInt(value: unknown) {
  if (typeof value !== "string" && typeof value !== "number" && typeof value !== "bigint") return null;
  try {
    return BigInt(value);
  } catch {
    return null;
  }
}
