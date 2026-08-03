import assert from "node:assert/strict";
import test from "node:test";

import type { PrismaClient } from "@prisma/client";

import {
  autoMapSportsRuFantasyPlayers,
  buildSportsRuMappingCandidates,
  findManualRosterEntry,
  planSportsRuSelectionRemap,
  resolveSportsRuSeasonTeam,
  scoreSportsRuCandidate,
  shouldRetainManualOverride
} from "./sports_ru_player_mapping";

const liverpool = { name: "Liverpool" };
const city = { name: "Manchester City" };

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
