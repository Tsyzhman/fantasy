import assert from "node:assert/strict";
import test from "node:test";
import {
  deriveTelegramChallengeCode,
  deriveTelegramChallengeSecret,
  digestTelegramSecret,
  formatTelegramLinkCode,
  generateTelegramLinkCode,
  generateTelegramLinkSecret,
  normalizeTelegramLinkCode,
  telegramCodeSlot
} from "./crypto";

/**
 * @spec spec://modules/telegram/FEAT-007-deadline-assistant#linking
 */
test("code generation uses 12 Crockford characters in three groups", () => {
  const code = generateTelegramLinkCode();
  assert.match(code, /^[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$/);
  assert.equal(formatTelegramLinkCode("ABCDEFGHJKMN"), "ABCD-EFGH-JKMN");
});

test("manual code normalization accepts separators and Crockford confusions", () => {
  assert.equal(normalizeTelegramLinkCode("abcd-efgh-jkmn"), "ABCDEFGHJKMN");
  assert.equal(normalizeTelegramLinkCode("ABCD EFGH JKM0"), "ABCDEFGHJKM0");
  assert.equal(normalizeTelegramLinkCode("OIL1-2222-3333"), "011122223333");
  assert.equal(normalizeTelegramLinkCode("too-short"), null);
  assert.equal(normalizeTelegramLinkCode("UUUU-UUUU-UUUU"), null);
});

test("secret generation returns 128-bit base64url", () => {
  const secret = generateTelegramLinkSecret();
  assert.match(secret, /^[A-Za-z0-9_-]{22}$/);
});

test("challenge derivation is stable per session and slot", () => {
  const key = "test-key";
  const first = deriveTelegramChallengeCode(key, "session-1", 100);
  assert.equal(first, deriveTelegramChallengeCode(key, "session-1", 100));
  assert.notEqual(first, deriveTelegramChallengeCode(key, "session-1", 101));
  assert.notEqual(first, deriveTelegramChallengeCode(key, "session-2", 100));
  assert.notEqual(deriveTelegramChallengeSecret(key, "session-1", 100), deriveTelegramChallengeSecret(key, "session-1", 101));
});

test("digests depend on kind and key", () => {
  const codeDigest = digestTelegramSecret("code", "ABCD", "key");
  assert.equal(codeDigest.length, 64);
  assert.notEqual(codeDigest, digestTelegramSecret("secret", "ABCD", "key"));
  assert.notEqual(codeDigest, digestTelegramSecret("code", "ABCD", "other"));
});

test("slot advances every 15 seconds", () => {
  assert.equal(telegramCodeSlot(new Date("2026-09-25T08:00:00.000Z")), telegramCodeSlot(new Date("2026-09-25T08:00:14.999Z")));
  assert.equal(telegramCodeSlot(new Date("2026-09-25T08:00:15.000Z")), telegramCodeSlot(new Date("2026-09-25T08:00:00.000Z")) + 1);
});
