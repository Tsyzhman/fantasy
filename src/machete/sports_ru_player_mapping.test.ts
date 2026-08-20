import assert from "node:assert/strict";
import test from "node:test";

import type { PrismaClient } from "@prisma/client";

import {
  autoMapSportsRuFantasyPlayers,
  buildSportsRuMappingCandidates,
  findManualRosterEntry,
  isSafeAutomaticSportsRuCandidate,
  loadSportsRuAuthoritativeStarterCandidate,
  loadSportsRuTeamPlayerMappings,
  planSportsRuTeamAssignmentCorrections,
  planSportsRuSelectionRemap,
  resolveSportsRuSeasonTeam,
  scoreSportsRuCandidate,
  sportsRuDisplayNamesByPlayerId,
  shouldMovePreviousSportsRuSelection,
  shouldRetainManualOverride
} from "./sports_ru_player_mapping";

const liverpool = { name: "Liverpool" };
const city = { name: "Manchester City" };

test("Spain, Championship and Turkey Sports.ru club names resolve to their FotMob season teams", () => {
  const teams = [
    { teamId: 1n, team: { name: "Deportivo Alaves" } },
    { teamId: 2n, team: { name: "Queens Park Rangers" } },
    { teamId: 3n, team: { name: "Başakşehir" } }
  ];
  assert.equal(resolveSportsRuSeasonTeam("Алавес", teams)?.teamId, 1n);
  assert.equal(resolveSportsRuSeasonTeam("КПР", teams)?.teamId, 2n);
  assert.equal(resolveSportsRuSeasonTeam("Истанбул", teams)?.teamId, 3n);
});

test("provider club changes repair team assignments without touching player identities or manual team locks", () => {
  const teams = [
    { teamId: 8302n, team: { name: "Sevilla" } },
    { teamId: 8633n, team: { name: "Real Madrid" } }
  ];
  const corrections = planSportsRuTeamAssignmentCorrections([
    { id: "stale", playerId: 10n, teamId: 8633n, teamName: "Севилья" },
    { id: "correct", playerId: 11n, teamId: 8302n, teamName: "Севилья" },
    { id: "locked", playerId: 12n, teamId: 8633n, teamName: "Севилья" },
    { id: "unmapped-player", playerId: null, teamId: null, teamName: "Севилья" }
  ], teams, new Set(["locked"]));

  assert.deepEqual(corrections, [{
    priceId: "stale",
    playerId: 10n,
    previousTeamId: 8633n,
    teamId: 8302n
  }]);
});

test("an exact birth date safely bridges poor transliteration and rejects a conflicting birthday", () => {
  const entry = {
    playerId: 70332n,
    teamId: 8315n,
    position: "LW",
    player: { name: "Nico Williams", birthDate: new Date("2002-07-12T00:00:00.000Z") },
    team: { name: "Athletic Club" }
  };
  const basePrice = {
    id: "sports-nico",
    playerName: "Нико Уильямс",
    normalizedName: "niko uilyams",
    teamName: "Атлетик",
    position: "MID",
    price: 8
  };
  const matching = scoreSportsRuCandidate({
    ...basePrice,
    providerBirthDate: new Date("2002-07-12T00:00:00.000Z")
  }, entry, 8315n);
  const conflicting = scoreSportsRuCandidate({
    ...basePrice,
    providerBirthDate: new Date("2003-07-12T00:00:00.000Z")
  }, entry, 8315n);
  assert.ok(matching.confidence >= 0.9);
  assert.match(matching.reason, /birth date/);
  assert.equal(conflicting.confidence, 0);
});

test("automatic mapping rejects a weak same-first-name candidate even when team and position add bonuses", () => {
  const [candidate] = buildSportsRuMappingCandidates(
    {
      ...price("lewis orford", "MID"),
      fotmobPlayerName: "Lewis Orford",
      teamName: "West Ham"
    },
    [roster("Lewis O'Brien", "CM", { name: "West Ham" })],
    1n
  );

  assert.equal(isSafeAutomaticSportsRuCandidate(candidate, null), false);
});

