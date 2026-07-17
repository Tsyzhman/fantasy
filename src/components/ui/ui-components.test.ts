import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { ActiveFilterChips } from "./active-filter-chips";
import { buildCurrentLinkHref } from "./copy-current-link-button";
import { FdrPill, FdrRow } from "./fdr-pill";
import { LeagueFlag } from "./league-flag";
import { PlayerHoverCard } from "./player-hover-card";
import { ScoreHeatCell, computeRanks } from "./score-heat-cell";

test("LeagueFlag renders an accessible SVG flag", () => {
  const html = renderToStaticMarkup(
    React.createElement(LeagueFlag, {
      league: { id: "premier-league", name: "Premier League", country: "England" },
      size: 32
    })
  );

  assert.match(html, /role="img"/);
  assert.match(html, /Premier League/);
  assert.match(html, /<svg/);
});

test("ScoreHeatCell renders formatted values with heat variables", () => {
  const ranks = computeRanks([2, 8, null, 5]);
  const html = renderToStaticMarkup(
    React.createElement(ScoreHeatCell, {
      value: 8,
      rank: ranks[1],
      tone: "sky"
    })
  );

  assert.deepEqual(ranks, [0, 1, null, 0.5]);
  assert.match(html, /--heat-fill:1/);
  assert.match(html, />8</);
  assert.match(html, /text-sky-700/);
});

test("ActiveFilterChips renders removal and reset links", () => {
  const html = renderToStaticMarkup(
    React.createElement(ActiveFilterChips, {
      chips: [{ key: "team:1", label: "Team: A", removeHref: "/players" }],
      resetHref: "/players?reset=1"
    })
  );

  assert.match(html, /Active filters/);
  assert.match(html, /Team: A/);
  assert.match(html, /Remove filter Team: A/);
  assert.match(html, /Clear all/);
});

test("buildCurrentLinkHref preserves query state", () => {
  assert.equal(buildCurrentLinkHref("/mixerr", "leagueId=47&season=2025%2F2026"), "/mixerr?leagueId=47&season=2025%2F2026");
  assert.equal(buildCurrentLinkHref("/compare", ""), "/compare");
});

test("FDR components clamp numeric difficulty while fixtures use one fill and home-only emphasis", () => {
  const pillHtml = renderToStaticMarkup(React.createElement(FdrPill, { difficulty: 9 }));
  const rowHtml = renderToStaticMarkup(
    React.createElement(FdrRow, {
      fixtures: [
        { label: "ARS", difficulty: 2, side: "home", title: "H ARS" },
        { label: "LEE", difficulty: null, side: "away", title: "A LEE" }
      ]
    })
  );

  assert.match(pillHtml, /fdr-5/);
  assert.match(rowHtml, /ARS/);
  assert.match(rowHtml, /LEE/);
  assert.match(rowHtml, /fixture-pill-home/);
  assert.match(rowHtml, /fixture-pill-away/);
  assert.doesNotMatch(rowHtml, /fdr-[1-5]/);
  assert.doesNotMatch(rowHtml, /border-sky|border-violet/);
  assert.match(rowHtml, /H ARS/);
  assert.match(rowHtml, /A LEE/);
});

test("PlayerHoverCard renders player summary and fixture pills", () => {
  const html = renderToStaticMarkup(
    React.createElement(PlayerHoverCard, {
      player: {
        name: "Alex Forward",
        position: "FWD",
        teamName: "Test Football Club",
        teamShortName: "Test FC",
        matchesPlayed: 12,
        minutesPlayed: 880,
        goals: 5,
        assists: 2,
        averageRating: 7.12,
        xFp: 8.4,
        actualFp: 7.3,
        altFp: 6.5,
        fixtures: [{ label: "ARS", difficulty: 4 }]
      },
      trigger: React.createElement("span", null, "Alex")
    })
  );

  assert.match(html, /role="tooltip"/);
  assert.match(html, /Alex Forward/);
  assert.match(html, /FWD · Test FC/);
  assert.match(html, /title="Test Football Club"/);
  assert.match(html, /xFP/);
  assert.match(html, /ARS/);
});
