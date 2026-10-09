/**
 * @spec spec://modules/telegram/FEAT-007-deadline-assistant#signals
 */
export type DeadlineFindingCode =
  | "BLANK"
  | "OUT_OF_XI"
  | "ALT_ZERO"
  | "UNKNOWN_DATA"
  | "PARTIAL_XI_COVERAGE";

export interface DeadlineFindingReason {
  code: DeadlineFindingCode;
  text: string;
}

export interface DeadlinePlayerSignalInput {
  playerId: string;
  name: string;
  teamId: string | null;
  teamName: string | null;
  isStarter: boolean;
  isCaptain: boolean;
  isViceCaptain: boolean;
  alt: number | null;
  altIsRoundedZero: boolean;
  fixtureCount: number | null;
  predictedXi: {
    available: boolean;
    inXi: boolean;
    coveredFixtures: number;
    stale: boolean;
    source: string | null;
  };
  mappingComplete: boolean;
}

export interface DeadlinePlayerFinding {
  playerId: string;
  name: string;
  teamName: string | null;
  bench: boolean;
  captain: boolean;
  viceCaptain: boolean;
  reasons: DeadlineFindingReason[];
}

export interface DeadlineClassificationResult {
  findings: DeadlinePlayerFinding[];
  degraded: string[];
}

const BLANK_TEXT = "Бланк: у команды нет матча в этом туре";
const OUT_OF_XI_TEXT = "Вне предполагаемой основы по SorareInside";
const ALT_ZERO_TEXT = "ALT 0 — проверьте игрока";
const UNKNOWN_TEXT = "Нет надёжных данных";
const PARTIAL_XI_TEXT = "Прогноз основы покрывает не все матчи тура";

function unknownReason(cause: string): DeadlineFindingReason {
  return { code: "UNKNOWN_DATA", text: `${UNKNOWN_TEXT}: ${cause}` };
}

function unknownCause(input: DeadlinePlayerSignalInput, scheduleKnown: boolean): string | null {
  if (!input.mappingComplete) return "неполный маппинг игрока";
  if (!scheduleKnown || input.fixtureCount == null) return "календарь тура неполон";
  if (input.fixtureCount > 0 && !input.predictedXi.available) return "прогноз основы недоступен";
  if (input.predictedXi.stale) return "прогноз основы устарел";
  if (input.alt == null) return "ALT недоступен";
  return null;
}

/**
 * @spec spec://modules/telegram/FEAT-007-deadline-assistant#signals
 * @spec spec://modules/telegram/FEAT-007-deadline-assistant#acceptance
 */
export function classifyDeadlinePlayers(input: {
  players: DeadlinePlayerSignalInput[];
  scheduleKnown: boolean;
  scheduleComplete: boolean;
}): DeadlineClassificationResult {
  const findings: DeadlinePlayerFinding[] = [];
  const degraded = new Set<string>();
  for (const player of input.players) {
    const reasons: DeadlineFindingReason[] = [];
    if (input.scheduleComplete && player.fixtureCount === 0) {
      reasons.push({ code: "BLANK", text: BLANK_TEXT });
    }
    if (player.predictedXi.available && !player.predictedXi.stale && !player.predictedXi.inXi && player.fixtureCount != null && player.fixtureCount > 0) {
      const coversRound = player.predictedXi.coveredFixtures >= player.fixtureCount;
      if (coversRound) {
        reasons.push({ code: "OUT_OF_XI", text: OUT_OF_XI_TEXT });
      } else {
        reasons.push({ code: "PARTIAL_XI_COVERAGE", text: PARTIAL_XI_TEXT });
        degraded.add(`${player.name}: ${PARTIAL_XI_TEXT}`);
      }
    }
    if (player.alt != null && player.alt === 0 && !player.altIsRoundedZero) {
      reasons.push({ code: "ALT_ZERO", text: ALT_ZERO_TEXT });
    }
    const cause = unknownCause(player, input.scheduleKnown);
    if (cause) {
      reasons.push(unknownReason(cause));
      degraded.add(`${player.name}: ${cause}`);
    }
    if (reasons.length === 0) continue;
    const deduped = reasons.filter((reason, index) => reasons.findIndex((candidate) => candidate.code === reason.code) === index);
    findings.push({
      playerId: player.playerId,
      name: player.name,
      teamName: player.teamName,
      bench: !player.isStarter,
      captain: player.isCaptain,
      viceCaptain: player.isViceCaptain,
      reasons: deduped
    });
  }
  return { findings, degraded: [...degraded] };
}

export function splitFindingsByLineup(findings: DeadlinePlayerFinding[]): { starters: DeadlinePlayerFinding[]; bench: DeadlinePlayerFinding[] } {
  return {
    starters: findings.filter((finding) => !finding.bench),
    bench: findings.filter((finding) => finding.bench)
  };
}

export function findingMarker(finding: DeadlinePlayerFinding): string {
  if (finding.reasons.some((reason) => reason.code === "BLANK")) return "⛔";
  if (finding.reasons.some((reason) => reason.code === "UNKNOWN_DATA" || reason.code === "PARTIAL_XI_COVERAGE")) return "?";
  return "⚠";
}

export function findingRoleSuffix(finding: DeadlinePlayerFinding): string {
  if (finding.captain) return " (К)";
  if (finding.viceCaptain) return " (В)";
  return "";
}
