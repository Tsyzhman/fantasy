import { validateCustomFormula } from "@/lib/scoring/formula";

export const projectionFormulaConfigVersion = 1 as const;

export type ProjectionHistoryFormulas = {
  expectedMinutes: string;
  appearanceProbability: string;
  sixtyProbability: string;
  fullMatchProbability: string;
  xgRate: string;
  xaRate: string;
  recoveryRate: string;
  saveRate: string;
  yellowRate: string;
  redRate: string;
};

export type ProjectionTeamFormulas = {
  expectedGoals: string;
  expectedGoalsAgainst: string;
  assistsPerGoal: string;
  cleanSheetProbability: string;
};

export type ProjectionAllocationFormulas = {
  goals: string;
  assists: string;
  recoveries: string;
  saves: string;
  cardExposure: string;
};

export type ProjectionScoreByPosition = {
  GK: string;
  DEF: string;
  MID: string;
  FWD: string;
};

export type ProjectionFormulaConfig = {
  version: typeof projectionFormulaConfigVersion;
  history: ProjectionHistoryFormulas;
  team: ProjectionTeamFormulas;
  allocation: ProjectionAllocationFormulas;
  scoreByPosition: ProjectionScoreByPosition;
};

export type ProjectionFormulaConfigIssue = {
  path: string;
  message: string;
};

export type ProjectionFormulaConfigParseResult = {
  config: ProjectionFormulaConfig;
  issues: ProjectionFormulaConfigIssue[];
  usedFallback: boolean;
};

const maximumFormulaLength = 4_000;

/**
 * Global Expected FP baseline. Bookmaker inputs are gated by the explicit
 * availability flag, so a missing line deterministically falls back to the
 * FotMob projection and Poisson clean-sheet probability.
 */
export const expectedProjectionFormulaConfig: ProjectionFormulaConfig = {
  version: projectionFormulaConfigVersion,
  history: {
    expectedMinutes: "clamp(max({Minutes per match L1}, {Minutes per match L5}, {Minutes per match L10}, {Minutes per match 365}), 0, 90)",
    appearanceProbability: "clamp(max({Appearance rate L5}, {Appearance rate L10}, {Appearance rate 365}, {Expected minutes} / 90), 0, 1)",
    sixtyProbability: "min({Appearance probability}, clamp(max({Sixty rate L5}, {Sixty rate L10}, {Sixty rate 365}), 0, 1))",
    fullMatchProbability: "min({60 minute probability}, clamp(max({Full match rate L5}, {Full match rate L10}, {Full match rate 365}), 0, 1))",
    xgRate: friendRateBlendFormula("xG"),
    xaRate: friendRateBlendFormula("xA"),
    recoveryRate: friendRateBlendFormula("Recoveries"),
    saveRate: friendRateBlendFormula("Saves"),
    yellowRate: "{Yellow cards per 90 365}",
    redRate: "{Red cards per 90 365}"
  },
  team: {
    expectedGoals: "if({Bookmaker odds available}, clamp(0.55 * {Projected xG} + 0.45 * {Bookmaker implied xG}, 0.7 * {Projected xG}, 1.35 * {Projected xG}), {Projected xG})",
    expectedGoalsAgainst: "{Projected xGA}",
    assistsPerGoal: "0.8",
    cleanSheetProbability: "if({Bookmaker odds available}, {Fixture clean sheet probability}, exp(-{Expected goals against}))"
  },
  allocation: {
    goals: "{Blended xG per 90} * {Expected minutes} / 90",
    assists: "{Blended xA per 90} * {Expected minutes} / 90",
    recoveries: "{Blended recoveries per 90} * {Expected minutes} / 90",
    saves: "{Blended saves per 90} * {Expected minutes} / 90",
    cardExposure: "{Expected minutes} / 90"
  },
  scoreByPosition: {
    GK: "{Appearance probability} + {60 minute probability} + 6 * {Expected goals} + 3 * {Expected assists} + 4 * {Expected clean sheets} + poisson_groups({Expected saves}, 3) - poisson_groups({Expected goals conceded}, 2) - {Expected yellow cards} - 3 * {Expected red cards}",
    DEF: "{Appearance probability} + {60 minute probability} + 6 * {Expected goals} + 3 * {Expected assists} + 4 * {Expected clean sheets} + poisson_groups({Expected recoveries}, 3) - poisson_groups({Expected goals conceded}, 2) - {Expected yellow cards} - 3 * {Expected red cards}",
    MID: "{Appearance probability} + {60 minute probability} + {Full match probability} + 5 * {Expected goals} + 3 * {Expected assists} + {Expected clean sheets} + {Expected recoveries} / 3 - {Expected yellow cards} - 3 * {Expected red cards}",
    FWD: "{Appearance probability} + {60 minute probability} + {Full match probability} + 4 * {Expected goals} + 3 * {Expected assists} + {Expected recoveries} / 3 - {Expected yellow cards} - 3 * {Expected red cards}"
  }
};

