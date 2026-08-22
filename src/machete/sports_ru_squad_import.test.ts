import assert from "node:assert/strict";
import test from "node:test";
import type { PrismaClient } from "@prisma/client";

import {
  createFantasySquadRoundPlans,
  defaultFantasySquadRules,
  fantasyProviderPlaceholderPlayerId,
  type FantasyPlannerPlayer,
  type FantasySquadSelection
} from "./squad_logic";
import { mapSportsRuPublishedSquad, mergeImportedSquadWithFuturePlans, reconcileSportsRuSquadAvailability } from "./sports_ru_squad_import";

test("Sports.ru import keeps an unknown provider player as a priced placeholder", async () => {
  const prisma = {
    fantasyPlayerPrice: {
      findMany: async () => [
        {
          providerPlayerId: "known-1",
          playerId: 101n,
          teamId: 501n,
          playerName: "Known player",
          teamName: "Betis",
          sportsTeamName: "Бетис",
          price: 6.1,
          position: "GK"
        },
        {
          providerPlayerId: "new-2",
          playerId: null,
          teamId: 502n,
          playerName: "Provider fallback name",
          teamName: "Sevilla",
          sportsTeamName: "Севилья",
          price: 7.2,
          position: "MID"
        }
      ]
    }
  } as unknown as PrismaClient;

  const preview = await mapSportsRuPublishedSquad(prisma, {
    profileId: "profile-1",
    contestId: "contest-1",
    leagueId: 87n,
    season: "2026/2027",
    expectedSquadSize: 2,
    published: {
      providerSquadId: "squad-1",
      squadName: "Imported",
      seasonId: "season-1",
      tournamentHru: "spain",
      tournamentName: "Испания",
      tourId: "2462",
      tourName: "2 тур",
      tourFinishedAt: "2026-08-28T00:00:00Z",
      totalPrice: 14.5,
      currentBalance: 85.5,
      players: [
        {
          providerPlayerId: "known-1",
          name: "Known player",
          teamName: "Бетис",
          role: "GOALKEEPER",
          price: 6.1,
          isStarter: true,
          isCaptain: false,
          isViceCaptain: false,
          substitutePriority: null
        },
        {
          providerPlayerId: "new-2",
          name: "Новый игрок Sports.ru",
          teamName: "Севилья",
          role: "MIDFIELDER",
          price: 8.4,
          isStarter: true,
          isCaptain: true,
          isViceCaptain: false,
          substitutePriority: null
        }
      ]
    }
  });

  const placeholderId = fantasyProviderPlaceholderPlayerId("SPORTS_RU", "new-2");
  assert.deepEqual(preview.selections.map((selection) => selection.playerId), ["101", placeholderId]);
  assert.equal(preview.selections[1].purchasePrice, 8.4, "the published-squad price wins over the price snapshot");
  assert.deepEqual(preview.unmapped, [{
    playerId: placeholderId,
    provider: "SPORTS_RU",
    providerPlayerId: "new-2",
    name: "Новый игрок Sports.ru",
    teamId: "502",
    teamName: "Севилья",
    position: "MIDFIELDER",
    price: 8.4
  }]);
});

test("Sports.ru import creates a placeholder when the provider player has no local price row at all", async () => {
  const prisma = {
    fantasyPlayerPrice: {
      findMany: async () => []
    }
  } as unknown as PrismaClient;

  const preview = await mapSportsRuPublishedSquad(prisma, {
    profileId: "profile-1",
    contestId: "contest-1",
    leagueId: 48n,
    season: "2026/2027",
    expectedSquadSize: 1,
    published: {
      providerSquadId: "squad-1",
      squadName: "Imported",
      seasonId: "season-1",
      tournamentHru: "russia",
      tournamentName: "Россия",
      tourId: "100",
      tourName: "1 тур",
      tourFinishedAt: null,
      totalPrice: 7.5,
      currentBalance: 92.5,
      players: [{
        providerPlayerId: "missing-everywhere",
        name: "Игрок вне нашей лиги",
        teamName: "Бывший клуб",
        role: "FORWARD",
        price: 7.5,
        isStarter: true,
        isCaptain: false,
        isViceCaptain: false,
        substitutePriority: null
      }]
    }
  });

  assert.equal(preview.selections.length, 1);
  assert.equal(preview.selections[0].playerId, fantasyProviderPlaceholderPlayerId("SPORTS_RU", "missing-everywhere"));
  assert.equal(preview.selections[0].purchasePrice, 7.5);
  assert.deepEqual(preview.unmapped.map((player) => ({
    providerPlayerId: player.providerPlayerId,
    name: player.name,
    teamName: player.teamName,
    position: player.position,
    price: player.price
  })), [{
    providerPlayerId: "missing-everywhere",
    name: "Игрок вне нашей лиги",
    teamName: "Бывший клуб",
    position: "FORWARD",
    price: 7.5
  }]);
});

