import assert from "node:assert/strict";
import test from "node:test";

import { fotMobPlayerPhotoSourceUrl, isFotMobPlayerId, isPngPhoto, playerPhotoPublicUrl } from "./player-photo-cache";

test("player photo URLs accept only numeric FotMob IDs", () => {
  assert.equal(isFotMobPlayerId("123456"), true);
  assert.equal(isFotMobPlayerId("../123"), false);
  assert.equal(playerPhotoPublicUrl("123456"), "/api/machete/player-photos/123456");
  assert.equal(playerPhotoPublicUrl("bad"), null);
  assert.equal(fotMobPlayerPhotoSourceUrl("123456"), "https://images.fotmob.com/image_resources/playerimages/123456.png");
});

test("player photo cache rejects non-PNG payloads", () => {
  assert.equal(isPngPhoto(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00])), true);
  assert.equal(isPngPhoto(Buffer.from("not an image")), false);
});
