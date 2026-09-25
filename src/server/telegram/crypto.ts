import { createHmac, randomBytes } from "node:crypto";
import { TELEGRAM_CODE_LENGTH, TELEGRAM_CODE_SLOT_MS } from "./config";

/**
 * @spec spec://modules/telegram/FEAT-007-deadline-assistant#linking
 */
const CROCKFORD_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const CODE_GROUP_SIZE = 4;

export function telegramCodeSlot(now: Date): number {
  return Math.floor(now.getTime() / TELEGRAM_CODE_SLOT_MS);
}

function crockfordFromBytes(bytes: Buffer, length: number): string {
  let bits = 0;
  let value = 0;
  let output = "";
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5 && output.length < length) {
      output += CROCKFORD_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0 && output.length < length) {
    output += CROCKFORD_ALPHABET[(value << (5 - bits)) & 31];
  }
  return output.slice(0, length);
}

export function formatTelegramLinkCode(raw: string): string {
  const groups: string[] = [];
  for (let index = 0; index < raw.length; index += CODE_GROUP_SIZE) groups.push(raw.slice(index, index + CODE_GROUP_SIZE));
  return groups.join("-");
}

export function normalizeTelegramLinkCode(input: string): string | null {
  const normalized = input
    .toUpperCase()
    .replace(/[^0-9A-Z]/g, "")
    .replace(/[IL]/g, "1")
    .replace(/O/g, "0");
  if (normalized.length !== TELEGRAM_CODE_LENGTH) return null;
  if (![...normalized].every((character) => CROCKFORD_ALPHABET.includes(character))) return null;
  return normalized;
}

export function generateTelegramLinkCode(randomBytesImpl: (size: number) => Buffer = randomBytes): string {
  return formatTelegramLinkCode(crockfordFromBytes(randomBytesImpl(8), TELEGRAM_CODE_LENGTH));
}

export function generateTelegramLinkSecret(randomBytesImpl: (size: number) => Buffer = randomBytes): string {
  return randomBytesImpl(16).toString("base64url");
}

export function deriveTelegramChallengeCode(key: string, sessionId: string, slot: number): string {
  const digest = createHmac("sha256", key).update(`telegram:code:${sessionId}:${slot}`).digest();
  return formatTelegramLinkCode(crockfordFromBytes(digest, TELEGRAM_CODE_LENGTH));
}

export function deriveTelegramChallengeSecret(key: string, sessionId: string, slot: number): string {
  const digest = createHmac("sha256", key).update(`telegram:secret:${sessionId}:${slot}`).digest();
  return digest.subarray(0, 16).toString("base64url");
}

export function digestTelegramSecret(kind: "code" | "secret", value: string, key: string): string {
  return createHmac("sha256", key).update(`telegram:${kind}:${value}`).digest("hex");
}
