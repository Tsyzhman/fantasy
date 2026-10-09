import type { DeadlinePlayerSignalInput } from "./classifier";

/** @spec spec://modules/telegram/FEAT-007-deadline-assistant#signals */
export interface DeadlineXiFixture {
  homeTeamId: string | null;
  awayTeamId: string | null;
  kickoffAt: Date | null;
}

const XI_STALE_MS = 2 * 60 * 60 * 1000;
const FIXTURE_MATCH_TOLERANCE_MS = 6 * 60 * 60 * 1000;

/**
 * @spec spec://modules/telegram/FEAT-007-deadline-assistant#signals
 * @spec spec://modules/telegram/INFRA-005-deadline-pipeline#freshness
 */
export function deadlineXiSignal(input: {
  metadata: unknown;
  teamId: string | null;
  fixtures: DeadlineXiFixture[];
  now: Date;
  inXi: boolean;
}): DeadlinePlayerSignalInput["predictedXi"] {
  const absent = { available: false, inXi: input.inXi, coveredFixtures: 0, stale: false, source: null };
  const metadata = input.metadata && typeof input.metadata === "object" ? input.metadata as { probableLineup?: unknown } : null;
  const lineup = metadata?.probableLineup;
  if (!lineup || typeof lineup !== "object" || !input.teamId) return absent;
  const record = lineup as { source?: unknown; sourceKickoff?: unknown; appliedAt?: unknown; fetchedAt?: unknown };
  if (record.source !== "SORAREINSIDE") return absent;
  const kickoff = typeof record.sourceKickoff === "string" ? Date.parse(record.sourceKickoff) : Number.NaN;
  if (!Number.isFinite(kickoff) || kickoff <= input.now.getTime()) return absent;
  const candidates = input.fixtures.filter((fixture) =>
    (fixture.homeTeamId === input.teamId || fixture.awayTeamId === input.teamId) &&
    fixture.kickoffAt && fixture.kickoffAt.getTime() > input.now.getTime() &&
    Math.abs(fixture.kickoffAt.getTime() - kickoff) <= FIXTURE_MATCH_TOLERANCE_MS
  );
  // One forecast belongs to one fixture. An ambiguous match cannot cover a double round.
  if (candidates.length !== 1) return absent;
  const applied = typeof record.appliedAt === "string" ? Date.parse(record.appliedAt) : Number.NaN;
  const fetched = typeof record.fetchedAt === "string" ? Date.parse(record.fetchedAt) : Number.NaN;
  const observedAt = Number.isFinite(applied) ? applied : Number.isFinite(fetched) ? fetched : null;
  return {
    available: true, inXi: input.inXi, coveredFixtures: 1, source: "SORAREINSIDE",
    stale: observedAt == null || input.now.getTime() - observedAt > XI_STALE_MS
  };
}
