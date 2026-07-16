import { expect, test, type Page } from "@playwright/test";

type PlayerPoolPayload = {
  players?: Array<{
    name?: unknown;
    predictedFp?: unknown;
  }>;
};

test("search a forecast, auto-pick a valid squad, save it, and remove the QA copy", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "The full mutation journey runs once; responsive projects are read-only.");
  test.slow();

  let createdSquadId: string | null = null;
  const qaSquadName = `E2E optimized ${Date.now()}`;
  await page.goto("/machete/squad");
  await removeStaleQaSquads(page);

  const leagueId = await page.locator('select[name="leagueId"]').inputValue();
  const season = await page.locator('select[name="season"]').inputValue();
  expect(leagueId).toMatch(/^\d+$/);
  expect(season).not.toBe("");

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
  await expect(page.getByRole("heading", { name: /Player search and forecasts/i })).toBeVisible();
  await expect(page.locator("tbody:visible").getByText(forecastPlayer.name, { exact: true }).first()).toBeVisible();

  try {
    await page.goto(`/machete/squad?${new URLSearchParams({ leagueId, season })}`);
    const autoPickButton = page.getByRole("button", { name: /Auto-pick squad/i });
    await expect(autoPickButton).toBeEnabled({ timeout: 30_000 });

    await page.getByText("More actions", { exact: true }).click();
    await page.getByRole("button", { name: /New blank/i }).click();
    await page.getByLabel(/Variant name/i).fill(qaSquadName);
    await autoPickButton.click();

    await expect(page.getByText("Valid squad", { exact: true })).toBeVisible();
    const saveButton = page.getByRole("button", { name: /Save squad/i });
    await expect(saveButton).toBeEnabled();
    await saveButton.click();
    await page.waitForURL((url) => url.pathname === "/machete/squad" && Boolean(url.searchParams.get("squadId")), {
      timeout: 30_000
    });
    createdSquadId = new URL(page.url()).searchParams.get("squadId");
    expect(createdSquadId).toBeTruthy();
    await expect(page.getByLabel(/Saved variant/i).locator("option:checked")).toContainText(qaSquadName);
  } finally {
    if (createdSquadId) {
      const cleanupStatus = await deleteSquadInBrowser(page, createdSquadId);
      expect(cleanupStatus, `QA squad cleanup failed with ${cleanupStatus}.`).toBe(200);
    }
  }
});

async function removeStaleQaSquads(page: Page) {
  const staleSquadIds = await page.getByLabel(/Saved variant/i).locator("option").evaluateAll((options) =>
    options
      .filter((option) => option.textContent?.trim().startsWith("E2E optimized "))
      .map((option) => (option as HTMLOptionElement).value)
      .filter(Boolean)
  );
  for (const squadId of staleSquadIds) {
    const status = await deleteSquadInBrowser(page, squadId);
    expect(status, `Stale QA squad cleanup failed with ${status}.`).toBe(200);
  }
}

async function deleteSquadInBrowser(page: Page, squadId: string) {
  return page.evaluate(async (id) => {
    const response = await fetch(`/api/machete/squads?squadId=${encodeURIComponent(id)}`, { method: "DELETE" });
    return response.status;
  }, squadId);
}