test("automatic mapping retains an exact identity when the provider birthday conflicts", () => {
  const [candidate] = buildSportsRuMappingCandidates(
    {
      ...price("malick diouf", "DEF"),
      fotmobPlayerName: "Malick Diouf",
      providerBirthDate: new Date("2004-12-29T00:00:00.000Z"),
      teamName: "West Ham"
    },
    [{
      ...roster("Malick Diouf", "LB", { name: "West Ham" }),
      player: { name: "Malick Diouf", birthDate: new Date("2004-12-28T00:00:00.000Z") }
    }],
    1n
  );

  assert.equal(candidate.birthDateConflicts, true);
  assert.equal(isSafeAutomaticSportsRuCandidate(candidate, null), true);
});

test("team roster exposes only verified Sports.ru player names", () => {
  const names = sportsRuDisplayNamesByPlayerId([
    { mappedPlayerId: "1352213", sportsName: "Ро-Зангело Дал", status: "MATCHED", price: 6.5 },
    { mappedPlayerId: "1352213", sportsName: "Старая строка", status: "MATCHED", price: 5 },
    { mappedPlayerId: "unmatched", sportsName: "Не подтверждён", status: "UNMATCHED", price: 9 },
    { mappedPlayerId: null, sportsName: "Без игрока", status: "MATCHED", price: 8 }
  ]);

  assert.deepEqual([...names], [["1352213", "Ро-Зангело Дал"]]);
});

test("team mapping treats a verified Sports.ru price as an effective roster row when FotMob keeps the player in the reserve team", async () => {
  const rows = await loadSportsRuTeamPlayerMappings({
    fantasyPlayerPrice: {
      findMany: async () => [{
        id: "daal-price",
        leagueId: 57n,
        season: "2026/2027",
        provider: "SPORTS_RU",
        playerId: 1352213n,
        teamId: 10229n,
        playerName: "Ро-Зангело Дал",
        normalizedName: "ro zangelo dal",
        teamName: "АЗ Алкмар",
        fotmobPlayerName: "Ro-Zangelo Daal",
        position: "MID",
        price: 6.5,
        player: { id: 1352213n, name: "Ro-Zangelo Daal" },
        team: { id: 10229n, name: "AZ Alkmaar" }
      }]
    },
    teamPlayerSeason: { findMany: async () => [] },
    providerEntityMap: {
      findMany: async () => [{
        providerEntityId: "daal-price",
        internalEntityId: "1352213",
        status: "MATCHED",
        confidence: 1,
        matchedBy: "MANUAL"
      }]
    }
  } as unknown as PrismaClient, { leagueId: 57n, season: "2026/2027", teamId: 10229n });

  assert.deepEqual(rows.map((row) => [row.sportsName, row.mappedPlayerId, row.mappedPlayerName, row.status]), [
    ["Ро-Зангело Дал", "1352213", "Ro-Zangelo Daal", "MATCHED"]
  ]);
});

test("starter candidate resolves Daal only through a consistent matched price, player and AZ team", async () => {
  const candidate = await loadSportsRuAuthoritativeStarterCandidate({
    fantasyPlayerPrice: {
      findMany: async () => [{
        id: "daal-price",
        leagueId: 57n,
        season: "2026/2027",
        playerId: 1352213n,
        teamId: 10229n,
        position: "MID",
        player: { id: 1352213n, name: "Ro-Zangelo Daal" },
        team: { id: 10229n, name: "AZ Alkmaar" }
      }]
    },
    providerEntityMap: {
      findMany: async () => [{ providerEntityId: "daal-price", internalEntityId: "1352213" }]
    }
  } as unknown as PrismaClient, {
    leagueId: 57n,
    seasons: ["2026/2027", "2026/27"],
    teamId: 10229n,
    playerId: 1352213n
  });

  assert.deepEqual(candidate, {
    priceId: "daal-price",
    playerId: 1352213n,
    teamId: 10229n,
    position: "MID"
  });
});

