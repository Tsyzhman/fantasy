import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { chromium } from "playwright";

const extensionPath = path.resolve("output/browser-extension/chromium");
const userDataDir = await mkdtemp(path.join(os.tmpdir(), "fantasy-extension-smoke-"));
let context;

try {
  context = await chromium.launchPersistentContext(userDataDir, {
    channel: "chromium",
    headless: true,
    args: [
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`
    ]
  });
  await context.addCookies([{
    name: "fantasy_session",
    value: "a".repeat(43),
    domain: "fantasy.tsyzhman.ru",
    path: "/",
    httpOnly: true,
    secure: true,
    sameSite: "Lax"
  }]);

  const desiredPlayers = Array.from({ length: 15 }, (_, index) => ({
    providerPlayerId: `sports-${index + 1}`,
    name: `Player ${index + 1}`,
    isStarting: index < 11,
    isCaptain: index === 5,
    isViceCaptain: index === 6,
    substitutePriority: index < 11 ? null : index - 10
  }));
  let mutationInput = null;
  await context.route("https://fantasy.tsyzhman.ru/api/browser-extension/sports-squad**", async (route) => {
    assert.equal(route.request().headers().authorization, `Bearer ${"a".repeat(43)}`);
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        plan: {
          tournamentHru: "russia",
          sportsRuSeasonId: "75",
          squadName: "Test squad",
          players: desiredPlayers
        }
      })
    });
  });
  await context.route("https://www.sports.ru/gql/graphql/", async (route) => {
    const body = route.request().postDataJSON();
    if (body.query.includes("FantasyTransferUpdateSquad")) {
      mutationInput = body.variables.input;
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          data: {
            fantasyMutations: {
              updateSquad: {
                status: true,
                message: "",
                squad: { id: "squad-1", name: "Test" }
              }
            }
          }
        })
      });
      return;
    }
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        data: {
          fantasyQueries: {
            tournament: {
              currentSeason: {
                id: "75",
                currentSquad: {
                  id: "squad-1",
                  name: "Existing",
                  currentTourInfo: {
                    players: desiredPlayers.map((player) => ({
                      seasonPlayer: { id: player.providerPlayerId }
                    }))
                  }
                }
              }
            }
          }
        }
      })
    });
  });
  await context.route("https://www.sports.ru/fantasy/football/russia/", (route) => route.fulfill({
    contentType: "text/html",
    body: "<!doctype html><html><body><main>Sports fantasy extension smoke</main></body></html>"
  }));

  const page = context.pages()[0] ?? await context.newPage();
  await page.goto("https://www.sports.ru/fantasy/football/russia/");
  const button = page.locator("#fantasy-tsyzhman-sports-transfer").locator("button");
  await button.waitFor({ state: "visible", timeout: 10_000 });
  await button.click();
  for (let attempt = 0; attempt < 100 && !mutationInput; attempt += 1) {
    await page.waitForTimeout(50);
  }

  assert.ok(mutationInput, "Sports.ru updateSquad mutation was not sent.");
  assert.equal(mutationInput.squadID, "squad-1");
  assert.equal(mutationInput.playersOnly, true);
  assert.equal(mutationInput.players.length, 15);
  assert.deepEqual(
    mutationInput.players.slice(11).map((player) => player.SubstitutePriority),
    [1, 2, 3, 4]
  );
  console.log("Extension smoke passed: HttpOnly session -> 15-player atomic updateSquad.");
} finally {
  await context?.close();
  await rm(userDataDir, { recursive: true, force: true });
}