/**
 * Personal Alt FP baseline adapted from the friend method. The rolling-window
 * blend is supplied by the history stage, allocations use rate-only shares of
 * the probable XI, and bookmaker/conceded-goal modules are intentionally absent.
 */
export const friendAltProjectionFormulaConfig: ProjectionFormulaConfig = {
  version: projectionFormulaConfigVersion,
  history: {
    expectedMinutes: "max({Minutes per match L1}, {Minutes per match L5}, {Minutes per match L10}, {Minutes per match 365})",
    appearanceProbability: "gte({Expected minutes}, 0.000001)",
    sixtyProbability: "gte({Expected minutes}, 60)",
    fullMatchProbability: "gte({Expected minutes}, 90)",
    xgRate: friendRateBlendFormula("xG"),
    xaRate: friendRateBlendFormula("xA"),
    recoveryRate: friendRateBlendFormula("Recoveries"),
    saveRate: friendRateBlendFormula("Saves"),
    yellowRate: "{Yellow cards per 90 365}",
    redRate: "{Red cards per 90 365}"
  },
  team: {
    expectedGoals: "{Projected xG}",
    expectedGoalsAgainst: "{Projected xGA}",
    assistsPerGoal: "0.8",
    cleanSheetProbability: "exp(-{Expected goals against})"
  },
  allocation: {
    goals: "{Blended xG per 90}",
    assists: "{Blended xA per 90}",
    recoveries: "{Blended recoveries per 90}",
    saves: "{Blended saves per 90}",
    cardExposure: "1"
  },
  scoreByPosition: {
    GK: "{Appearance probability} + {60 minute probability} + 6 * {Expected goals} + 3 * {Expected assists} + 4 * {Expected clean sheets} + {Expected saves} / 3 - {Expected yellow cards} - 3 * {Expected red cards}",
    DEF: "{Appearance probability} + {60 minute probability} + 6 * {Expected goals} + 3 * {Expected assists} + 4 * {Expected clean sheets} + {Expected recoveries} / 3 - {Expected yellow cards} - 3 * {Expected red cards}",
    MID: "{Appearance probability} + {60 minute probability} + {Full match probability} + 5 * {Expected goals} + 3 * {Expected assists} + {Expected clean sheets} + {Expected recoveries} / 3 - {Expected yellow cards} - 3 * {Expected red cards}",
    FWD: "{Appearance probability} + {60 minute probability} + {Full match probability} + 4 * {Expected goals} + 3 * {Expected assists} + {Expected recoveries} / 3 - {Expected yellow cards} - 3 * {Expected red cards}"
  }
};

function friendRateBlendFormula(metric: "xG" | "xA" | "Recoveries" | "Saves") {
  const annualWeight = "0.4 * {Has data 365}";
  const last10Weight = "0.35 * min({Minutes L10} / 900, 1) * {Has data L10}";
  const last5Weight = "0.25 * min({Minutes L5} / 450, 1) * {Has data L5}";
  return `safe_div(${annualWeight} * {${metric} per 90 365} + ${last10Weight} * {${metric} per 90 L10} + ${last5Weight} * {${metric} per 90 L5}, ${annualWeight} + ${last10Weight} + ${last5Weight}, 0)`;
}

export const projectionFormulaFieldPaths = [
  ["history", "expectedMinutes"],
  ["history", "appearanceProbability"],
  ["history", "sixtyProbability"],
  ["history", "fullMatchProbability"],
  ["history", "xgRate"],
  ["history", "xaRate"],
  ["history", "recoveryRate"],
  ["history", "saveRate"],
  ["history", "yellowRate"],
  ["history", "redRate"],
  ["team", "expectedGoals"],
  ["team", "expectedGoalsAgainst"],
  ["team", "assistsPerGoal"],
  ["team", "cleanSheetProbability"],
  ["allocation", "goals"],
  ["allocation", "assists"],
  ["allocation", "recoveries"],
  ["allocation", "saves"],
  ["allocation", "cardExposure"],
  ["scoreByPosition", "GK"],
  ["scoreByPosition", "DEF"],
  ["scoreByPosition", "MID"],
  ["scoreByPosition", "FWD"]
] as const satisfies ReadonlyArray<readonly [keyof ProjectionFormulaConfig, string]>;

