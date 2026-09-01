import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  beginFantasySquadLeagueNavigation,
  buildFantasySquadLeagueHref,
  fantasySquadPendingLeagueId,
  finishFantasySquadLeagueNavigation,
  subscribeFantasySquadLeagueNavigation
} from "./squad-league-navigation";

const switcherSource = readFileSync(new URL("../components/machete/SquadLeagueSwitcher.tsx", import.meta.url), "utf8");
const plannerSource = readFileSync(new URL("../components/machete/FantasySquadPlanner.tsx", import.meta.url), "utf8");

test("league navigation keeps normalized history and drops state owned by the old league", () => {
  const href = buildFantasySquadLeagueHref(
    "/machete/squad",
    "squadId=old&franchise=other&provider=FPL&historyScope=ALL_PLAYER_MATCHES&historyWindow=SELECTED_SEASONS&historySeason=2024%2F2025&historySeason=2025%2F2026",
    " 48 "
  );
  assert.equal(
    href,
    "/machete/squad?leagueId=48&historyScope=ALL_PLAYER_MATCHES&historyWindow=SELECTED_SEASONS&historySeason=2024%2F2025&historySeason=2025%2F2026"
  );
});

test("the latest requested league owns the navigation marker", () => {
  finishFantasySquadLeagueNavigation();
  beginFantasySquadLeagueNavigation("47");
  beginFantasySquadLeagueNavigation("48");
  finishFantasySquadLeagueNavigation("47");
  assert.equal(fantasySquadPendingLeagueId(), "48");
  finishFantasySquadLeagueNavigation("48");
  assert.equal(fantasySquadPendingLeagueId(), null);
});

test("league navigation subscribers see only real marker changes", () => {
  finishFantasySquadLeagueNavigation();
  let notifications = 0;
  const unsubscribe = subscribeFantasySquadLeagueNavigation(() => {
    notifications += 1;
  });
  beginFantasySquadLeagueNavigation("47");
  beginFantasySquadLeagueNavigation("47");
  finishFantasySquadLeagueNavigation("48");
  finishFantasySquadLeagueNavigation("47");
  unsubscribe();
  beginFantasySquadLeagueNavigation("48");
  finishFantasySquadLeagueNavigation("48");
  assert.equal(notifications, 2);
});

test("squad switch cancels old batches and has a deterministic stalled-navigation fallback", () => {
  assert.match(switcherSource, /onChange=\{\(event\) => navigate\(event\.target\.value\)\}/);
  assert.match(switcherSource, /router\.replace\(href, \{ scroll: false \}\)/);
  assert.match(switcherSource, /window\.location\.replace\(href\)/);
  assert.match(switcherSource, /window\.location\.reload\(\)/);
  assert.match(switcherSource, /SquadLeagueCommit/);
  assert.match(switcherSource, /fantasySquadLeagueNavigationEvent/);
  assert.match(plannerSource, /foregroundPlayerPoolCancelRef\.current\?\.\(\)/);
  assert.match(plannerSource, /backgroundPlayerPoolCancelRef\.current\?\.\(\)/);
});