test("starter candidate rejects a false matched map whose internal player differs from the price relation", async () => {
  const candidate = await loadSportsRuAuthoritativeStarterCandidate({
    fantasyPlayerPrice: {
      findMany: async () => [{
        id: "false-price",
        leagueId: 57n,
        season: "2026/2027",
        playerId: 1352213n,
        teamId: 10229n,
        position: "MID",
        player: { id: 1352213n, name: "Ro-Zangelo Daal" },
        team: { id: 10229n, name: "AZ Alkmaar" }
      }]
    },
    providerEntityMap: {
      findMany: async () => [{ providerEntityId: "false-price", internalEntityId: "999999" }]
    }
  } as unknown as PrismaClient, {
    leagueId: 57n,
    seasons: ["2026/2027"],
    teamId: 10229n,
    playerId: 1352213n
  });

  assert.equal(candidate, null);
});

test("team mapping does not report MATCHED when neither FotMob nor the verified price resolves an effective roster row", async () => {
  const rows = await loadSportsRuTeamPlayerMappings({
    fantasyPlayerPrice: {
      findMany: async () => [{
        id: "broken-price",
        leagueId: 57n,
        season: "2026/2027",
        provider: "SPORTS_RU",
        playerId: null,
        teamId: 10229n,
        playerName: "Broken",
        normalizedName: "broken",
        teamName: "AZ Alkmaar",
        fotmobPlayerName: null,
        position: "MID",
        price: 5,
        player: null,
        team: { id: 10229n, name: "AZ Alkmaar" }
      }]
    },
    teamPlayerSeason: { findMany: async () => [] },
    providerEntityMap: {
      findMany: async () => [{
        providerEntityId: "broken-price",
        internalEntityId: "999",
        status: "MATCHED",
        confidence: 1,
        matchedBy: "MANUAL"
      }]
    }
  } as unknown as PrismaClient, { leagueId: 57n, season: "2026/2027", teamId: 10229n });

  assert.equal(rows[0]?.mappedPlayerId, null);
  assert.equal(rows[0]?.status, "UNMATCHED");
});

test("team mapping does not infer MATCHED from price foreign keys without a verified map", async () => {
  const rows = await loadSportsRuTeamPlayerMappings({
    fantasyPlayerPrice: {
      findMany: async () => [{
        id: "unverified-price",
        leagueId: 57n,
        season: "2026/2027",
        provider: "SPORTS_RU",
        playerId: 1352213n,
        teamId: 10229n,
        playerName: "Ro-Zangelo Daal",
        normalizedName: "ro zangelo daal",
        teamName: "AZ Alkmaar",
        fotmobPlayerName: "Ro-Zangelo Daal",
        position: "MID",
        price: 6.5,
        player: { id: 1352213n, name: "Ro-Zangelo Daal" },
        team: { id: 10229n, name: "AZ Alkmaar" }
      }]
    },
    teamPlayerSeason: { findMany: async () => [] },
    providerEntityMap: { findMany: async () => [] }
  } as unknown as PrismaClient, { leagueId: 57n, season: "2026/2027", teamId: 10229n });

  assert.equal(rows[0]?.mappedPlayerId, null);
  assert.equal(rows[0]?.status, "UNMATCHED");
});

test("team mapping rejects a matched map that disagrees with price identity even when that mapped player is in the roster", async () => {
  const rows = await loadSportsRuTeamPlayerMappings({
    fantasyPlayerPrice: {
      findMany: async () => [{
        id: "false-map-price",
        leagueId: 57n,
        season: "2026/2027",
        provider: "SPORTS_RU",
        playerId: 1352213n,
        teamId: 10229n,
        playerName: "Ro-Zangelo Daal",
        normalizedName: "ro zangelo daal",
        teamName: "AZ Alkmaar",
        fotmobPlayerName: "Ro-Zangelo Daal",
        position: "MID",
        price: 6.5,
        player: { id: 1352213n, name: "Ro-Zangelo Daal" },
        team: { id: 10229n, name: "AZ Alkmaar" }
      }]
    },
    teamPlayerSeason: {
      findMany: async () => [{
        playerId: 999999n,
        teamId: 10229n,
        position: "MID",
        player: { name: "Different Player" },
        team: { name: "AZ Alkmaar" }
      }]
    },
    providerEntityMap: {
      findMany: async () => [{
        providerEntityId: "false-map-price",
        internalEntityId: "999999",
        status: "MATCHED",
        confidence: 1,
        matchedBy: "MANUAL"
      }]
    }
  } as unknown as PrismaClient, { leagueId: 57n, season: "2026/2027", teamId: 10229n });

  assert.equal(rows[0]?.mappedPlayerId, null);
  assert.equal(rows[0]?.status, "UNMATCHED");
});

