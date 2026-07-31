import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const baseManifest = JSON.parse(
  readFileSync(new URL("../extensions/sports-squad-transfer/manifest.base.json", import.meta.url), "utf8")
);
const chromiumManifest = JSON.parse(
  readFileSync(new URL("../extensions/sports-squad-transfer/manifest.chromium.json", import.meta.url), "utf8")
);
const firefoxManifest = JSON.parse(
  readFileSync(new URL("../extensions/sports-squad-transfer/manifest.firefox.json", import.meta.url), "utf8")
);
const backgroundSource = readFileSync(
  new URL("../extensions/sports-squad-transfer/background.js", import.meta.url),
  "utf8"
);
const contentSource = readFileSync(
  new URL("../extensions/sports-squad-transfer/content.js", import.meta.url),
  "utf8"
);
const routeSource = readFileSync(
  new URL("./app/api/browser-extension/sports-squad/route.ts", import.meta.url),
  "utf8"
);

test("browser extension requests only the two hosts and cookie access required for transfer", () => {
  assert.equal(baseManifest.manifest_version, 3);
  assert.deepEqual(baseManifest.permissions, ["cookies"]);
  assert.deepEqual(baseManifest.host_permissions, ["https://fantasy.tsyzhman.ru/*"]);
  assert.deepEqual(baseManifest.content_scripts[0].matches, ["https://www.sports.ru/fantasy/football/*"]);
  assert.doesNotMatch(JSON.stringify(baseManifest), /<all_urls>|\*:\/\/\*/);
});

test("Chromium and Firefox use their supported Manifest V3 background implementations", () => {
  assert.equal(chromiumManifest.background.service_worker, "background.js");
  assert.equal(firefoxManifest.background.scripts[0], "background.js");
  assert.match(firefoxManifest.browser_specific_settings.gecko.id, /@fantasy\.tsyzhman\.ru$/);
  assert.deepEqual(
    firefoxManifest.browser_specific_settings.gecko.data_collection_permissions.required,
    ["authenticationInfo", "websiteActivity"]
  );
});

test("session cookie stays in the background while Sports.ru receives one atomic squad mutation", () => {
  assert.match(backgroundSource, /sessionCookieName = "fantasy_session"/);
  assert.match(backgroundSource, /Authorization: `Bearer \$\{sessionCookie\.value\}`/);
  assert.doesNotMatch(contentSource, /fantasy_session|Authorization/);
  assert.match(contentSource, /updateSquad\(input: \$input\)/);
  assert.match(contentSource, /playersOnly: true/);
  assert.match(contentSource, /input\.SubstitutePriority = player\.substitutePriority/);
  assert.match(contentSource, /window\.location\.reload\(\)/);
});

test("extension API authenticates the bearer session and never caches a squad plan", () => {
  assert.match(routeSource, /requireBrowserExtensionUser\(request\)/);
  assert.match(routeSource, /loadSportsRuExtensionTransferPlan/);
  assert.match(routeSource, /Cache-Control", "private, no-store"/);
  assert.match(routeSource, /Vary", "Authorization"/);
});
