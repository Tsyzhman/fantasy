import assert from "node:assert/strict";
import test from "node:test";

import type { FotMobClient } from "./fotmob_client";
import { normalizeSeasonLabel, resolveProviderCurrentSeason } from "./season-rosters";

test("season roster sync normalizes FotMob short season labels", () => {
  assert.equal(normalizeSeasonLabel("2026/27"), "2026/2027");
  assert.equal(normalizeSeasonLabel("2026"), "2026");
});

test("incremental roster planning can follow FotMob provider current season", async () => {
  const client: FotMobClient = {
    async getLeague() {
      return {
        id: "47",
        name: "Premier League",
        country: "England",
        season: "2026/27"
      };
    },
    async getTeams() {
      throw new Error("not used");
    },
    async getFixtures() {
      throw new Error("not used");
    },
    async getFixtureDetails() {
      throw new Error("not used");
    },
    async getPlayer() {
      throw new Error("not used");
    }
  };

  const season = await resolveProviderCurrentSeason(
    client,
    {
      league_id: 47,
      name: "Premier League",
      calendar_type: "autumn_spring",
      initial_start_season: "2023/2024",
      enabled: true
    },
    "2025/2026"
  );

  assert.equal(season, "2026/2027");
});
