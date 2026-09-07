/** Synthetic football fixtures in the dedicated KHL test DB only. */
import { PrismaClient } from "@prisma/client";
import { FANTASY_MODEL_VERSION } from "../src/machete/foontasy_style_model";
const db = new PrismaClient();
async function main() {
  if (process.env.KHL_TEST_DATABASE !== "true" || !process.env.DATABASE_URL?.includes("127.0.0.1:55439/khl_test")) throw new Error("Dedicated local test DB only");
  const season = "2026/2027", now = new Date();
  for (const leagueId of [63n, 47n]) {
    await db.coreLeague.upsert({ where: { id: leagueId }, create: { id: leagueId, name: leagueId === 63n ? "Russia Premier League" : "Premier League", country: leagueId === 63n ? "Russia" : "England" }, update: {} });
    await db.leagueSeason.upsert({ where: { leagueId_season: { leagueId, season } }, create: { leagueId, season, isCurrent: true }, update: { isCurrent: true } });
    const provider = leagueId === 47n ? "FPL" : "SPORTS_RU";
    const contest = await db.fantasyContest.upsert({ where: { provider_leagueId_season: { provider, leagueId, season } }, create: { provider, leagueId, season, name: "TEST FOOTBALL", maxPlayersPerTeam: provider === "FPL" ? 3 : 2 }, update: {} });
    for (let team = 0; team < 10; team++) {
      const teamId = leagueId * 10000n + BigInt(team);
      await db.coreTeam.upsert({ where: { id: teamId }, create: { id: teamId, name: `Test club ${leagueId}-${team}` }, update: {} });
      await db.leagueSeasonTeam.upsert({ where: { leagueId_season_teamId: { leagueId, season, teamId } }, create: { leagueId, season, teamId }, update: {} });
      for (let p = 0; p < 4; p++) {
        const playerId = teamId * 10n + BigInt(p), name = `Test ${leagueId} player ${team}-${p}`, position = ["GK", "DEF", "MID", "FWD"][p];
        await db.corePlayer.upsert({ where: { id: playerId }, create: { id: playerId, name }, update: {} });
        await db.teamPlayerSeason.upsert({ where: { leagueId_season_teamId_playerId: { leagueId, season, teamId, playerId } }, create: { leagueId, season, teamId, playerId, position, isStarter: true }, update: {} });
        await db.fantasyPlayerPrice.upsert({ where: { contestId_providerPlayerId: { contestId: contest.id, providerPlayerId: String(playerId) } }, create: { contestId: contest.id, leagueId, season, provider, playerId, teamId, providerPlayerId: String(playerId), playerName: name, normalizedName: name.toLowerCase(), teamName: `Test club ${leagueId}-${team}`, position, price: 5 }, update: { lastSeenAt: now } });
        for (const horizon of [3, 5]) await db.fantasyModelForecast.upsert({ where: { leagueId_season_playerId_horizon_modelVersion: { leagueId, season, playerId, horizon, modelVersion: FANTASY_MODEL_VERSION } }, create: { leagueId, season, playerId, horizon, modelVersion: FANTASY_MODEL_VERSION, points: 5 * horizon, fixturesAvailable: 5, fixturesRequired: horizon, status: "READY", inputSources: ["TEST_FIXTURE"], breakdown: {}, calculatedAt: now }, update: { calculatedAt: now } });
        for (let round = 1; round <= 5; round++) await db.foontasyForecast.upsert({ where: { leagueId_season_sourceVariant_sourceSeasonId_sourceRoundNumber_sourcePlayerId: { leagueId, season, sourceVariant: "sports", sourceSeasonId: "TEST", sourceRoundNumber: round, sourcePlayerId: String(playerId) } }, create: { leagueId, season, sourceVariant: "sports", sourceSeasonId: "TEST", sourceRoundNumber: round, sourceRoundLabel: String(round), roundNumber: round, sourcePlayerId: String(playerId), playerId, playerName: name, teamName: `Test club ${leagueId}-${team}`, position, points: 5, price: 5 }, update: { fetchedAt: now } });
      }
    }
    for (let round = 1; round <= 5; round++) for (let match = 0; match < 5; match++) {
      const id = leagueId * 1000000n + BigInt(round * 10 + match), matchDate = new Date(now.getTime() + round * 7 * 86400000);
      await db.coreMatch.upsert({ where: { id }, create: { id, leagueId, season, round: String(round), homeTeamId: leagueId * 10000n + BigInt(match * 2), awayTeamId: leagueId * 10000n + BigInt(match * 2 + 1), status: "notstarted", matchDate, utcTime: matchDate }, update: { matchDate, utcTime: matchDate } });
      await db.fixtureOddsSnapshot.upsert({ where: { matchId_provider: { matchId: id, provider: "FONBET" } }, create: { matchId: id, provider: "FONBET", providerEventId: `TEST-${id}`, status: "AVAILABLE", fetchedAt: now, homeOver15Probability: .6, awayOver15Probability: .4, homeCleanSheetProbability: .3, awayCleanSheetProbability: .2 }, update: { fetchedAt: now } });
    }
    await db.ingestionJob.create({ data: { jobType: "incremental_update", status: "completed", startedAt: now, finishedAt: now, metadata: { synthetic: true, completed_canonical_scopes: [{ league_id: String(leagueId), season, status: "completed", upcoming_fixtures_discovered: 25, finished_at: now.toISOString() }] } } });
    await db.dataQualityAuditRun.create({ data: { leagueId, season, modelVersion: "TEST", modelHash: "TEST", gatePassed: true, status: "COMPLETED", forecastCoverage: 100, finishedMatches: 0, startedAt: now, completedAt: now, report: { synthetic: true } } });
  }
  console.log("Synthetic football regression fixtures seeded; no external data imported.");
}
main().catch(e => { console.error(e); process.exitCode = 1; }).finally(() => db.$disconnect());
