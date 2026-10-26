/** @spec spec://modules/franchises/FEAT-005-franchise-analytics#data */
import { readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";
import { gunzipSync } from "node:zlib";
import { createHash } from "node:crypto";
import { prisma } from "@/lib/db";
import type { Snapshot } from "@/franchises/analytics";

let cached: { path: string; mtime: number; value: Snapshot } | null = null;
let loading: Promise<Snapshot> | null = null;
export function snapshotRevision() { return cached ? `${cached.path}:${cached.mtime}` : null; }
export const MAX_SNAPSHOT_BYTES = 192 * 1024 * 1024;
export const MAX_COMPRESSED_SNAPSHOT_BYTES = 64 * 1024 * 1024;
export function validateSnapshot(value: Snapshot): Snapshot {
  if (
    ![1, 2].includes(value.version) ||
    (value.version === 2 && value.personalHistory !== true) ||
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
    value.squads.length > 250000 ||
    value.purchases.length > 500000 ||
    value.rounds.length > 1000
  )
    throw new Error("Franchise snapshot exceeds bounds");
  const keys = new Set<string>();
  const franchises = new Set(value.franchises.map((f) => f.id));
  if (franchises.size !== value.franchises.length || franchises.size > 100)
    throw new Error("Invalid franchise identities");
  const rounds = new Set(value.rounds.map((r) => `${r.slug}:${r.round}`));
  if (rounds.size !== value.rounds.length) throw new Error("Duplicate round");
  for (const row of value.squads) {
    const key = `${row.franchise}:${row.slug}:${row.round}:${row.team}`;
    if (keys.has(key)) throw new Error("Duplicate squad");
    if (!franchises.has(row.franchise) || !rounds.has(`${row.slug}:${row.round}`))
      throw new Error("Unknown squad scope");
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
        row.payload.length > MAX_COMPRESSED_SNAPSHOT_BYTES ||
        createHash("sha256").update(row.payload).digest("hex") !== row.sha256
      )
        throw new Error("Snapshot integrity failed");
      const value = validateSnapshot(
        JSON.parse(
          gunzipSync(row.payload, {
            maxOutputLength: MAX_SNAPSHOT_BYTES,
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
    if (info.size > MAX_COMPRESSED_SNAPSHOT_BYTES)
      throw new Error("Compressed snapshot exceeds 64 MB");
    const value = validateSnapshot(
      JSON.parse(
        gunzipSync(await readFile(path), {
          maxOutputLength: MAX_SNAPSHOT_BYTES,
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
