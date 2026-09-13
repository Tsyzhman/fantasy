/** @spec spec://modules/khl/FEAT-002-khl-squad#sports-import */
import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { fetchSportsHockeySquad, hockeyTeamForProfile, parseSportsHockeySquad } from "./squad";

// Minimal current endpoint payload captured 2026-09-13; profile identity is synthetic.
const payload = JSON.parse(readFileSync(new URL("./fixtures/squad-current.json", import.meta.url), "utf8"));
const profile = '<div class="league"><a href="/fantasy/hockey/team/587427.html">Team</a><a href="/fantasy/hockey/tournament/107.html">КХЛ</a></div>';
const html = `<script>$.Sports.Registry.set('team_id', 587427)</script><h1>Team</h1><table class="profile-table">
<tr><th>Пользователь</th><td><a class="nickname" href="/profile/123">User</a></td></tr>
<tr><th>Турнир</th><td><a href="/fantasy/hockey/tournament/107.html">КХЛ</a></td></tr>
<tr><th>Текущая неделя</th><td>неделя 1</td></tr><tr><th>Баланс</th><td>0</td></tr><tr><th>Стоимость команды</th><td>20448</td></tr></table>`;
const expected = { profileId: "123", contestId: "107", teamId: "587427" };
test("public Sports hockey roster retains 17 IDs, verified zero bank and source week", () => {
  assert.equal(hockeyTeamForProfile(profile, "107"), "587427");
  const squad = parseSportsHockeySquad(html, payload, expected);
  assert.equal(squad.players.length, 17); assert.equal(squad.bank, 0); assert.equal(squad.totalPrice, 20448); assert.equal(squad.week, "1");
  assert.deepEqual(["G", "D", "F"].map(pos => squad.players.filter(p => p.position === pos).length), [2, 6, 9]);
});
test("wrong owner, contest, duplicate IDs, missing bank and partial source never become a roster", () => {
  assert.throws(() => parseSportsHockeySquad(html, payload, { ...expected, profileId: "321" }));
  assert.throws(() => parseSportsHockeySquad(html, payload, { ...expected, contestId: "123" }));
  assert.throws(() => parseSportsHockeySquad(html.replace('<td>0</td>', '<td>—</td>'), payload, expected));
  assert.throws(() => parseSportsHockeySquad(html, { players: payload.players.slice(1) }, expected));
  assert.throws(() => parseSportsHockeySquad(html, { players: payload.players.map((p: object, i: number) => i === 1 ? payload.players[0] : p) }, expected));
  assert.throws(() => parseSportsHockeySquad(html.replace('20448', '20449'), payload, expected));
});
test("adapter uses only bounded read-only Sports URLs and rejects caller URLs", async () => {
  const paths: string[] = [];
  const fetchImpl = (async (url, init) => {
    paths.push(String(url)); assert.equal(init?.redirect, "error"); assert.equal(init?.cache, "no-store");
    return new Response(paths.length === 1 ? profile : paths.length === 2 ? html : JSON.stringify(payload));
  }) as typeof fetch;
  assert.equal((await fetchSportsHockeySquad("123", "107", fetchImpl)).players.length, 17);
  assert.deepEqual(paths, ["https://www.sports.ru/profile/123/fantasy/", "https://www.sports.ru/fantasy/hockey/team/587427.html", "https://www.sports.ru/fantasy/hockey/team/json/587427.json"]);
  await assert.rejects(fetchSportsHockeySquad("https://evil.test/", "107", fetchImpl)); assert.equal(paths.length, 3);
  await assert.rejects(fetchSportsHockeySquad("123", "107", (async () => new Response("x".repeat(2 * 1024 * 1024 + 1))) as typeof fetch), /2 МБ/);
});
