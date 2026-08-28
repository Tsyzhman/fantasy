import assert from "node:assert/strict";
import test from "node:test";

import type { PrismaClient } from "@prisma/client";

import {
  assertCompleteProbableLineupPage,
  LIGAINSIDER_BUNDESLIGA_URL,
  normalizeLineupIdentity,
  parseFantasyFootballScoutLineups,
  parseGazzettaProbableLineups,
  parseLigaInsiderTeamDirectory,
  parseLigaInsiderTeamLineup,
  ProbableLineupParseError,
  type ProbableLineupPlayer
} from "./probable-lineup-parsers";
import {
  applyProbableLineupTeamPlan,
  buildProbableLineupSyncPlan,
  fetchProbableLineupPage,
  probableLineupPlayerScore,
  probableLineupTeamScore,
  resolveProbableLineupPlayer,
  type ProbableLineupSourceDefinition,
  type ProbableLineupTeamPlan,
  type ProbableLineupRosterPlayer
} from "./probable-lineup-sync";

test("Fantasy Football Scout parser isolates team blocks and extracts official player codes", () => {
  const html = `<script>malformed advertising markup<div></script>
    <div class="ffs-team-news"><ol class="news">
      ${ffsTeamHtml("ars", "Arsenal", "Coventry City (H)", "4-3-3")}
    </ol></div>`;
  const page = parseFantasyFootballScoutLineups(html);

  assertCompleteProbableLineupPage(page, { expectedTeams: 1 });
  assert.equal(page.lineups[0]?.teamName, "Arsenal");
  assert.equal(page.lineups[0]?.formation, "4-3-3");
  assert.equal(page.lineups[0]?.opponentName, "Coventry City");
  assert.equal(page.lineups[0]?.venue, "HOME");
  assert.deepEqual(page.lineups[0]?.players[0], {
    name: "Raya Martin",
    fullName: "David Raya Martin",
    providerCode: "154561",
    shirtNumber: null
  });
});

test("Gazzetta parser extracts both formations, lineups, shirt numbers and entities", () => {
  const page = parseGazzettaProbableLineups(gazzettaMatchHtml());

  assertCompleteProbableLineupPage(page, { expectedTeams: 2 });
  assert.deepEqual(page.lineups.map((lineup) => [lineup.teamName, lineup.formation, lineup.venue]), [
    ["Lecce", "4-3-3", "HOME"],
    ["Roma", "3-4-1-2", "AWAY"]
  ]);
  assert.deepEqual(page.lineups[0]?.players[0], {
    name: "N'Dri",
    fullName: null,
    providerCode: null,
    shirtNumber: 11
  });
  assert.equal(page.lineups[1]?.sourceFixtureId, "2638137");
});

test("LigaInsider directory deduplicates desktop/mobile menus and keeps per-team URLs", () => {
  const menu = `<div class="icon_holder"><a href="/rb-leipzig/1311/"><img alt="RB Leipzig"></a>
    <a href="/eintracht-frankfurt/3/"><img alt="Eintracht Frankfurt"></a></div>`;
  const teams = parseLigaInsiderTeamDirectory(`${menu}${menu}`);

  assert.deepEqual(teams, [
    { teamName: "RB Leipzig", sourceTeamCode: "1311", sourceUrl: "https://www.ligainsider.de/rb-leipzig/1311/" },
    { teamName: "Eintracht Frankfurt", sourceTeamCode: "3", sourceUrl: "https://www.ligainsider.de/eintracht-frankfurt/3/" }
  ]);
});

