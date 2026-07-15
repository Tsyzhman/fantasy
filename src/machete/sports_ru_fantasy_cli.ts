export type SportsRuFantasyCliArgs = Record<string, string | boolean>;

export function parseSportsRuFantasyCliArgs(argv: string[]): SportsRuFantasyCliArgs {
  const result: SportsRuFantasyCliArgs = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith("--")) continue;
    const inlineSeparator = arg.indexOf("=");
    if (inlineSeparator > 2) {
      const key = arg.slice(2, inlineSeparator);
      const value = arg.slice(inlineSeparator + 1);
      result[key] = value || true;
      continue;
    }
    const key = arg.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      result[key] = true;
      continue;
    }
    result[key] = next;
    index += 1;
  }
  return result;
}

export function sportsRuFantasyCliBoolean(value: string | boolean | undefined) {
  if (value === true) return true;
  if (typeof value !== "string") return false;
  const normalized = value.trim().toLowerCase();
  if (["true", "1", "yes"].includes(normalized)) return true;
  if (["false", "0", "no"].includes(normalized)) return false;
  throw new Error(`Expected a boolean; received ${value}.`);
}
