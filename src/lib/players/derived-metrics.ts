import type { Prisma } from "@prisma/client";

type SnapshotMetrics = {
  rawMetrics: Prisma.JsonValue;
  goals: number | null;
  xg: number | null;
  assists: number | null;
  xa: number | null;
  minutesPlayed: number | null;
};

export function snapshotMetric(rawMetrics: Prisma.JsonValue, key: string) {
  if (!rawMetrics || typeof rawMetrics !== "object" || Array.isArray(rawMetrics)) return null;

  const value = rawMetrics[key];
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const numeric = Number(value.replace(/,/g, "").replace(/%$/g, ""));
    return Number.isFinite(numeric) ? numeric : null;
  }

  return null;
}

export function snapshotPer90(snapshot: SnapshotMetrics, totalKey: "goals" | "xg" | "assists" | "xa") {
  const raw = snapshotMetric(snapshot.rawMetrics, `${totalKey}_per_90`);
  if (raw !== null) return raw;

  const minutes = snapshot.minutesPlayed ?? 0;
  const total = snapshot[totalKey] ?? 0;
  if (minutes <= 0) return null;

  return (total / minutes) * 90;
}
