/** @spec spec://modules/khl/INFRA-001-khl-data-ingestion#xg-gate */
export interface XgGateEvidence {
  provider: string; accessVerifiedAt: string | null; permissionReference: string | null;
  metricDefinition: string | null; stableIds: boolean; previousFullSeason: boolean;
  matches: number; teamMatchCoverage: number | null; playerMatchCoverage: number | null;
  clubCoverage: Record<string, number | null>; expectedClubs: string[];
  repeatedImport: boolean; correctionTest: boolean; freshnessWithin24h: number | null;
  observedDays: number; modelVersion: string | null;
}
export function evaluateXgGate(e: XgGateEvidence) {
  const reasons: string[] = [];
  if (!e.accessVerifiedAt || !Number.isFinite(Date.parse(e.accessVerifiedAt)) || !e.permissionReference) reasons.push("ACCESS_AND_RIGHTS_UNVERIFIED");
  if (!e.metricDefinition || !e.stableIds) reasons.push("METRIC_OR_IDS_UNVERIFIED");
  if (!e.previousFullSeason || e.matches < 100) reasons.push("HISTORY_INCOMPLETE");
  const coverage = (n: number | null, threshold: number) => n !== null && Number.isFinite(n) && n >= threshold && n <= 1;
  if (!coverage(e.teamMatchCoverage, .95) || !coverage(e.playerMatchCoverage, .95)) reasons.push("COVERAGE_INSUFFICIENT");
  if (!e.expectedClubs.length || e.expectedClubs.some(id => !coverage(e.clubCoverage[id] ?? null, .9))) reasons.push("CLUB_COVERAGE_INSUFFICIENT");
  if (!e.repeatedImport || !e.correctionTest) reasons.push("REIMPORT_OR_CORRECTION_UNVERIFIED");
  if (e.observedDays < 14 || !coverage(e.freshnessWithin24h, .95)) reasons.push("FRESHNESS_UNVERIFIED");
  return { ready: reasons.length === 0, reasons, modelVersion: e.modelVersion };
}