test("LigaInsider team parser selects the visible player, excludes alternatives and derives formation", () => {
  const lineup = parseLigaInsiderTeamLineup(ligaInsiderTeamHtml("Eintracht Frankfurt", 3, true), {
    teamName: "Eintracht Frankfurt",
    sourceTeamCode: "3",
    sourceUrl: "https://www.ligainsider.de/eintracht-frankfurt/3/"
  });

  assertCompleteProbableLineupPage({
    source: "LIGAINSIDER",
    sourceUrl: LIGAINSIDER_BUNDESLIGA_URL,
    lineups: [lineup]
  }, { expectedTeams: 1 });
  assert.equal(lineup.formation, "4-2-3-1");
  assert.equal(lineup.opponentName, "1. FC Union Berlin");
  assert.deepEqual(lineup.players[0], {
    name: "Kauã S.",
    fullName: "Kaua Santos",
    providerCode: "36306",
    shirtNumber: null
  });
  assert.equal(lineup.players.some((player) => player.providerCode === "99999"), false);
});

test("completeness checks reject a partial source page instead of clearing valid starters", () => {
  const page = parseFantasyFootballScoutLineups(`<ol>${ffsTeamHtml("ars", "Arsenal", "Coventry City (H)", "4-3-3", 10)}</ol>`);
  assert.throws(
    () => assertCompleteProbableLineupPage(page, { expectedTeams: 1 }),
    (error: unknown) => error instanceof ProbableLineupParseError && /expected 11 players, parsed 10/.test(error.message)
  );
});

test("player matching handles FFS full names, accents, initials and unique surnames", () => {
  const roster = [
    rosterPlayer(1n, "David Raya"),
    rosterPlayer(2n, "Martin Ødegaard"),
    rosterPlayer(3n, "Gianluca Mancini", 23),
    rosterPlayer(4n, "Riccardo Bordon", 33),
    rosterPlayer(5n, "Min-Jae Kim"),
    rosterPlayer(6n, "Kauã")
  ];

  assert.equal(resolveProbableLineupPlayer(sourcePlayer("Raya Martin", "David Raya Martin"), roster).playerId, 1n);
  assert.equal(resolveProbableLineupPlayer(sourcePlayer("Odegaard", "Martin Odegaard"), roster).playerId, 2n);
  assert.equal(resolveProbableLineupPlayer(sourcePlayer("Mancini", null, 23), roster).playerId, 3n);
  assert.equal(resolveProbableLineupPlayer(sourcePlayer("R. Bordon", null, 33), roster).playerId, 4n);
  assert.equal(resolveProbableLineupPlayer(sourcePlayer("Kim", "Minjae Kim"), roster).playerId, 5n);
  assert.equal(resolveProbableLineupPlayer(sourcePlayer("Kauã S.", "Kaua Santos"), roster).playerId, 6n);
  assert.ok(probableLineupPlayerScore(sourcePlayer("N'Dri"), rosterPlayer(7n, "Konan N’Dri")) >= 0.88);
});

test("provider player code is authoritative only when its player is active in the resolved roster", () => {
  const roster = [rosterPlayer(10n, "Ben White")];
  const direct = resolveProbableLineupPlayer(sourcePlayer("Unrelated label"), roster, 10n);
  const stale = resolveProbableLineupPlayer(sourcePlayer("Unrelated label"), roster, 99n);

  assert.deepEqual([direct.playerId, direct.matchedBy, direct.confidence], [10n, "PROVIDER_CODE", 1]);
  assert.deepEqual([stale.playerId, stale.reason], [null, "PROVIDER_PLAYER_NOT_IN_ROSTER"]);
});

test("ambiguous duplicate surnames remain unresolved until shirt number disambiguates them", () => {
  const roster = [rosterPlayer(1n, "Gianluca Mancini", 23), rosterPlayer(2n, "Tom Mancini", 44)];
  assert.equal(resolveProbableLineupPlayer(sourcePlayer("Mancini"), roster).reason, "AMBIGUOUS");
  assert.equal(resolveProbableLineupPlayer(sourcePlayer("Mancini", null, 23), roster).playerId, 1n);
});

