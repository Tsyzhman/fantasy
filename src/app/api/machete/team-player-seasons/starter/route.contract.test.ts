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
  assert.match(routeSource, /if \(update\.count > 0\)/);
  assert.match(routeSource, /data: \{ startingXiChangedAt: new Date\(\) \}/);
  assert.match(routeSource, /pg_advisory_xact_lock/);
  assert.match(routeSource, /tx\.\$executeRaw\(Prisma\.sql`SELECT pg_advisory_xact_lock/);
  assert.doesNotMatch(routeSource, /tx\.\$queryRaw\(Prisma\.sql`SELECT pg_advisory_xact_lock/);
  assert.match(routeSource, /startingXiSelectionBlockReason\(roster, candidate\)/);
  assert.match(routeSource, /StarterLimitError/);
  assert.match(routeSource, /409/);
});
