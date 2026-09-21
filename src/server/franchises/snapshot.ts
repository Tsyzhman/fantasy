/** @spec spec://modules/franchises/FEAT-005-franchise-analytics#data */
import { readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";
import { gunzipSync } from "node:zlib";
import { createHash } from "node:crypto";
import { prisma } from "@/lib/db";
import type { Snapshot } from "@/franchises/analytics";

let cached: { path: string; mtime: number; value: Snapshot } | null = null;
let loading: Promise<Snapshot> | null = null;
export function validateSnapshot(value: Snapshot): Snapshot {
  if (
    value.version !== 1 ||
    (value.xfoCaptainMultiplier !== undefined &&
      value.xfoCaptainMultiplier !== 1 &&
      value.xfoCaptainMultiplier !== 2) ||
    value.season !== "2026/2027" ||
    !Array.isArray(value.squads) ||
    !Array.isArray(value.purchases) ||
    !Array.isArray(value.franchises) ||
    !value.freeze ||
    !Array.isArray(value.freeze.basis) ||
    !Array.isArray(value.freeze.events) ||
    !Array.isArray(value.rounds) ||
    !Array.isArray(value.xfoExamples)
  )
    throw new Error("Unsupported franchise snapshot");
  if (
    value.squads.length > 100000 ||
    value.purchases.length > 500000 ||
    value.rounds.length > 1000
  )
    throw new Error("Franchise snapshot exceeds bounds");
  const keys = new Set<string>();
  for (const row of value.squads) {
    const key = `${row.slug}:${row.round}:${row.team}`;
    if (keys.has(key)) throw new Error("Duplicate squad");
    keys.add(key);
  }
  if (!Number.isFinite(Date.parse(value.generated)))
    throw new Error("Invalid snapshot date");
  return value;
}
export async function loadSnapshot(): Promise<Snapshot> {
  if (!process.env.FRANCHISE_DATA_DIR) {
    const meta = await prisma.franchiseAnalyticsSnapshot.findUnique({
      where: { season: "2026/2027" },
      select: { sha256: true },
    });
    if (!meta) throw new Error("Snapshot has not been collected");
    if (cached?.path === meta.sha256) return cached.value;
    if (loading) return loading;
    loading = (async () => {
      const row = await prisma.franchiseAnalyticsSnapshot.findUniqueOrThrow({
        where: { season: "2026/2027" },
      });
      if (
        row.payload.length > 20 * 1024 * 1024 ||
        createHash("sha256").update(row.payload).digest("hex") !== row.sha256
      )
        throw new Error("Snapshot integrity failed");
      const value = validateSnapshot(
        JSON.parse(
          gunzipSync(row.payload, {
            maxOutputLength: 50 * 1024 * 1024,
          }).toString("utf8"),
        ) as Snapshot,
      );
      cached = { path: row.sha256, mtime: 0, value };
      return value;
    })();
    try {
      return await loading;
    } finally {
      loading = null;
    }
  }
  const path = resolve(
    process.env.FRANCHISE_DATA_DIR ?? "storage/franchises",
    "snapshot.json.gz",
  );
  const info = await stat(path);
  if (cached?.path === path && cached.mtime === info.mtimeMs)
    return cached.value;
  if (loading) return loading;
  loading = (async () => {
    if (info.size > 20 * 1024 * 1024)
      throw new Error("Compressed snapshot exceeds 20 MB");
    const value = validateSnapshot(
      JSON.parse(
        gunzipSync(await readFile(path), {
          maxOutputLength: 50 * 1024 * 1024,
        }).toString("utf8"),
      ) as Snapshot,
    );
    cached = { path, mtime: info.mtimeMs, value };
    return value;
  })();
  try {
    return await loading;
  } finally {
    loading = null;
  }
}