test("Gazzetta matching handles joined surnames and a FotMob nickname only with the matching shirt number", () => {
  const roster = [
    rosterPlayer(1n, "Enrico Del Prato", 15),
    rosterPlayer(2n, "Valde", 21)
  ];

  assert.equal(resolveProbableLineupPlayer(sourcePlayer("Delprato", null, 15), roster).playerId, 1n);
  assert.equal(resolveProbableLineupPlayer(sourcePlayer("Valdepenas", null, 21), roster).playerId, 2n);
  assert.equal(resolveProbableLineupPlayer(sourcePlayer("Valdepenas"), roster).reason, "NO_MATCH");
  assert.equal(resolveProbableLineupPlayer(sourcePlayer("Valdepenas", null, 99), roster).reason, "NO_MATCH");
  assert.equal(resolveProbableLineupPlayer(sourcePlayer("Unrelated", null, 21), roster).reason, "NO_MATCH");
});

test("Bundesliga team matching handles LigaInsider prefixes and German/English aliases", () => {
  assert.ok(probableLineupTeamScore("FC Bayern München", "Bayern Munich") >= 0.96);
  assert.ok(probableLineupTeamScore("Borussia Mönchengladbach", "Borussia M'gladbach") >= 0.96);
  assert.ok(probableLineupTeamScore("1. FC Köln", "Cologne") >= 0.96);
  assert.ok(probableLineupTeamScore("1. FSV Mainz 05", "Mainz 05") >= 0.96);
  assert.ok(probableLineupTeamScore("Hamburger SV", "Hamburg") >= 0.96);
  assert.ok(probableLineupTeamScore("SV Werder Bremen", "Werder Bremen") >= 0.96);
});

test("source fetch retries a transient failure and validates all twenty teams", async () => {
  const html = `<div class="ffs-team-news"><ol class="news">${Array.from({ length: 20 }, (_, index) =>
    ffsTeamHtml(`t${index}`, `Team ${index}`, `Opponent ${index} (H)`, "4-3-3")
  ).join("")}</ol></div>`;
  let attempts = 0;
  const definition: ProbableLineupSourceDefinition = {
    key: "epl",
    label: "test",
    source: "FANTASY_FOOTBALL_SCOUT",
    sourceUrl: "https://example.test/lineups",
    leagueId: 47n,
    expectedTeams: 20,
    fetchMode: "SINGLE_PAGE",
    parse: parseFantasyFootballScoutLineups
  };

  const page = await fetchProbableLineupPage(definition, {
    maxAttempts: 2,
    sleep: async () => undefined,
    fetchImpl: async () => {
      attempts += 1;
      return attempts === 1
        ? new Response("temporary", { status: 503, headers: { "content-type": "text/html" } })
        : new Response(html, { status: 200, headers: { "content-type": "text/html; charset=utf-8" } });
    }
  });

  assert.equal(attempts, 2);
  assert.equal(page.lineups.length, 20);
});

test("LigaInsider fetch discovers and loads all eighteen team pages sequentially", async () => {
  const teamPages = Array.from({ length: 18 }, (_, index) => ({
    teamName: `Bund Team ${index}`,
    sourceTeamCode: String(1_000 + index),
    sourceUrl: `https://www.ligainsider.de/bund-team-${index}/${1_000 + index}/`
  }));
  const directoryHtml = `<div class="icon_holder">${teamPages.map((team) =>
    `<a href="${new URL(team.sourceUrl).pathname}"><img alt="${team.teamName}"></a>`
  ).join("")}</div>`;
  const requestedUrls: string[] = [];
  let activeRequests = 0;
  let maximumActiveRequests = 0;
  const definition: ProbableLineupSourceDefinition = {
    key: "bundesliga",
    label: "Bundesliga test",
    source: "LIGAINSIDER",
    sourceUrl: LIGAINSIDER_BUNDESLIGA_URL,
    leagueId: 54n,
    expectedTeams: 18,
    fetchMode: "LIGAINSIDER_TEAM_PAGES",
    parse: null
  };

  const page = await fetchProbableLineupPage(definition, {
    requestIntervalMs: 0,
    sleep: async () => undefined,
    fetchImpl: async (input) => {
      const url = String(input);
      requestedUrls.push(url);
      activeRequests += 1;
      maximumActiveRequests = Math.max(maximumActiveRequests, activeRequests);
      await Promise.resolve();
      activeRequests -= 1;
      if (url === LIGAINSIDER_BUNDESLIGA_URL) {
        return new Response(directoryHtml, { status: 200, headers: { "content-type": "text/html" } });
      }
      const teamIndex = teamPages.findIndex((team) => team.sourceUrl === url);
      return new Response(ligaInsiderTeamHtml(`Bund Team ${teamIndex}`, 1_000 + teamIndex), {
        status: teamIndex >= 0 ? 200 : 404,
        headers: { "content-type": "text/html" }
      });
    }
  });

  assert.equal(page.lineups.length, 18);
  assert.equal(requestedUrls.length, 19);
  assert.equal(maximumActiveRequests, 1);
  assert.deepEqual(page.lineups.map((lineup) => lineup.sourceTeamCode), teamPages.map((team) => team.sourceTeamCode));
});

