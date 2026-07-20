import { NextResponse } from "next/server";

import { jsonError, withApiHandler } from "@/lib/api-handler";
import { requireApiUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { normalizeSportsRuProfileId } from "@/lib/providers/sports-ru-fantasy";
import { readJsonObject } from "@/lib/request-json";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const provider = "SPORTS_RU";

export const GET = withApiHandler(async () => {
  const auth = await requireApiUser();
  if (auth.response) return auth.response;
  const profile = await prisma.userExternalProfile.findUnique({
    where: { userId_provider: { userId: auth.user.id, provider } }
  });
  return NextResponse.json({
    profile: profile ? {
      providerUserId: profile.providerUserId,
      profileUrl: profile.profileUrl,
      lastImportedAt: profile.lastImportedAt?.toISOString() ?? null,
      lastError: profile.lastError
    } : null
  });
});

export const PUT = withApiHandler(async (request: Request) => {
  const auth = await requireApiUser();
  if (auth.response) return auth.response;
  const body = await readJsonObject(request);
  const profileId = normalizeSportsRuProfileId(typeof body.profile === "string" ? body.profile : "");
  if (!profileId) return jsonError("BAD_REQUEST", "Enter a numeric Sports.ru profile ID or a sports.ru/profile/<id> URL.", 400);
  const profileUrl = `https://www.sports.ru/profile/${profileId}/`;
  const profile = await prisma.userExternalProfile.upsert({
    where: { userId_provider: { userId: auth.user.id, provider } },
    update: { providerUserId: profileId, profileUrl, lastError: null },
    create: { userId: auth.user.id, provider, providerUserId: profileId, profileUrl }
  });
  return NextResponse.json({ profile: { providerUserId: profile.providerUserId, profileUrl: profile.profileUrl } });
});

export const DELETE = withApiHandler(async () => {
  const auth = await requireApiUser();
  if (auth.response) return auth.response;
  await prisma.userExternalProfile.deleteMany({ where: { userId: auth.user.id, provider } });
  return NextResponse.json({ profile: null });
});
