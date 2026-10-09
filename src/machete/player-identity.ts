/** @spec spec://modules/machete/FEAT-001-global-ranking-strategy#player-identity */
import { normalizeName } from "@/lib/text";

// Unicode normalization does not decompose these Latin letters. The explicit
// folds follow CLDR Latin-ASCII and apply to comparisons, never display names.
const latinIdentityFolds: Readonly<Record<string, string>> = {
  ø: "o", ł: "l", đ: "d", ð: "d", þ: "th", æ: "ae", œ: "oe", ß: "ss", ı: "i", ħ: "h"
};

export function normalizeFantasyPlayerIdentityName(value: string) {
  return normalizeName(foldFantasyPlayerLatinLetters(value));
}

function foldFantasyPlayerLatinLetters(value: string) {
  return value.toLowerCase().replace(/[øłđðþæœßıħ]/g, (letter) => latinIdentityFolds[letter]);
}

export function normalizeFantasyPlayerSearchName(value: string) {
  // Search also accepts Cyrillic display names; preserve their letters.
  return foldFantasyPlayerLatinLetters(value).normalize("NFKD").replace(/[\u0300-\u036f]/g, "").trim();
}

export function fantasyPlayerMatchesNameQuery(name: string, canonicalName: string | null | undefined, query: string) {
  const key = normalizeFantasyPlayerSearchName(query);
  return !key || normalizeFantasyPlayerSearchName(name).includes(key)
    || Boolean(canonicalName && normalizeFantasyPlayerSearchName(canonicalName).includes(key));
}