test("sync planning resolves all eleven players inside each active team roster", async () => {
  const lineups = Array.from({ length: 20 }, (_, teamIndex) => ({
    source: "GAZZETTA" as const,
    sourceUrl: "https://www.gazzetta.it/Calcio/prob_form/",
    sourceTeamCode: `club-${teamIndex}`,
    sourceFixtureId: String(Math.floor(teamIndex / 2) + 1),
    teamName: `Club ${teamIndex}`,
    opponentName: `Club ${(teamIndex + 1) % 20}`,
    venue: teamIndex % 2 === 0 ? "HOME" as const : "AWAY" as const,
    formation: "4-3-3",
    sourceUpdatedText: "Ultimo aggiornamento: test",
    players: Array.from({ length: 11 }, (_, playerIndex) => sourcePlayer(
      `Player ${teamIndex} ${playerIndex}`,
      null,
      playerIndex + 1
    ))
  }));
  const prisma = {
    leagueSeason: {
      findFirst: async () => ({
        leagueId: 55n,
        season: "2026/2027",
        league: { name: "Serie A" },
        teams: Array.from({ length: 20 }, (_, teamIndex) => ({
          teamId: BigInt(teamIndex + 100),
          team: { name: `Club ${teamIndex}` },
          players: Array.from({ length: 11 }, (_, playerIndex) => ({
            playerId: BigInt(teamIndex * 100 + playerIndex + 1),
            active: true,
            position: playerIndex === 0 ? "GK" : "MID",
            shirtNumber: playerIndex + 1,
            isStarter: false,
            player: { name: `Player ${teamIndex} ${playerIndex}` }
          }))
        }))
      })
    }
  } as unknown as PrismaClient;

  const plan = await buildProbableLineupSyncPlan(prisma, {
    definition: {
      key: "serie-a",
      label: "Serie A test",
      source: "GAZZETTA",
      sourceUrl: "https://www.gazzetta.it/Calcio/prob_form/",
      leagueId: 55n,
      expectedTeams: 20,
      fetchMode: "SINGLE_PAGE",
      parse: parseGazzettaProbableLineups
    },
    page: { source: "GAZZETTA", sourceUrl: "https://www.gazzetta.it/Calcio/prob_form/", lineups }
  });

  assert.equal(plan.teams.length, 20);
  assert.equal(plan.teams.every((team) => team.status === "READY" && team.targetPlayerIds.length === 11), true);
  assert.equal(plan.teams.every((team) => team.problems.length === 0), true);
});

