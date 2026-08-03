import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const routePath = new URL("./route.ts", import.meta.url);
const teamPagePath = new URL("../../../../machete/leagues/[leagueId]/teams/[teamId]/page.tsx", import.meta.url);

test("starter status requires a signed-in user but is not restricted to admins", async () => {
  const [routeSource, pageSource] = await Promise.all([
    readFile(routePath, "utf8"),
    readFile(teamPagePath, "utf8")
  ]);

  assert.match(routeSource, /requireApiUser\(request\)/);
  assert.doesNotMatch(routeSource, /requireApiAdmin/);
  assert.match(pageSource, /const canEditRoster = Boolean\(currentUser\)/);
  assert.doesNotMatch(pageSource, /const canEditRoster = currentUser\?\.role === UserRole\.ADMIN/);
  assert.match(routeSource, /isStarter: !isStarter/);
  assert.match(routeSource, /changed = changed \|\| update\.count > 0/);
  assert.match(routeSource, /if \(changed\)/);
  assert.match(routeSource, /data: \{ startingXiChangedAt: new Date\(\) \}/);
  assert.match(routeSource, /pg_advisory_xact_lock/);
  assert.match(routeSource, /tx\.\$executeRaw\(Prisma\.sql`SELECT pg_advisory_xact_lock/);
  assert.doesNotMatch(routeSource, /tx\.\$queryRaw\(Prisma\.sql`SELECT pg_advisory_xact_lock/);
  assert.match(routeSource, /startingXiSelectionBlockReason\(effectiveRoster, candidate\)/);
  assert.match(routeSource, /StarterLimitError/);
  assert.match(routeSource, /409/);
});

test("starter status materializes only a verified Sports.ru authoritative roster candidate", async () => {
  const routeSource = await readFile(routePath, "utf8");

  assert.match(routeSource, /loadSportsRuAuthoritativeStarterCandidate\(tx/);
  assert.match(routeSource, /seasons: sportsRuSeasonAliases\(season\)/);
  assert.match(routeSource, /effectiveRoster = activeCandidate \? roster : \[\.\.\.roster, candidate\]/);
  assert.match(routeSource, /tx\.teamPlayerSeason\.upsert/);
  assert.match(routeSource, /source: sportsRuRosterSource/);
  assert.match(routeSource, /active: true/);
  assert.match(routeSource, /activeCandidate\.source !== sportsRuRosterSource/);
  assert.match(routeSource, /teamId: \{ not: teamId \}/);
  assert.match(routeSource, /data: \{ active: false, isStarter: false \}/);
  assert.match(routeSource, /startingXiSelectionBlockReason\(effectiveRoster, candidate\)/);
});
