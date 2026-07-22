import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");

test("admin users can create, update, and remove a Sports.ru profile link", () => {
  assert.match(source, /name="sportsRuProfile"/);
  assert.match(source, /setUserSportsRuProfileAction/);
  assert.match(source, /normalizeSportsRuProfileId\(rawProfile\)/);
  assert.match(source, /userExternalProfile\.upsert/);
  assert.match(source, /userExternalProfile\.deleteMany/);
});

test("admin users list loads only the Sports.ru external profile", () => {
  assert.match(source, /externalProfiles:\s*\{/);
  assert.match(source, /where: \{ provider: sportsRuProvider \}/);
  assert.match(source, /defaultValue=\{user\.externalProfiles\[0\]\?\.profileUrl \?\? ""\}/);
});