test("Sports.ru availability reconciliation reuses an existing placeholder without duplicating it", () => {
  const playerId = fantasyProviderPlaceholderPlayerId("SPORTS_RU", "gone-1");
  const placeholder = {
    playerId,
    provider: "SPORTS_RU" as const,
    providerPlayerId: "gone-1",
    name: "Ушедший игрок",
    teamId: "provider-team:SPORTS_RU:former",
    teamName: "Бывший клуб",
    position: "FORWARD",
    price: 7.5
  };

  const reconciled = reconcileSportsRuSquadAvailability({
    preview: {
      profileId: "profile-1",
      providerSquadId: "squad-1",
      squadName: "Imported",
      tournamentName: "Россия",
      tourId: "100",
      tourName: "1 тур",
      selections: [{ playerId, isStarter: true, isLocked: false, isCaptain: false, isViceCaptain: false, slotIndex: 0, purchasePrice: 7.5 }],
      unmapped: [placeholder]
    },
    published: {
      providerSquadId: "squad-1",
      squadName: "Imported",
      seasonId: "season-1",
      tournamentHru: "russia",
      tournamentName: "Россия",
      tourId: "100",
      tourName: "1 тур",
      tourFinishedAt: null,
      totalPrice: 7.5,
      currentBalance: 92.5,
      players: [{
        providerPlayerId: "gone-1",
        name: "Ушедший игрок",
        teamName: "Бывший клуб",
        role: "FORWARD",
        price: 7.5,
        isStarter: true,
        isCaptain: false,
        isViceCaptain: false,
        substitutePriority: null
      }]
    },
    availablePlayerIds: []
  });

  assert.deepEqual(reconciled.selections.map((selection) => selection.playerId), [playerId]);
  assert.deepEqual(reconciled.unmapped, [placeholder]);
});

test("Sports.ru import replaces current and linked rounds while retaining a valid independent future plan", () => {
  const positions = ["GK", "GK", "DEF", "DEF", "DEF", "DEF", "DEF", "MID", "MID", "MID", "MID", "MID", "FWD", "FWD", "FWD"] as const;
  const pool = positions.map((position, index) => fantasyPlayer(String(index + 1), position));
  pool.push(fantasyPlayer("16", "DEF"));
  const starterIndexes = new Set([0, 2, 3, 4, 5, 7, 8, 9, 10, 12, 13]);
  const imported = positions.map((_, index) => selection(String(index + 1), index, starterIndexes.has(index)));
  const existing = createFantasySquadRoundPlans(imported);
  existing[2] = {
    roundOffset: 2,
    linkedToPrevious: false,
    selections: imported.map((item) => item.playerId === "3" ? { ...item, playerId: "16" } : { ...item })
  };
  existing[3].linkedToPrevious = true;

  const merged = mergeImportedSquadWithFuturePlans({ importedSelections: imported, existingPlans: existing, pool, rules: { ...defaultFantasySquadRules, maxPlayersPerTeam: 15 } });

  assert.deepEqual(merged[1].selections.map((item) => item.playerId), imported.map((item) => item.playerId));
  assert.equal(merged[2].linkedToPrevious, false);
  assert.ok(merged[2].selections.some((item) => item.playerId === "16"));
  assert.deepEqual(merged[3].selections.map((item) => item.playerId), merged[2].selections.map((item) => item.playerId));
});

function selection(playerId: string, slotIndex: number, isStarter: boolean): FantasySquadSelection {
  return { playerId, slotIndex, isStarter, isLocked: false, isCaptain: playerId === "3", isViceCaptain: playerId === "8", purchasePrice: 5 };
}

function fantasyPlayer(playerId: string, positionGroup: FantasyPlannerPlayer["positionGroup"]): FantasyPlannerPlayer {
  return {
    id: playerId,
    playerId,
    teamId: `team-${playerId}`,
    name: `Player ${playerId}`,
    teamName: `Team ${playerId}`,
    leagueName: "League",
    position: positionGroup,
    positionGroup,
    price: 5,
    priceSource: "SPORTS_RU",
    predictedFp: 5,
    valueScore: 1,
    roundPoints: [5],
    fixtures: ["OPP"],
    fixtureDifficulties: [3]
  };
}
