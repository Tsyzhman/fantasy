import type { PrismaClient } from "@prisma/client";
import { telegramDeadlineEnabled, telegramPaidBroadcastEnabled, telegramSendEnabled } from "@/server/telegram/config";

/**
 * @spec spec://modules/telegram/INFRA-005-deadline-pipeline#pipeline
 */
export const DEADLINE_SQUAD_IMPORT_HOUR = 8;
export const DEADLINE_REFRESH_HOUR = 8;
export const DEADLINE_REFRESH_MINUTE = 10;
export const DEADLINE_BUILD_HOUR = 8;
export const DEADLINE_BUILD_MINUTE = 50;
export const DEADLINE_DELIVERY_HOUR = 9;
export const DEADLINE_LOOKAHEAD_DAYS = 14;
export const DEADLINE_EXPIRY_MARGIN_MS = 5 * 60 * 1000;
export const DEADLINE_DEFAULT_BATCH = 100;
export const DEADLINE_MAX_BATCH = 500;

export function deadlineReportsEnabled(environment: NodeJS.ProcessEnv = process.env): boolean {
  return telegramDeadlineEnabled(environment);
}

export function deadlineSendEnabled(environment: NodeJS.ProcessEnv = process.env): boolean {
  return telegramDeadlineEnabled(environment) && telegramSendEnabled(environment);
}

export function deadlinePaidEnabled(environment: NodeJS.ProcessEnv = process.env): boolean {
  return deadlineSendEnabled(environment) && telegramPaidBroadcastEnabled(environment);
}

const moscowFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: "Europe/Moscow",
  hour12: false,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit"
});

interface MoscowParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

export function moscowParts(date: Date): MoscowParts {
  const parts = Object.fromEntries(moscowFormatter.formatToParts(date).filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour) % 24,
    minute: Number(parts.minute),
    second: Number(parts.second)
  };
}

function moscowOffsetMs(date: Date): number {
  const parts = moscowParts(date);
  const asUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  return asUtc - Math.floor(date.getTime() / 1000) * 1000;
}

export function moscowDateTimeToUtc(input: { year: number; month: number; day: number; hour: number; minute: number }): Date {
  const guess = new Date(Date.UTC(input.year, input.month - 1, input.day, input.hour, input.minute));
  const offset = moscowOffsetMs(guess);
  return new Date(guess.getTime() - offset);
}

export function moscowDateKey(date: Date): string {
  const parts = moscowParts(date);
  return `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}

export function moscowMinutesOfDay(date: Date): number {
  const parts = moscowParts(date);
  return parts.hour * 60 + parts.minute;
}

export function moscowTimeLabel(date: Date): string {
  const parts = moscowParts(date);
  return `${String(parts.hour).padStart(2, "0")}:${String(parts.minute).padStart(2, "0")}`;
}

export function moscowShortDate(date: Date): string {
  const parts = moscowParts(date);
  return `${String(parts.day).padStart(2, "0")}.${String(parts.month).padStart(2, "0")}`;
}

export function campaignDateKeyToUtcMidday(dateKey: string): Date {
  const [year, month, day] = dateKey.split("-").map(Number);
  return moscowDateTimeToUtc({ year: year ?? 2000, month: month ?? 1, day: day ?? 1, hour: 12, minute: 0 });
}

export async function contestsWithEnabledSubscriptions(prisma: PrismaClient): Promise<string[]> {
  const rows = await prisma.telegramSubscription.findMany({
    where: { enabled: true, link: { state: { in: ["ACTIVE", "PAUSED"] } } },
    select: { contestId: true },
    distinct: ["contestId"]
  });
  return rows.map((row) => row.contestId);
}
