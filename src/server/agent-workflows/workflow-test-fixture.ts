/** @spec spec://modules/agents/FEAT-017-squad-workflows#acceptance */
import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { defaultFantasyHistorySettings, fantasyHistorySettingsKey } from "@/machete/squad-history";
import { createFantasySquadRoundPlans, defaultFantasySquadRules, type FantasyPlannerPlayer } from "@/machete/squad_logic";
import { fantasyProviderRoundKey } from "@/machete/squad_planner";

/** Isolated Sports.ru roster and persisted forecasts for API and database contract tests. */
export async function seedWorkflowSquad(db: PrismaClient, userId: string) {
  const prefix = randomUUID();
  const leagueId = BigInt("0x" + prefix.replaceAll("-", "").slice(0, 12)) * 100n;
  const provider = "SPORTS_RU", season = "2026/2027";
  const roles = ["GK", "DEF", "DEF", "DEF", "DEF", "MID", "MID", "MID", "MID", "FWD", "FWD", "GK", "DEF", "MID", "FWD", "DEF", "MID"] as const;
  const athletes = roles.map((position, i) => ({
    id: leagueId + BigInt(i + 1), teamId: leagueId + BigInt(i % 9 + 1), name: `Fixture ${i + 1}`, position,
    price: i === 15 ? 6 : i === 16 ? 4 : 5,
    points: i === 1 || i === 5 ? 1 : i === 15 || i === 16 ? 9 : 4
  }));
  const teamIds = [...new Set(athletes.map(player => player.teamId))];
  const kickoff = new Date(Date.now() + 86_400_000);
  const roundId = fantasyProviderRoundKey(provider, 1, "201");
  const selections = athletes.slice(0, 15).map((player, slotIndex) => ({
    playerId: String(player.id), slotIndex, isStarter: slotIndex < 11, isLocked: false,
    isCaptain: slotIndex === 0, isViceCaptain: slotIndex === 9, purchasePrice: player.price
  }));
  const roundPlans = createFantasySquadRoundPlans(selections);
  roundPlans[2].linkedToPrevious = false;
  roundPlans[2].selections[3].isLocked = true;
  const fixture = await db.$transaction(async tx => {
    await tx.coreLeague.create({ data: { id: leagueId, name: prefix, source: "test" } });
    await tx.leagueSeason.create({ data: { leagueId, season, isCurrent: true } });
    await tx.coreTeam.createMany({ data: teamIds.map(id => ({ id, name: `Team ${id}`, source: "test" })) });
    await tx.corePlayer.createMany({ data: athletes.map(({ id, name }) => ({ id, name, source: "test" })) });
    await tx.leagueSeasonTeam.createMany({ data: teamIds.map(teamId => ({ leagueId, season, teamId })) });
    await tx.teamPlayerSeason.createMany({ data: athletes.map(({ id: playerId, teamId, position }) => ({ leagueId, season, teamId, playerId, position })) });
    const contest = await tx.fantasyContest.create({ data: { leagueId, provider, season, name: prefix, maxPlayersPerTeam: 3 } });
    await tx.fantasyPlayerPrice.createMany({ data: athletes.map(player => ({
      provider, contestId: contest.id, leagueId, season, playerId: player.id, providerPlayerId: String(player.id),
      teamId: player.teamId, playerName: player.name, normalizedName: player.name.toLowerCase(), price: player.price, position: player.position
    })) });
    const round = await tx.fantasyProviderRound.create({ data: {
      provider, contestId: contest.id, ordinal: 1, name: "1", providerRoundId: "201", startsAt: kickoff, fetchedAt: new Date()
    } });
    await tx.fantasyProviderFixture.create({ data: {
      provider, contestId: contest.id, roundId: round.id, providerFixtureId: "fixture-1",
      providerHomeTeamId: "1", providerAwayTeamId: "2", homeTeamId: teamIds[0], awayTeamId: teamIds[1],
      status: "SCHEDULED", kickoffAt: kickoff, fetchedAt: new Date()
    } });
    const roundProjection = { id: roundId, label: "1", startsAt: kickoff.toISOString(), fixtureCount: 1 };
    const snapshot = await tx.fantasyPlayerPoolSnapshot.create({ data: {
      leagueId, season, provider, contestId: contest.id, variant: "CURRENT_XI", status: "READY", revision: prefix,
      historySettingsKey: fantasyHistorySettingsKey(defaultFantasyHistorySettings), calculatedAt: new Date(), playersCount: athletes.length,
      metadata: {
        version: 1, readiness: { ready: true, reasons: [] }, rules: defaultFantasySquadRules, rounds: [roundProjection],
        bookmakerFavorites: [], priceStatus: { sportsRuPrices: athletes.length }, dataFreshness: {}, historySeasonOptions: [season]
      }
    } });
    await tx.fantasyPlayerPoolSnapshotPlayer.createMany({ data: athletes.map(player => {
      const id = String(player.id);
      const payload: FantasyPlannerPlayer = {
        id, playerId: id, name: player.name, teamName: `Team ${player.teamId}`, teamId: String(player.teamId),
        leagueName: prefix, position: player.position, positionGroup: player.position, price: player.price, priceSource: provider,
        predictedFp: player.points, roundPoints: Array(5).fill(player.points), valueScore: player.points / player.price,
        fixtureDifficulties: [3], fixtures: ["Fixture"]
      };
      return { snapshotId: snapshot.id, playerId: id, payload };
    }) });
    const squad = await tx.userFantasySquad.create({ data: {
      userId, provider, leagueId, season, contestId: contest.id, name: prefix, bank: 25, horizonRounds: 3,
      filters: { roundPlans, roundPlanRoundIds: [roundId], transferBaselinePlayerIds: selections.map(player => player.playerId),
        sportsPublicationId: "publication-1", strategy: "upside", personalSetting: "retained" },
      players: { create: selections.map((entry, index) => ({
        ...entry, playerId: athletes[index].id, teamId: athletes[index].teamId, position: athletes[index].position
      })) }
    } });
    return { squadId: squad.id, contestId: contest.id, name: squad.name };
  });
  return { ...fixture, leagueId, roundPlans, athletes,
    moves: [{ outPlayerId: String(athletes[1].id), inPlayerId: String(athletes[15].id) },
      { outPlayerId: String(athletes[5].id), inPlayerId: String(athletes[16].id) }],
    cleanup: async () => {
      await db.coreLeague.delete({ where: { id: leagueId } });
      await db.corePlayer.deleteMany({ where: { id: { in: athletes.map(player => player.id) } } });
      await db.coreTeam.deleteMany({ where: { id: { in: teamIds } } });
    } };
}