test("probable XI application is transactional and stores compact provenance without raw HTML", async () => {
  const updates: Array<{ kind: string; value: unknown }> = [];
  const targetIds = Array.from({ length: 11 }, (_, index) => BigInt(index + 1));
  const prisma = {
    $transaction: async (callback: (tx: unknown) => unknown) => callback({
      $executeRaw: async () => 1,
      leagueSeasonTeam: {
        findUnique: async () => ({ active: true, metadata: { retained: true } }),
        update: async (value: unknown) => {
          updates.push({ kind: "season-team-update", value });
          return value;
        },
        updateMany: async (value: unknown) => {
          updates.push({ kind: "season-team-update-many", value });
          return { count: 0 };
        }
      },
      teamPlayerSeason: {
        findMany: async (input: { where?: { teamId?: unknown } }) => input.where?.teamId === 100n
          ? Array.from({ length: 12 }, (_, index) => ({
              playerId: BigInt(index + 1),
              active: true,
              isStarter: index > 0,
              position: index === 0 ? "GK" : "DEF"
            }))
          : [],
        updateMany: async (value: unknown) => {
          updates.push({ kind: "roster-update", value });
          return { count: 1 };
        }
      }
    })
  } as unknown as PrismaClient;
  const plan = teamPlan(targetIds);

  const result = await applyProbableLineupTeamPlan(prisma, plan, new Date("2026-08-27T07:00:00.000Z"));

  assert.equal(result.status, "APPLIED");
  assert.equal(updates.filter((entry) => entry.kind === "roster-update").length, 3);
  const seasonTeamUpdate = updates.find((entry) => entry.kind === "season-team-update")?.value as {
    data?: { metadata?: { retained?: boolean; probableLineup?: { source?: string; players?: unknown[]; rawHtml?: unknown } } };
  };
  assert.equal(seasonTeamUpdate.data?.metadata?.retained, true);
  assert.equal(seasonTeamUpdate.data?.metadata?.probableLineup?.source, "GAZZETTA");
  assert.equal(seasonTeamUpdate.data?.metadata?.probableLineup?.players?.length, 11);
  assert.equal(seasonTeamUpdate.data?.metadata?.probableLineup?.rawHtml, undefined);
});

test("name normalization covers punctuation and non-decomposing Latin letters", () => {
  assert.equal(normalizeLineupIdentity("  N’Dri Ødegaard Łukasz  "), "ndri odegaard lukasz");
});

function ffsTeamHtml(code: string, team: string, opponent: string, formation: string, playerCount = 11) {
  const players = Array.from({ length: playerCount }, (_, index) => {
    const name = index === 0 ? "Raya Martin" : `Player ${index + 1}`;
    const title = index === 0 ? "Raya Martin (David)" : `Player ${index + 1}`;
    const codeValue = index === 0 ? 154561 : 200000 + index;
    return `<li title="${title}"><img src="https://resources.premierleague.com/premierleague25/photos/players/110x140/${codeValue}.png?v=2026"><span class="player-name truncate max-w-full">${name}</span></li>`;
  }).join("");
  return `<li class="team-news-item" data-team-code="${code}">
    <header><h2>${team}</h2></header>
    <div class="next-match"><strong>Next Match:</strong> ${opponent}</div>
    <div class="scout-picks formation formation-${formation}"><ul>${players}</ul></div>
    <ul class="story-parts"><li class="headers grey"><em>Last Updated Wed 26th Aug</em></li></ul>
  </li>`;
}

function gazzettaMatchHtml() {
  const homePlayers = Array.from({ length: 11 }, (_, index) =>
    `<li class="lineup-team__player"><span class="lineup-team__name">${index === 0 ? "N&#x27;Dri" : `Home ${index + 1}`}</span><span class="lineup-team__number">${index + 11}</span></li>`
  ).join("");
  const awayPlayers = Array.from({ length: 11 }, (_, index) =>
    `<li class="lineup-team__player"><span class="lineup-team__number">${index + 31}</span><span class="lineup-team__name">Away ${index + 1}</span></li>`
  ).join("");
  return `<div class="probabiliFormazioni"><div id="match-2638137" class="bck-box-match-details">
    <p class="lastUpdate">Ultimo aggiornamento: 26 agosto 2026, ore 12:33</p>
    <div class="details-team is--home"><a class="details-team__name" href="https://www.gazzetta.it/calcio/squadre/lecce/">Lecce</a></div>
    <div class="details-team is--away"><a class="details-team__name" href="https://www.gazzetta.it/calcio/squadre/roma/">Roma</a></div>
    <div class="match-details__info-match"><p><strong>Modulo:</strong> 4-3-3</p></div>
    <div class="match-details__info-match"><p>31/8</p></div>
    <div class="match-details__info-match"><p><strong>Modulo:</strong> 3-4-1-2</p></div>
    <div class="lineup-team is--home"><ul>${homePlayers}</ul></div>
    <div class="lineup-team is--away"><ul>${awayPlayers}</ul></div>
  </div></div>`;
}

