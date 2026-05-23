import assert from "node:assert/strict";
import test from "node:test";

import {
  retentionCalendarTypesForDate,
  retentionCutoffStartYear,
  selectExpiredLeagueSeasons,
  type LeagueSeasonRetentionRow
} from "./league-season-retention";

const timeZone = "UTC";

test("January retention keeps only the latest two spring-autumn seasons", () => {
  const now = new Date("2026-01-01T00:00:00.000Z");
  const rows: LeagueSeasonRetentionRow[] = [
    row(130, "2022", "spring_autumn"),
    row(130, "2023", "spring_autumn"),
    row(130, "2024", "spring_autumn"),
    row(47, "2022/2023", "autumn_spring")
  ];

  assert.deepEqual(retentionCalendarTypesForDate(now, timeZone), ["spring_autumn"]);
  assert.equal(retentionCutoffStartYear(now, 2, timeZone), 2025);
  assert.deepEqual(
    selectExpiredLeagueSeasons(rows, {
      now,
      retentionYears: 2,
      timeZone,
      calendarTypes: ["spring_autumn"]
    }).map((season) => [Number(season.leagueId), season.season, season.calendarType, season.cutoffStartYear]),
    [
      [130, "2022", "spring_autumn", 2025],
      [130, "2023", "spring_autumn", 2025],
      [130, "2024", "spring_autumn", 2025]
    ]
  );
});

test("July retention keeps only the latest two autumn-spring seasons", () => {
  const now = new Date("2026-07-01T00:00:00.000Z");
  const rows: LeagueSeasonRetentionRow[] = [
    row(47, "2021/2022", "autumn_spring"),
    row(47, "22/23", "autumn_spring"),
    row(47, "2023/2024", "autumn_spring"),
    row(47, "2024/2025", "autumn_spring"),
    row(47, "2025/2026", "autumn_spring"),
    row(130, "2022", "spring_autumn")
  ];

  assert.deepEqual(retentionCalendarTypesForDate(now, timeZone), ["autumn_spring"]);
  assert.equal(retentionCutoffStartYear(now, 2, timeZone), 2025);
  assert.deepEqual(
    selectExpiredLeagueSeasons(rows, {
      now,
      retentionYears: 2,
      timeZone,
      calendarTypes: ["autumn_spring"]
    }).map((season) => [Number(season.leagueId), season.season, season.startYear, season.cutoffStartYear]),
    [
      [47, "2021/2022", 2021, 2025],
      [47, "22/23", 2022, 2025],
      [47, "2023/2024", 2023, 2025],
      [47, "2024/2025", 2024, 2025]
    ]
  );
});

test("non-retention dates do not activate cleanup by default", () => {
  assert.deepEqual(retentionCalendarTypesForDate(new Date("2026-05-23T00:00:00.000Z"), timeZone), []);
});

test("tournament league config is not inferred as a domestic retention season", () => {
  const now = new Date("2026-01-01T00:00:00.000Z");

  assert.deepEqual(
    selectExpiredLeagueSeasons([row(77, "2022", null)], {
      now,
      retentionYears: 2,
      timeZone,
      calendarTypes: ["spring_autumn"]
    }),
    []
  );
});

function row(leagueId: number, season: string, calendarType: LeagueSeasonRetentionRow["calendarType"]): LeagueSeasonRetentionRow {
  return {
    leagueId: BigInt(leagueId),
    season,
    calendarType,
    name: `League ${leagueId}`,
    country: null
  };
}
