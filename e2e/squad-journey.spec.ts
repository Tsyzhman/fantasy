import { expect, test } from "@playwright/test";

type PlayerPoolPayload = {
  players?: Array<{
    name?: unknown;
    predictedFp?: unknown;
  }>;
};

const productionSmokeLeagueId = "63";

test("search a forecast, auto-pick the current squad, and save it", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "The full mutation journey runs once; responsive projects are read-only.");
  test.slow();

  await page.goto(`/machete/squad?leagueId=${productionSmokeLeagueId}`);

  const plannerScope = page.locator("[data-fantasy-squad-planner]");
  await expect(plannerScope).toHaveCount(1);
  const leagueId = await plannerScope.getAttribute("data-league-id");
  const season = await plannerScope.getAttribute("data-season");
  expect(leagueId).toBe(productionSmokeLeagueId);
  expect(season).toMatch(/^\d{4}(?:\/\d{4})?$/);
  if (!leagueId || !season) return;

  const poolResult = await page.evaluate(async (requestPath) => {
    const response = await fetch(requestPath, { cache: "no-store" });
    return {
      status: response.status,
      body: await response.json()
    };
  }, `/api/machete/squads?${new URLSearchParams({ leagueId, season })}`);
  expect(poolResult.status, JSON.stringify(poolResult.body)).toBe(200);
  const pool = poolResult.body as PlayerPoolPayload;
  const forecastPlayer = pool.players?.find(
    (player): player is { name: string; predictedFp: number } =>
      typeof player.name === "string" && player.name.length > 1 && typeof player.predictedFp === "number"
  );
  expect(forecastPlayer, "The production pool must contain a player with a forecast.").toBeTruthy();
  if (!forecastPlayer) return;

  const playerSearch = new URLSearchParams({
    leagueId,
    season,
    query: forecastPlayer.name
  });
  await page.goto(`/machete/players?${playerSearch}`);
  await expect(page.getByRole("heading", { name: "Players", exact: true })).toBeVisible();
  await expect(page.getByRole("searchbox", { name: "Player search", exact: true })).toHaveValue(forecastPlayer.name);
  await expect(page.getByRole("button", { name: `Add ${forecastPlayer.name} to comparison`, exact: true }).first()).toBeVisible();

  await page.goto(`/machete/squad?${new URLSearchParams({ leagueId, season })}`);
  const autoPickButton = page.getByRole("button", { name: /Auto-pick squad/i });
  await expect(autoPickButton).toBeEnabled({ timeout: 30_000 });
  await expect(page.getByLabel(/Saved variant|Variant name/i)).toHaveCount(0);
  await autoPickButton.click();

  await expect(page.getByText("Valid squad", { exact: true })).toBeVisible();
  const saveButton = page.getByRole("button", { name: /Save squad/i });
  await expect(saveButton).toBeEnabled();
  await saveButton.click();
  await page.waitForURL((url) => url.pathname === "/machete/squad" && Boolean(url.searchParams.get("squadId")), {
    timeout: 30_000
  });
  expect(new URL(page.url()).searchParams.get("squadId")).toBeTruthy();
});
