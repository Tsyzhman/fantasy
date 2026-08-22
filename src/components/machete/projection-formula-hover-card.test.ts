import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { ProjectionDetailsBody, projectionFormulaDetailsHref } from "./ProjectionFormulaHoverCard";

test("projection detail URL preserves history filters and drops squad state", () => {
  const href = projectionFormulaDetailsHref(
    "/api/machete/squads?leagueId=48&season=2026%2F2027&squadId=squad-1&historyScope=ALL_LOADED&historyWindow=LAST_5",
    "123",
    "SPORTS_RU"
  );
  assert.ok(href);
  const parsed = new URL(href, "http://localhost");
  assert.equal(parsed.pathname, "/api/machete/squads/projection-details");
  assert.equal(parsed.searchParams.get("playerId"), "123");
  assert.equal(parsed.searchParams.get("historyWindow"), "LAST_5");
  assert.equal(parsed.searchParams.has("squadId"), false);
});

test("projection detail tooltip renders formula arithmetic lazily returned by the detail route", () => {
  const html = renderToStaticMarkup(React.createElement(ProjectionDetailsBody, {
    language: "ru",
    detailed: true,
    formula: {
      formula: "xg * 5",
      total: 1.5,
      terms: [{ expression: "xg * 5", resolvedExpression: "0.3 * 5", sign: 1, value: 1.5 }]
    },
    components: {
      appearance: 1,
      sixtyMinutes: 0,
      fullMatch: 0,
      goals: 0.5,
      assists: 0,
      cleanSheet: 0,
      saves: 0,
      recoveries: 0,
      goalsConceded: 0,
      yellowCards: 0,
      redCards: 0,
      total: 1.5
    },
    fixtureInputs: {
      expectedMinutes: 75,
      appearanceProbability: 0.9,
      sixtyMinutesProbability: 0.7,
      fullMatchProbability: 0.5,
      expectedGoals: 0.3,
      expectedAssists: 0.2,
      expectedRecoveries: 3,
      expectedSaves: 0,
      expectedYellowCards: 0.1,
      expectedRedCards: 0.01,
      expectedGoalsConceded: 1,
      expectedCleanSheets: 0.35
    }
  }));
  assert.match(html, /0\.3 \* 5/);
  assert.match(html, /Итого/);
  assert.match(html, /expectedGoals/);
});

test("projection detail request cache is bounded by entries and bytes", () => {
  const source = readFileSync(new URL("./ProjectionFormulaHoverCard.tsx", import.meta.url), "utf8");
  assert.match(source, /detailRequestCacheMaximumEntries = 80/);
  assert.match(source, /detailRequestCacheMaximumBytes = 2 \* 1024 \* 1024/);
  assert.match(source, /detailRequestCacheBytes > detailRequestCacheMaximumBytes/);
});
