/** @spec spec://modules/khl/INFRA-002-khl-storage-and-api#api */
export type KhlPosition = "G" | "D" | "F";
export type Quality = "FACT" | "ESTIMATE" | "UNKNOWN";
export interface Observation<T> {
  value: T | null;
  quality: Quality;
  source: string | null;
  asOf: string | null;
  reason?: string;
  knownGames?: number;
  totalGames?: number;
}
export const unknown = <T>(reason: string): Observation<T> => ({ value: null, quality: "UNKNOWN", source: null, asOf: null, reason });
export interface KhlFixture {
  id: string; weekId: string; startsAt: string; opponent: string;
  status: "SCHEDULED" | "LIVE" | "FINAL" | "POSTPONED" | "CANCELLED";
  startProbability: Observation<number>;
  expectedPoints?: Observation<number>;
}
export const seasonStatFields = ["toiSeconds", "ppToiSeconds", "pkToiSeconds", "attackZoneSeconds", "goals", "assists", "shotsOnGoal", "blockedShots", "pimMinutes", "saves", "goalsAgainst"] as const;
export type SeasonStatField = typeof seasonStatFields[number];
export interface KhlSeasonStats {
  games: number; asOf: string | null;
  totals: Record<SeasonStatField, { value: number | null; knownGames: number }>;
}
export interface KhlPlayer {
  id: string; contestId: string; playerId: string | null; name: string;
  clubId: string; clubName: string; position: KhlPosition;
  price: Observation<number>; priceRevision: number; priceDelta: number | null;
  providerLock: Observation<boolean>; injury: Observation<string>;
  toiSeconds: Observation<number>; ppToiSeconds: Observation<number>; pkToiSeconds: Observation<number>;
  officialFp: Observation<number>; ep: Observation<number>; ixg: Observation<number>;
  saves: Observation<number>; goalsAgainst: Observation<number>;
  attackZoneSeconds?: Observation<number>; seasonStats?: KhlSeasonStats; forecastHorizonEnd?: string | null;
  fixtures: KhlFixture[];
}
export interface KhlWeek {
  id: string; contestId: string; label: string; providerWeekId: string;
  startsAt: string | null; endsAt: string | null; timezone: string | null;
  verified: boolean; revision: number;
}
export interface KhlEntry { id: string; keepForOptimizer: boolean }
export interface KhlSquad {
  id: string; contestId: string; revision: number; name: string;
  entries: KhlEntry[]; bankUnits: number | null; capitalUnits?: number;
}
export function formatToi(seconds: number | null) {
  if (seconds === null) return "—";
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}
export function parseToi(value: unknown): number | null {
  if (typeof value !== "string" || !/^\d{1,3}:[0-5]\d$/.test(value)) return null;
  const [minutes, seconds] = value.split(":").map(Number);
  return minutes * 60 + seconds;
}
export function compareNullable(a: number | null, b: number | null, direction: 1 | -1) {
  if (a === null) return b === null ? 0 : 1;
  if (b === null) return -1;
  return (a - b) * direction;
}
