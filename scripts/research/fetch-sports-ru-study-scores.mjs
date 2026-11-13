// @spec spec://modules/machete/FEAT-001-global-ranking-strategy#research-forecasts
// Only historical public match results; never called by the web/worker.
import { createReadStream, createWriteStream } from "node:fs";
import { once } from "node:events";
import { createInterface } from "node:readline";

const [input, output] = process.argv.slice(2);
if (!input || !output) throw Error("Usage: node scripts/research/fetch-sports-ru-study-scores.mjs ROUNDS.jsonl SCORES.jsonl");

const requestFields = "team{id} players{player{id} gameStat{points fieldMinutes goals assists ballRecovery goalsConceded yellowCards redCards saves ownGoals penaltiesMissed penaltiesSaved penaltyConceded}}";
const endpoint = "https://www.sports.ru/gql/graphql/";
const fixturesBySeason = new Map();
const source = createInterface({ input: createReadStream(input, { encoding: "utf8" }), crlfDelay: Infinity });
for await (const line of source) {
  if (!line.trim()) continue;
  const round = JSON.parse(line);
  if (round.kind !== "round") continue;
  if (!/^\d+$/.test(round.season)) throw Error("Invalid Sports.ru season");
  const fixtures = fixturesBySeason.get(round.season) ?? new Map();
  for (const [id, , , , status, mapping, finished, , home, away] of round.fixtures ?? []) {
    if (status !== "CLOSED" || mapping !== "MATCHED" || !finished) continue;
    if (!/^\d+$/.test(id) || !home || !away) throw Error("Invalid fixture identity");
    const old = fixtures.get(id);
    if (old && (old.home !== home || old.away !== away)) throw Error("Conflicting fixture identity " + id);
    fixtures.set(id, { id, home, away });
  }
  fixturesBySeason.set(round.season, fixtures);
}

const jobs = [];
for (const [season, fixtureMap] of fixturesBySeason) {
  const fixtures = [...fixtureMap.values()];
  for (let i = 0; i < fixtures.length; i += 8) jobs.push({ season, fixtures: fixtures.slice(i, i + 8) });
}
const target = createWriteStream(output, { encoding: "utf8", flags: "wx" });
await once(target, "open");
const counters = { fixtures: 0, missing: 0, attempts: 0 };
let cursor = 0;
try {
  await Promise.all(Array.from({ length: 3 }, async () => {
    while (cursor < jobs.length) {
      const { season, fixtures } = jobs[cursor++];
      let games = null;
      for (let attempt = 0; attempt < 3; attempt++) {
        counters.attempts++;
        try {
          const query = "{fantasyQueries{season(input:{seasonID:" + JSON.stringify(season) + "}){id " +
            fixtures.map(({ id }, i) => "m" + i + ":matchPlayers(matchID:" + JSON.stringify(id) +
              "){home{" + requestFields + "} away{" + requestFields + "}}").join(" ") + "}}}";
          const response = await fetch(endpoint, {
            method: "POST",
            headers: { "content-type": "application/json", accept: "application/json", origin: "https://www.sports.ru", referer: "https://www.sports.ru/fantasy/" },
            body: JSON.stringify({ query }),
            signal: AbortSignal.timeout(15_000)
          });
          if (!response.ok) throw Error("HTTP " + response.status);
          const payload = await response.json();
          const result = payload?.data?.fantasyQueries?.season;
          if (result?.id !== season) throw Error("Missing requested Sports.ru season");
          games = result;
          break;
        } catch (error) {
          console.error(season, fixtures[0]?.id, String(error));
          if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 1000 * 2 ** attempt));
        }
      }
      for (const [i, fixture] of fixtures.entries()) {
        const game = games?.["m" + i];
        const seen = new Set();
        const sides = ["home", "away"].map((side) => {
          const v = game?.[side];
          if (v?.team?.id !== fixture[side] || !Array.isArray(v.players) || v.players.length < 11) return null;
          const rows = [];
          for (const { player, gameStat: s } of v.players) {
            if (!player?.id || seen.has(player.id) || !Number.isInteger(s?.points) || !Number.isInteger(s?.fieldMinutes)) return null;
            seen.add(player.id);
            rows.push([player.id, s.points, s.fieldMinutes, s.goals, s.assists, s.ballRecovery, s.goalsConceded, s.yellowCards, s.redCards, s.saves]);
          }
          if (rows.filter((r) => r[2] > 0).length < 11) return null;
          return rows;
        });
        if (sides.includes(null)) counters.missing++;
        else counters.fixtures++;
        const line = JSON.stringify({ season, id: fixture.id, home: sides[0], away: sides[1] }) + "\n";
        if (!target.write(line)) await once(target, "drain");
      }
      // Bound the throughput of requests against the public endpoint.
      await new Promise((resolve) => setTimeout(resolve, 275));
    }
  }));
} finally {
  target.end();
  await once(target, "finish");
}
console.log(JSON.stringify(counters));