/** Validates every required formula in a resolved, full configuration. */
export function validateProjectionFormulaConfig(value: unknown): ProjectionFormulaConfigIssue[] {
  const issues: ProjectionFormulaConfigIssue[] = [];
  if (!isRecord(value)) return [{ path: "$", message: "must be an object" }];
  if (value.version !== projectionFormulaConfigVersion) {
    issues.push({ path: "version", message: `must equal ${projectionFormulaConfigVersion}` });
  }

  for (const [section, key] of projectionFormulaFieldPaths) {
    const formula = readNested(value, section, key);
    const path = `${section}.${key}`;
    if (typeof formula !== "string" || !formula.trim()) {
      issues.push({ path, message: "must be a non-empty formula" });
      continue;
    }
    if (formula.length > maximumFormulaLength) {
      issues.push({ path, message: `must not exceed ${maximumFormulaLength} characters` });
      continue;
    }
    const validation = validateCustomFormula(formula);
    if (!validation.ok) issues.push({ path, message: validation.message });
  }
  return issues;
}

/**
 * Parses an untrusted full or partial JSON override. Invalid fields fall back
 * independently, while an unsupported version rejects the whole override.
 */
export function parseProjectionFormulaConfig(
  value: unknown,
  fallback: ProjectionFormulaConfig = expectedProjectionFormulaConfig
): ProjectionFormulaConfigParseResult {
  const fallbackIssues = validateProjectionFormulaConfig(fallback);
  if (fallbackIssues.length > 0) {
    throw new Error(`Invalid projection formula fallback: ${formatIssues(fallbackIssues)}`);
  }
  if (!isRecord(value)) {
    return {
      config: cloneConfig(fallback),
      issues: [{ path: "$", message: "must be an object" }],
      usedFallback: true
    };
  }
  if (value.version !== undefined && value.version !== projectionFormulaConfigVersion) {
    return {
      config: cloneConfig(fallback),
      issues: [{ path: "version", message: `unsupported version; expected ${projectionFormulaConfigVersion}` }],
      usedFallback: true
    };
  }

  const config = cloneConfig(fallback);
  const issues: ProjectionFormulaConfigIssue[] = [];
  let usedFallback = false;

  for (const [section, key] of projectionFormulaFieldPaths) {
    const sectionValue = value[section];
    if (sectionValue === undefined) {
      usedFallback = true;
      continue;
    }
    if (!isRecord(sectionValue)) {
      issues.push({ path: String(section), message: "must be an object" });
      usedFallback = true;
      continue;
    }
    const candidate = sectionValue[key];
    if (candidate === undefined) {
      usedFallback = true;
      continue;
    }
    const path = `${section}.${key}`;
    const problem = validateFormulaCandidate(candidate);
    if (problem) {
      issues.push({ path, message: problem });
      usedFallback = true;
      continue;
    }
    writeNested(config, section, key, String(candidate).trim());
  }

  return { config, issues, usedFallback };
}

export function projectionFormulaConfigFromFormData(
  formData: FormData,
  prefix: string,
  fallback: ProjectionFormulaConfig
) {
  const value: Record<string, unknown> = { version: projectionFormulaConfigVersion };
  for (const [section, key] of projectionFormulaFieldPaths) {
    const sectionValue = isRecord(value[section]) ? value[section] as Record<string, unknown> : {};
    sectionValue[key] = String(formData.get(`${prefix}.${section}.${key}`) ?? "").trim();
    value[section] = sectionValue;
  }
  const issues = validateProjectionFormulaConfig(value);
  return { config: issues.length === 0 ? value as ProjectionFormulaConfig : cloneConfig(fallback), issues };
}

function validateFormulaCandidate(value: unknown) {
  if (typeof value !== "string" || !value.trim()) return "must be a non-empty formula";
  if (value.length > maximumFormulaLength) return `must not exceed ${maximumFormulaLength} characters`;
  const validation = validateCustomFormula(value);
  return validation.ok ? null : validation.message;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readNested(value: Record<string, unknown>, section: string, key: string) {
  const nested = value[section];
  return isRecord(nested) ? nested[key] : undefined;
}

function writeNested(config: ProjectionFormulaConfig, section: keyof ProjectionFormulaConfig, key: string, value: string) {
  if (section === "version") return;
  (config[section] as unknown as Record<string, string>)[key] = value;
}

function cloneConfig(config: ProjectionFormulaConfig): ProjectionFormulaConfig {
  return {
    version: projectionFormulaConfigVersion,
    history: { ...config.history },
    team: { ...config.team },
    allocation: { ...config.allocation },
    scoreByPosition: { ...config.scoreByPosition }
  };
}

function formatIssues(issues: ProjectionFormulaConfigIssue[]) {
  return issues.map((issue) => `${issue.path}: ${issue.message}`).join("; ");
}