function ligaInsiderTeamHtml(teamName: string, teamCode: number, includeAlternative = false) {
  const playerColumn = (playerIndex: number) => {
    if (includeAlternative && playerIndex === 0) {
      return `<div class="player_position_column">
        <div class="sub_child" style="display: block;">
          <div class="player_position_photo"><a href="/kaua-santos_36306/"><img alt=""></a></div>
          <div class="player_name"><a href="/kaua-santos_36306/">Kauã S.</a></div>
        </div>
        <div class="sub_child" style="display: none;">
          <div class="player_position_photo"><a href="/hidden-alternative_99999/"><img alt=""></a></div>
          <div class="player_name"><a href="/hidden-alternative_99999/">Alternative</a></div>
        </div>
      </div>`;
    }
    const name = `Player ${teamCode} ${playerIndex}`;
    const href = `/player-${teamCode}-${playerIndex}_${teamCode * 100 + playerIndex}/`;
    return `<div class="player_position_column">
      <div class="player_position_photo"><a href="${href}"><img alt=""></a></div>
      <div class="player_name"><a href="${href}">${name}</a></div>
    </div>`;
  };
  let nextPlayer = 0;
  const rows = [1, 4, 2, 3, 1].map((size) => `<div class="player_position_row text-center">${
    Array.from({ length: size }, () => playerColumn(nextPlayer++)).join("")
  }</div>`).join("");
  return `<h1>VORAUSSICHTLICHE AUFSTELLUNG</h1>
    <h2 class="text-uppercase">${teamName}</h2>
    <h3 class="text-uppercase text-start">Gegen 1. FC Union Berlin fehlen</h3>
    <div class="stadium_container_bg">${rows}</div>`;
}

function sourcePlayer(name: string, fullName: string | null = null, shirtNumber: number | null = null): ProbableLineupPlayer {
  return { name, fullName, providerCode: null, shirtNumber };
}

function rosterPlayer(playerId: bigint, name: string, shirtNumber: number | null = null): ProbableLineupRosterPlayer {
  return { playerId, name, shirtNumber, position: null, isStarter: false };
}

function teamPlan(targetPlayerIds: bigint[]): ProbableLineupTeamPlan {
  const players = targetPlayerIds.map((playerId) => sourcePlayer(`Player ${playerId}`, null, Number(playerId)));
  return {
    source: "GAZZETTA",
    sourceUrl: "https://www.gazzetta.it/Calcio/prob_form/",
    leagueId: 55n,
    leagueName: "Serie A",
    season: "2026/2027",
    fetchedAt: new Date("2026-08-27T06:55:00.000Z"),
    sourceLineup: {
      source: "GAZZETTA",
      sourceUrl: "https://www.gazzetta.it/Calcio/prob_form/",
      sourceTeamCode: "roma",
      sourceFixtureId: "2638137",
      teamName: "Roma",
      opponentName: "Lecce",
      venue: "AWAY",
      formation: "3-4-1-2",
      sourceUpdatedText: "Ultimo aggiornamento: 27 agosto 2026, ore 09:00",
      players
    },
    teamId: 100n,
    databaseTeamName: "Roma",
    teamMatchedBy: "NAME",
    teamConfidence: 1,
    status: "READY",
    playerResolutions: [],
    currentStarterIds: Array.from({ length: 11 }, (_, index) => BigInt(index + 2)),
    targetPlayerIds,
    startersToSet: 1,
    startersToClear: 1,
    problems: []
  };
}
