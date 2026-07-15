export type DataQualityAuditScope = {
  leagueId: bigint;
  season: string;
};

export type DataQualityAuditScheduleConfig = {
  scopes: DataQualityAuditScope[];
  coveragePercent: number;
  maximumLatencyHours: number;
  maximumRunAgeHours: number;
};

export function readDataQualityAuditScheduleConfig(env: Record<string, string | undefined> = process.env) {
  return {
    scopes: parseDataQualityAuditScopes(env.DATA_QUALITY_AUDIT_SCOPES ?? ""),
    coveragePercent: parsePercent(env.DATA_QUALITY_AUDIT_COVERAGE_PERCENT, 98, "DATA_QUALITY_AUDIT_COVERAGE_PERCENT"),
    maximumLatencyHours: parsePositiveNumber(env.DATA_QUALITY_AUDIT_MAXIMUM_LATENCY_HOURS, 6, "DATA_QUALITY_AUDIT_MAXIMUM_LATENCY_HOURS"),
    maximumRunAgeHours: parsePositiveNumber(env.DATA_QUALITY_AUDIT_MAXIMUM_RUN_AGE_HOURS, 26, "DATA_QUALITY_AUDIT_MAXIMUM_RUN_AGE_HOURS")
  } satisfies DataQualityAuditScheduleConfig;
}

export function parseDataQualityAuditScopes(value: string): DataQualityAuditScope[] {
  const scopes: DataQualityAuditScope[] = [];
  const seen = new Set<string>();

  for (const rawScope of value.split(/[;,]/)) {
    const scope = rawScope.trim();
    if (!scope) continue;
    const separator = scope.indexOf(":");
    if (separator <= 0 || separator === scope.length - 1) {
      throw new Error(`Invalid data-quality scope "${scope}". Expected <leagueId>:<season>.`);
    }

    const leagueText = scope.slice(0, separator).trim();
    const season = scope.slice(separator + 1).trim();
    let leagueId: bigint;
    try {
      leagueId = BigInt(leagueText);
    } catch {
      throw new Error(`Invalid league id "${leagueText}" in data-quality scope "${scope}".`);
    }
    if (leagueId <= 0n) throw new Error(`League id must be positive in data-quality scope "${scope}".`);
    if (!season) throw new Error(`Season must not be empty in data-quality scope "${scope}".`);

    const key = `${leagueId}:${season}`;
    if (seen.has(key)) continue;
    seen.add(key);
    scopes.push({ leagueId, season });
  }

  return scopes;
}

function parsePercent(value: string | undefined, fallback: number, name: string) {
  if (!value?.trim()) return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) throw new Error(`${name} must be between 0 and 100.`);
  return parsed;
}

function parsePositiveNumber(value: string | undefined, fallback: number, name: string) {
  if (!value?.trim()) return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) throw new Error(`${name} must be a positive number.`);
  return parsed;
}