test("sports ru mapping matches transliterated surname to FotMob roster name", () => {
  const result = scoreSportsRuCandidate(
    price("van deyk", "DEF"),
    roster("Virgil van Dijk", "DEF", liverpool)
  );

  assert.equal(result.confidence >= 0.78, true);
});

test("sports ru mapping uses FotMob player-name hints from imported sheets", () => {
  const result = scoreSportsRuCandidate(
    {
      ...price("not close", "GK"),
      fotmobPlayerName: "David Raya"
    },
    roster("David Raya", "GK", { name: "Arsenal" })
  );

  assert.equal(result.confidence, 1);
  assert.equal(result.reason.includes("fotmob hint"), true);
});

test("sports ru mapping matches a public name contained in a provider legal name", () => {
  const result = scoreSportsRuCandidate(
    {
      ...price("nolan courtens", "MID"),
      teamName: "Херенвен",
      fotmobPlayerName: "Nolhan Allan Courtens Mabeneyshi"
    },
    roster("Nolhan Courtens", "ST", { name: "SC Heerenveen" })
  );

  assert.equal(result.confidence >= 0.78, true);
});

test("sports ru mapping matches a provider legal name to a FotMob mononym", () => {
  const result = scoreSportsRuCandidate(
    {
      ...price("zhamiru", "MID"),
      teamName: "НЕК",
      fotmobPlayerName: "Jamiro Gregory Monteiro Alvarenga"
    },
    roster("Jamiro", "CM", { name: "NEC Nijmegen" })
  );

  assert.equal(result.confidence >= 0.78, true);
});

test("sports ru mapping does not confuse players who only share a first name", () => {
  const result = scoreSportsRuCandidate(
    { ...price("gustavo cunha", "MID"), teamName: "Витория Гимараэш" },
    roster("Gustavo Silva", "CAM", { name: "Vitoria de Guimaraes" })
  );

  assert.equal(result.confidence < 0.78, true);
});

test("sports ru mapping prefers same-position team roster candidate", () => {
  const candidates = buildSportsRuMappingCandidates(
    price("alisson", "GK"),
    [
      roster("Alisson Becker", "GK", liverpool, 1n),
      roster("Ederson", "GK", city, 2n),
      roster("Allan Saint-Maximin", "FW", city, 3n)
    ]
  );

  assert.equal(candidates[0].playerName, "Alisson Becker");
  assert.equal(candidates.length, 1);
});

test("sports ru mapping penalizes known position mismatch", () => {
  const defender = scoreSportsRuCandidate(price("gabriel", "DEF"), roster("Gabriel Magalhaes", "DEF", { name: "Arsenal" }));
  const forward = scoreSportsRuCandidate(price("gabriel", "FWD"), roster("Gabriel Magalhaes", "DEF", { name: "Arsenal" }));

  assert.equal(defender.confidence > forward.confidence, true);
});

test("sports ru mapping treats a FotMob winger as a Sports.ru fantasy midfielder", () => {
  const result = scoreSportsRuCandidate(
    { ...price("anis hadj moussa", "MID"), teamName: "Фейеноорд" },
    roster("Anis Hadj Moussa", "RW,LW", { name: "Feyenoord" })
  );

  assert.equal(result.confidence, 1);
});

test("sports ru mapping rejects a similar name from another known team", () => {
  const result = scoreSportsRuCandidate(
    { ...price("nikita bocharov", "DEF"), teamName: "Ростов" },
    roster("Nikita Chernov", "DEF", { name: "Spartak Moscow" })
  );

  assert.equal(result.confidence, 0);
});

