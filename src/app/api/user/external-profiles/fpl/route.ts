import { NextResponse } from "next/server";

import { jsonError, withApiHandler } from "@/lib/api-handler";
import { requireApiUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { normalizeFplEntryId } from "@/lib/providers/fpl";
import { readJsonObject } from "@/lib/request-json";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const provider = "FPL";

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
  const entryId = normalizeFplEntryId(typeof body.entryId === "string" ? body.entryId : typeof body.profile === "string" ? body.profile : "");
  if (!entryId) return jsonError("BAD_REQUEST", "Enter a positive numeric FPL entry ID or an FPL entry URL.", 400);
  const profileUrl = `https://fantasy.premierleague.com/entry/${entryId}/`;
  const profile = await prisma.userExternalProfile.upsert({
    where: { userId_provider: { userId: auth.user.id, provider } },
    update: { providerUserId: entryId, profileUrl, lastError: null },
    create: { userId: auth.user.id, provider, providerUserId: entryId, profileUrl }
  });
  return NextResponse.json({ profile: { providerUserId: profile.providerUserId, profileUrl: profile.profileUrl } });
});

export const DELETE = withApiHandler(async () => {
  const auth = await requireApiUser();
  if (auth.response) return auth.response;
  await prisma.userExternalProfile.deleteMany({ where: { userId: auth.user.id, provider } });
  return NextResponse.json({ profile: null });
});
