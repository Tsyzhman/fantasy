import assert from "node:assert/strict";
import test from "node:test";

import { createXMasHeader, xMasSigningUrl } from "./signing";

test("x-mas signing body uses FotMob's absolute URL and deploy marker", () => {
  const absoluteUrl = xMasSigningUrl(new URL("https://www.fotmob.com/api/data/matchDetails?matchId=4813378"));
  const decoded = JSON.parse(Buffer.from(createXMasHeader(absoluteUrl, 123), "base64").toString("utf8")) as {
    body?: { url?: string; code?: number; foo?: string };
    signature?: string;
  };

  assert.equal(decoded.body?.url, "https://www.fotmob.com/api/data/matchDetails?matchId=4813378");
  assert.equal(decoded.body?.code, 123);
  assert.match(decoded.body?.foo ?? "", /^production:/);
  assert.match(decoded.signature ?? "", /^[A-F0-9]{32}$/);
});
