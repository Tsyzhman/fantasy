import { prisma } from "@/lib/db";
import { fantasySquadLeagueFotMobIds } from "@/lib/leagues/display";
import { cacheFotMobPlayerPhoto, isFotMobPlayerId, readCachedPlayerPhoto } from "@/machete/player-photo-cache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ playerId: string }> }) {
  const { playerId } = await context.params;
  if (!isFotMobPlayerId(playerId)) return new Response(null, { status: 404 });

  try {
    let photo: Buffer;
    try {
      photo = await readCachedPlayerPhoto(playerId);
    } catch {
      const rosterPhoto = await prisma.teamPlayerSeason.findFirst({
        where: {
          playerId: BigInt(playerId),
          leagueId: { in: fantasySquadLeagueFotMobIds.map(BigInt) },
          photoUrl: { not: null }
        },
        select: { photoUrl: true },
        orderBy: { updatedAt: "desc" }
      });
      if (!rosterPhoto?.photoUrl) return new Response(null, { status: 404 });
      photo = await cacheFotMobPlayerPhoto(playerId, rosterPhoto.photoUrl);
    }
    return new Response(new Uint8Array(photo), {
      headers: {
        "Content-Type": "image/png",
        "Content-Length": String(photo.length),
        "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
        "X-Content-Type-Options": "nosniff"
      }
    });
  } catch {
    return new Response(null, {
      status: 404,
      headers: { "Cache-Control": "public, max-age=3600" }
    });
  }
}