test("sports ru mapping rejects an exact identity from a stale different-team roster", () => {
  const result = scoreSportsRuCandidate(
    { ...price("arseniy gerdt", "MID"), teamName: "Локомотив" },
    roster("Arseniy Gerdt", "MID", { name: "Rodina Moscow" })
  );

  assert.equal(result.confidence, 0);
});

test("sports ru mapping accepts an exact stale-roster identity when Sports.ru supplies an active target team", () => {
  const result = scoreSportsRuCandidate(
    { ...price("pelle clement", "MID"), teamName: "\u0413\u0440\u043e\u043d\u0438\u043d\u0433\u0435\u043d" },
    roster("Pelle Clement", "CDM,CM", { name: "Sparta Rotterdam" }, 637741n),
    8674n
  );

  assert.equal(result.confidence >= 0.78, true);
});

test("sports ru mapping resolves the authoritative current-season team uniquely", () => {
  const team = resolveSportsRuSeasonTeam("\u0413\u0440\u043e\u043d\u0438\u043d\u0433\u0435\u043d", [
    { teamId: 8674n, team: { name: "FC Groningen" } },
    { teamId: 8614n, team: { name: "Sparta Rotterdam" } }
  ]);

  assert.equal(team?.teamId, 8674n);
});

test("Sports.ru resync moves a verified manual mapping away from the stale FotMob club", async () => {
  const updatedTeams: bigint[] = [];
  const storedPrice = {
    ...price("pelle clement", "MID"),
    id: "pelle-price",
    leagueId: 57n,
    season: "2026/2027",
    playerId: 637741n,
    teamId: 8614n,
    teamName: "\u0413\u0440\u043e\u043d\u0438\u043d\u0433\u0435\u043d"
  };
  const prisma = {
    fantasyPlayerPrice: {
      findMany: async () => [storedPrice],
      update: async ({ data }: { data: { teamId: bigint } }) => {
        updatedTeams.push(data.teamId);
        return storedPrice;
      }
    },
    teamPlayerSeason: {
      findMany: async () => [roster("Pelle Clement", "CDM,CM", { name: "Sparta Rotterdam" }, 637741n)]
    },
    providerEntityMap: {
      findMany: async () => [{
        providerEntityId: "pelle-price",
        internalEntityId: "637741",
        matchedBy: "MANUAL"
      }]
    },
    corePlayer: {
      findMany: async () => [{ id: 637741n, name: "Pelle Clement" }]
    },
    leagueSeasonTeam: {
      findMany: async () => [
        { teamId: 8674n, team: { name: "FC Groningen" } },
        { teamId: 8614n, team: { name: "Sparta Rotterdam" } }
      ]
    },
    userFantasySquad: {
      findMany: async () => []
    }
  } as unknown as PrismaClient;

  const result = await autoMapSportsRuFantasyPlayers(prisma, { leagueId: 57n, season: "2026/2027" });

  assert.deepEqual(updatedTeams, [8674n]);
  assert.equal(result.manual, 1);
  assert.equal(result.unmatched, 0);
});

test("Sports.ru resync retains a verified current-team transfer override", async () => {
  const updatedTeams: bigint[] = [];
  const storedPrice = {
    ...price("rafik el arguioui", "MID"),
    id: "rafik-price",
    leagueId: 57n,
    season: "2026/2027",
    playerId: 1344244n,
    teamId: 7788n,
    teamName: "\u0423\u0442\u0440\u0435\u0445\u0442"
  };
  const staleRosterEntry = {
    ...roster("Rafik El Arguioui", "CM", { name: "FC Utrecht" }, 1344244n),
    teamId: 9908n
  };
  const prisma = {
    fantasyPlayerPrice: {
      findMany: async () => [storedPrice],
      update: async ({ data }: { data: { teamId: bigint } }) => {
        updatedTeams.push(data.teamId);
        return storedPrice;
      }
    },
    teamPlayerSeason: {
      findMany: async () => [staleRosterEntry]
    },
    providerEntityMap: {
      findMany: async () => [{
        providerEntityId: "rafik-price",
        internalEntityId: "1344244",
        matchedBy: "MANUAL_TEAM_OVERRIDE"
      }]
    },
    corePlayer: {
      findMany: async () => [{ id: 1344244n, name: "Rafik El Arguioui" }]
    },
    leagueSeasonTeam: {
      findMany: async () => [
        { teamId: 7788n, team: { name: "Cambuur" } },
        { teamId: 9908n, team: { name: "FC Utrecht" } }
      ]
    },
    userFantasySquad: {
      findMany: async () => []
    }
  } as unknown as PrismaClient;

  const result = await autoMapSportsRuFantasyPlayers(prisma, { leagueId: 57n, season: "2026/2027" });

  assert.deepEqual(updatedTeams, [7788n]);
  assert.equal(result.manual, 1);
  assert.equal(result.excluded, 0);
  assert.equal(result.unmatched, 0);
});

