/** @spec spec://modules/machete/FEAT-001-global-ranking-strategy#player-identity */
import assert from "node:assert/strict";
import test from "node:test";
import { buildSportsRuMappingCandidates, isSafeAutomaticSportsRuCandidate } from "./sports_ru_player_mapping";
import { fantasyPlayerMatchesNameQuery, normalizeFantasyPlayerIdentityName } from "./player-identity";

test("player search finds canonical nicknames and accented Latin names while preserving Russian name search", () => {
  assert.equal(fantasyPlayerMatchesNameQuery("Хоакин Мартинес Гауна", "Oso", " oso "), true);
  assert.equal(fantasyPlayerMatchesNameQuery("Хоакин Мартинес Гауна", "Oso", "МАРТИНЕС"), true);
  assert.equal(fantasyPlayerMatchesNameQuery("Фредерик Реннов", "Frederik Rønnow", "ronnow"), true);
  assert.equal(fantasyPlayerMatchesNameQuery("Фредерик Реннов", "Frederik Rønnow", "rønnow"), true);
  assert.equal(fantasyPlayerMatchesNameQuery("Дани Себальос", "Dani Ceballos", "Oso"), false);
  assert.equal(fantasyPlayerMatchesNameQuery("Хоакин Мартинес Гауна", null, " oso "), false);
});

test("the real Rønnow identity is accepted without a core birthday and without losing ø", () => {
  const price = { id: "ronnow", playerName: "Фредерик Реннов", normalizedName: "frederik rennov",
    fotmobPlayerName: "frederik ronnow", teamName: "Унион Берлин", position: "GK", price: 4.5,
    providerBirthDate: new Date("1992-08-04") };
  const roster = [{ playerId: 186557n, teamId: 8149n, position: "GK",
    player: { name: "Frederik Rønnow", birthDate: null }, team: { name: "Union Berlin" } }];
  const candidates = buildSportsRuMappingCandidates(price, roster, 8149n);
  assert.equal(candidates[0].nameConfidence, 1);
  assert.equal(isSafeAutomaticSportsRuCandidate(candidates[0], candidates[1]), true);
  const ambiguous = buildSportsRuMappingCandidates(price, [...roster, { ...roster[0], playerId: 2n }], 8149n);
  assert.equal(isSafeAutomaticSportsRuCandidate(ambiguous[0], ambiguous[1]), false);
});

test("non-decomposing Latin letters retain their identity tokens across source spellings", () => {
  for (const [source, canonical] of [["Łukasz", "Lukasz"], ["Kjærgaard", "Kjaergaard"],
    ["Đurić", "Duric"], ["GROẞ", "Gross"], ["İlkay", "Ilkay"], ["Guðmundsson", "Gudmundsson"]]) {
    assert.equal(normalizeFantasyPlayerIdentityName(source), normalizeFantasyPlayerIdentityName(canonical));
  }
  assert.notEqual(normalizeFantasyPlayerIdentityName("Lewis Orford"), normalizeFantasyPlayerIdentityName("Lewis O'Brien"));
});
