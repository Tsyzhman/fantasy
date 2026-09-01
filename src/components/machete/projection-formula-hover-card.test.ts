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

test("compact FO/Alt tooltip keeps only total and every arithmetic term", () => {
  const html = renderToStaticMarkup(React.createElement(ProjectionDetailsBody, {
    language: "en",
    detailed: false,
    formula: {
      formula: "appearance + 6 * xg + poisson_groups(xga, 2)",
      total: 3.9,
      terms: [
        { expression: "appearance", resolvedExpression: "appearance probability (1)", sign: 1, value: 1 },
        { expression: "xg", resolvedExpression: "(6 * expected goals (0.0002))", sign: 1, value: 0.001 },
        { expression: "xga", resolvedExpression: "poisson_groups(expected goals conceded (0.885), 2)", sign: -1, value: -0.235 },
        { expression: "yellow", resolvedExpression: "expected yellow cards (0)", sign: -1, value: 0 }
      ]
    },
    components: { total: 3.9 },
    fixtureInputs: { expectedMinutes: 90 }
  }));
  assert.match(html, /Total:/);
  assert.match(html, /\+ appearance probability \(1\) =/);
  assert.match(html, /− poisson_groups\(expected goals conceded \(0\.885\), 2\) =/);
  assert.match(html, /\+ \(6 \* expected goals \(0\.0002\)\) =/);
  assert.doesNotMatch(html, /Formula/);
  assert.doesNotMatch(html, /expectedMinutes/);
  assert.doesNotMatch(html, /\+4…|\+3…/);
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

test("short FP and Alt tooltips stay narrow while detailed calculations keep extra room", () => {
  const source = readFileSync(new URL("./ProjectionFormulaHoverCard.tsx", import.meta.url), "utf8");
  assert.match(source, /panelMaximumWidth = detailed \? 640 : 280/);
  assert.match(source, /detailed \? "max-h-\[min\(70vh,560px\)\] w-\[min\(640px,calc\(100vw-16px\)\)\] p-4" : "max-h-\[min\(70vh,420px\)\] w-\[min\(280px,calc\(100vw-16px\)\)\] p-2"/);
  assert.doesNotMatch(source, /w-\[min\(440px,calc\(100vw-16px\)\)\]/);
  assert.doesNotMatch(source, /terms\.slice\(0, 8\)/);
});