test("Sports.ru resync keeps a verified transferred-out price excluded", async () => {
  const cleared: Array<{ playerId: null; teamId: null }> = [];
  const storedPrice = {
    ...price("kian fitz jim", "MID"),
    id: "kian-price",
    leagueId: 57n,
    season: "2026/2027",
    playerId: 1218556n,
    teamId: 8593n,
    teamName: "\u0410\u044f\u043a\u0441"
  };
  const prisma = {
    fantasyPlayerPrice: {
      findMany: async () => [storedPrice],
      update: async ({ data }: { data: { playerId: null; teamId: null } }) => {
        cleared.push(data);
        return storedPrice;
      }
    },
    teamPlayerSeason: {
      findMany: async () => []
    },
    providerEntityMap: {
      findMany: async () => [{
        providerEntityId: "kian-price",
        internalEntityId: null,
        matchedBy: "MANUAL_TRANSFERRED_OUT"
      }]
    },
    corePlayer: {
      findMany: async () => []
    },
    leagueSeasonTeam: {
      findMany: async () => [{ teamId: 8593n, team: { name: "Ajax" } }]
    }
  } as unknown as PrismaClient;

  const result = await autoMapSportsRuFantasyPlayers(prisma, { leagueId: 57n, season: "2026/2027" });

  assert.deepEqual(cleared, [{ playerId: null, teamId: null }]);
  assert.equal(result.excluded, 1);
  assert.equal(result.unmatched, 0);
});

test("sports ru mapping recognizes transliterated Sports.ru team names", () => {
  const result = scoreSportsRuCandidate(
    { ...price("nikita bocharov", "GK"), teamName: "Ростов" },
    roster("Nikita Bocharov", "GK", { name: "FC Rostov" })
  );

  assert.equal(result.confidence, 1);
});

test("sports ru mapping canonicalizes current RPL team transliteration variants", () => {
  const cases = [
    ["Ахмат", "Akhmat Grozny"],
    ["Динамо", "Dinamo Moscow"],
    ["Динамо Махачкала", "Dynamo Makhachkala"],
    ["ЦСКА", "CSKA Moscow"]
  ] as const;

  for (const [sportsTeam, fotmobTeam] of cases) {
    const result = scoreSportsRuCandidate(
      { ...price("ivan player", "MID"), teamName: sportsTeam },
      roster("Ivan Player", "MID", { name: fotmobTeam })
    );
    assert.equal(result.confidence, 1, `${sportsTeam} should match ${fotmobTeam}`);
  }
});

test("sports ru mapping resolves Moscow Dinamo without tying Makhachkala", () => {
  const result = resolveSportsRuSeasonTeam("Динамо", [
    { teamId: 9763n, team: { name: "Dinamo Moscow" } },
    { teamId: 1068353n, team: { name: "Dynamo Makhachkala" } }
  ]);

  assert.equal(result?.teamId, 9763n);
});

