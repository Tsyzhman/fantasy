import { NextResponse } from "next/server";

import { isDatabaseConfigured, prisma } from "@/lib/db";
import { FPL_LEAGUE_ID, FPL_PROVIDER, FPL_SEASON } from "@/lib/providers/fpl";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_SNAPSHOT_AGE_MINUTES = 12 * 60 + 15;
const MINIMUM_MAPPED_PERCENT = 99;

export async function GET() {
  if (process.env.FPL_ENABLED === "false") {
    return NextResponse.json({ status: "disabled", provider: FPL_PROVIDER, enabled: false });
  }
  if (!isDatabaseConfigured()) return NextResponse.json({ status: "error", reason: "DATABASE_NOT_CONFIGURED", provider: FPL_PROVIDER }, { status: 503 });
  try {
    const contest = await prisma.fantasyContest.findUnique({
      where: { provider_leagueId_season: { provider: FPL_PROVIDER, leagueId: FPL_LEAGUE_ID, season: FPL_SEASON } },
      select: { id: true, lastSyncedAt: true, sourceUrl: true }
    });
    if (!contest) return NextResponse.json({ status: "error", reason: "CONTEST_NOT_SYNCED", provider: FPL_PROVIDER }, { status: 503 });
    const [snapshot, priceCount, mappedPlayerCount, mappingCount, unmatchedCount, latestScore] = await Promise.all([
      prisma.fantasyPlayerPriceSnapshot.findFirst({ where: { contestId: contest.id, status: "READY" }, orderBy: { fetchedAt: "desc" }, select: { snapshotKey: true, fetchedAt: true, payloadHash: true } }),
      prisma.fantasyPlayerPrice.count({ where: { contestId: contest.id, provider: FPL_PROVIDER } }),
      prisma.fantasyPlayerPrice.count({ where: { contestId: contest.id, provider: FPL_PROVIDER, playerId: { not: null } } }),
      prisma.providerEntityMap.count({ where: { contestId: contest.id, provider: FPL_PROVIDER, status: "MATCHED" } }),
      prisma.providerEntityMap.count({ where: { contestId: contest.id, provider: FPL_PROVIDER, status: "UNMATCHED" } }),
      prisma.fantasyProviderPlayerMatchScore.findFirst({ where: { contestId: contest.id, provider: FPL_PROVIDER }, orderBy: [{ gameweek: "desc" }, { fetchedAt: "desc" }], select: { gameweek: true, fetchedAt: true } })
    ]);
    const ageMinutes = snapshot ? Math.max(0, (Date.now() - snapshot.fetchedAt.getTime()) / 60_000) : null;
    const fresh = ageMinutes !== null && ageMinutes <= MAX_SNAPSHOT_AGE_MINUTES;
    const mappedPercent = priceCount > 0 ? (mappedPlayerCount / priceCount) * 100 : 0;
    const complete = priceCount > 0 && mappedPercent >= MINIMUM_MAPPED_PERCENT;
    let scoreStatus: "NOT_AVAILABLE_YET" | "READY" | "INCOMPLETE" = "NOT_AVAILABLE_YET";
    let scoreRows = 0;
    let mappedScoreRows = 0;
    if (latestScore) {
      [scoreRows, mappedScoreRows] = await Promise.all([
        prisma.fantasyProviderPlayerMatchScore.count({ where: { contestId: contest.id, provider: FPL_PROVIDER, gameweek: latestScore.gameweek } }),
        prisma.fantasyProviderPlayerMatchScore.count({ where: { contestId: contest.id, provider: FPL_PROVIDER, gameweek: latestScore.gameweek, playerId: { not: null } } })
      ]);
      scoreStatus = scoreRows > 0 && (mappedScoreRows / scoreRows) * 100 >= MINIMUM_MAPPED_PERCENT ? "READY" : "INCOMPLETE";
    }
    const healthy = fresh && complete && scoreStatus !== "INCOMPLETE";
    return NextResponse.json({
      status: healthy ? "ok" : "error",
      provider: FPL_PROVIDER,
      leagueId: String(FPL_LEAGUE_ID),
      season: FPL_SEASON,
      healthy,
      fresh,
      complete,
      minimumMappedPercent: MINIMUM_MAPPED_PERCENT,
      maxSnapshotAgeMinutes: MAX_SNAPSHOT_AGE_MINUTES,
      contestId: contest.id,
      sourceUrl: contest.sourceUrl,
      scoreStatus,
      lastSyncedAt: contest.lastSyncedAt?.toISOString() ?? null,
      snapshot: snapshot ? { snapshotKey: snapshot.snapshotKey, fetchedAt: snapshot.fetchedAt.toISOString(), ageMinutes, payloadHash: snapshot.payloadHash } : null,
      counts: { prices: priceCount, mappedPlayers: mappedPlayerCount, mappedPercent, matchedEntities: mappingCount, unmatchedEntities: unmatchedCount, latestOfficialGameweek: latestScore?.gameweek ?? null, officialScoreRows: scoreRows, mappedOfficialScoreRows: mappedScoreRows, officialScoreMappedPercent: scoreRows > 0 ? (mappedScoreRows / scoreRows) * 100 : null }
    }, { status: healthy ? 200 : 503 });
  } catch (error) {
    return NextResponse.json({ status: "error", reason: "QUERY_FAILED", provider: FPL_PROVIDER, message: error instanceof Error ? error.message : String(error) }, { status: 503 });
  }
}