test("sports ru mapping canonicalizes every current EPL team", () => {
  const cases = [
    ["Арсенал", "Arsenal"], ["Астон Вилла", "Aston Villa"],
    ["Борнмут", "AFC Bournemouth"], ["Брайтон", "Brighton & Hove Albion"],
    ["Брентфорд", "Brentford"], ["Ипсвич", "Ipswich Town"],
    ["Ковентри", "Coventry City"], ["Кристал Пэлас", "Crystal Palace"],
    ["Ливерпуль", "Liverpool"], ["Лидс", "Leeds United"],
    ["Манчестер Сити", "Manchester City"], ["Манчестер Юнайтед", "Manchester United"],
    ["Ноттингем Форест", "Nottingham Forest"], ["Ньюкасл", "Newcastle United"],
    ["Сандерленд", "Sunderland"], ["Тоттенхэм", "Tottenham Hotspur"],
    ["Фулхэм", "Fulham"], ["Халл", "Hull City"], ["Челси", "Chelsea"], ["Эвертон", "Everton"]
  ] as const;

  for (const [sportsTeam, fotmobTeam] of cases) {
    const result = scoreSportsRuCandidate(
      { ...price("verified player", "MID"), teamName: sportsTeam },
      roster("Verified Player", "MID", { name: fotmobTeam })
    );
    assert.equal(result.confidence, 1, `${sportsTeam} should match ${fotmobTeam}`);
  }
});

test("sports ru mapping canonicalizes every current Ligue 1 team", () => {
  const cases = [
    ["Анже", "Angers"], ["Брест", "Brest"], ["Гавр", "Le Havre"],
    ["Ланс", "Lens"], ["Ле-Ман", "Le Mans"], ["Лилль", "Lille"],
    ["Лион", "Lyon"], ["Лорьян", "Lorient"], ["Марсель", "Marseille"],
    ["Монако", "Monaco"], ["Ницца", "Nice"], ["Осер", "Auxerre"],
    ["Париж", "Paris FC"], ["ПСЖ", "Paris Saint-Germain"], ["Ренн", "Rennes"],
    ["Страсбур", "Strasbourg"], ["Труа", "Troyes"], ["Тулуза", "Toulouse"]
  ] as const;

  for (const [sportsTeam, fotmobTeam] of cases) {
    const result = scoreSportsRuCandidate(
      { ...price("verified player", "MID"), teamName: sportsTeam },
      roster("Verified Player", "MID", { name: fotmobTeam })
    );
    assert.equal(result.confidence, 1, `${sportsTeam} should match ${fotmobTeam}`);
  }
});

test("sports ru mapping keeps Paris, Le Havre and Le Mans distinct", () => {
  const teams = [
    { teamId: 1n, team: { name: "Paris FC" } },
    { teamId: 2n, team: { name: "Paris Saint-Germain" } },
    { teamId: 3n, team: { name: "Le Havre" } },
    { teamId: 4n, team: { name: "Le Mans" } }
  ];

  assert.equal(resolveSportsRuSeasonTeam("Париж", teams)?.teamId, 1n);
  assert.equal(resolveSportsRuSeasonTeam("ПСЖ", teams)?.teamId, 2n);
  assert.equal(resolveSportsRuSeasonTeam("Гавр", teams)?.teamId, 3n);
  assert.equal(resolveSportsRuSeasonTeam("Ле-Ман", teams)?.teamId, 4n);
  assert.equal(resolveSportsRuSeasonTeam("Труа", [
    { teamId: 5n, team: { name: "Troyes" } },
    { teamId: 6n, team: { name: "Toulouse" } }
  ])?.teamId, 5n);
});

test("sports ru mapping canonicalizes every current Eredivisie and Liga Portugal team", () => {
  const cases = [
    ["АЗ Алкмар", "AZ Alkmaar"], ["Аякс", "Ajax"], ["Виллем II", "Willem II"],
    ["Гоу Эхед Иглс", "Go Ahead Eagles"], ["Гронинген", "FC Groningen"],
    ["Ден Хааг", "ADO Den Haag"], ["Зволле", "PEC Zwolle"], ["Камбюр", "Cambuur"],
    ["НЕК", "NEC Nijmegen"], ["ПСВ", "PSV Eindhoven"], ["Спарта", "Sparta Rotterdam"],
    ["Твенте", "FC Twente"], ["Телстар", "Telstar"], ["Утрехт", "FC Utrecht"],
    ["Фейеноорд", "Feyenoord"], ["Фортуна Ситтард", "Fortuna Sittard"],
    ["Херенвен", "SC Heerenveen"], ["Эксельсиор", "Excelsior"],
    ["Академику де Визеу", "Academico Viseu"], ["Алверка", "Alverca"],
    ["Арука", "Arouca"], ["Бенфика", "Benfica"], ["Брага", "Braga"],
    ["Витория Гимараэш", "Vitoria de Guimaraes"], ["Жил Висенте", "Gil Vicente"],
    ["Каза Пия", "Casa Pia AC"], ["Маритиму", "Maritimo"], ["Морейренсе", "Moreirense"],
    ["Насьонал", "Nacional"], ["Порту", "FC Porto"], ["Риу Аве", "Rio Ave"],
    ["Санта-Клара", "Santa Clara"], ["Спортинг", "Sporting CP"],
    ["Фамаликан", "Famalicao"], ["Эшторил", "Estoril"], ["Эштрела", "Estrela da Amadora"]
  ] as const;

  for (const [sportsTeam, fotmobTeam] of cases) {
    const result = scoreSportsRuCandidate(
      { ...price("verified player", "MID"), teamName: sportsTeam },
      roster("Verified Player", "MID", { name: fotmobTeam })
    );
    assert.equal(result.confidence, 1, `${sportsTeam} should match ${fotmobTeam}`);
  }
});

test("sports ru mapping does not match a full two-part name by surname alone", () => {
  const result = scoreSportsRuCandidate(
    { ...price("maksim petrov", "MID"), teamName: "Балтика" },
    roster("Ilya Petrov", "MID", { name: "Baltika" })
  );

  assert.equal(result.confidence, 0);
});

test("sports ru mapping accepts a transliterated first name and omitted middle name", () => {
  const result = scoreSportsRuCandidate(
    { ...price("huan boselli", "MID"), teamName: "Краснодар" },
    roster("Juan Manuel Boselli", "ST,RW,CAM", { name: "FC Krasnodar" })
  );

  assert.equal(result.confidence >= 0.78, true);
});

test("sports ru mapping remap moves stale squad picks and removes same-squad duplicates", () => {
  const plan = planSportsRuSelectionRemap(
    [
      { id: "stale-a", squadId: "squad-a" },
      { id: "stale-b", squadId: "squad-b" }
    ],
    [{ id: "target-b", squadId: "squad-b" }]
  );

  assert.deepEqual(plan.moveSelectionIds, ["stale-a"]);
  assert.deepEqual(plan.deleteSelectionIds, ["stale-b"]);
});

test("sports ru mapping does not move a squad selection from an identity still claimed by another price", () => {
  assert.equal(shouldMovePreviousSportsRuSelection({
    previousPlayerId: 1585726n,
    targetPlayerId: 8_000_000_000_070_368n,
    otherPriceClaims: 1
  }), false);
  assert.equal(shouldMovePreviousSportsRuSelection({
    previousPlayerId: 914134n,
    targetPlayerId: 1805046n,
    otherPriceClaims: 0
  }), true);
});

test("manual transfer override does not fall back to the player's stale active team", () => {
  const stale = roster("Nikita Chernov", "CB", { name: "Spartak Moscow" }, 560506n);
  const currentTeamId = 8709n;

  assert.equal(findManualRosterEntry([stale], "560506", currentTeamId), undefined);
  assert.equal(findManualRosterEntry([stale], "560506", null), stale);
});

test("manual transfer override survives a Sports.ru resync with a non-empty team name", () => {
  assert.equal(shouldRetainManualOverride({
    pricePlayerId: 560506n,
    priceTeamId: 8709n,
    mappedPlayerId: "560506",
    existingPlayerIds: new Set(["560506"]),
    activeTeamIds: new Set(["8709"])
  }), true);
});

function price(normalizedName: string, position: string) {
  return {
    id: normalizedName,
    playerName: normalizedName,
    normalizedName,
    teamName: "",
    position,
    price: 6
  };
}

function roster(name: string, position: string, team: { name: string }, playerId = 10n) {
  return {
    playerId,
    teamId: playerId + 100n,
    position,
    player: { name },
    team
  };
}
