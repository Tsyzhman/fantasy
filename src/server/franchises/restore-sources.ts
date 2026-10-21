/** @spec spec://modules/franchises/FEAT-005-franchise-analytics#data */
import { existsSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { PrismaClient } from "@prisma/client";

type SourceDatabase = Pick<PrismaClient, "franchiseH2hRound" | "franchiseH2hSquad">;

/** Read identities in bounded pages; fetch JSON payloads only for absent files. */
export async function restoreFranchiseSources(db: SourceDatabase, root: string) {
  const season = "2026/2027";
  let storedRounds = 0;
  let restoredSquads = 0;
  let cursor: string | undefined;
  for (;;) {
    const rows: { id: string; slug: string; round: number }[] = await db.franchiseH2hRound.findMany({
      where: { season, ...(cursor ? { id: { gt: cursor } } : {}) },
      orderBy: { id: "asc" },
      take: 100,
      select: { id: true, slug: true, round: true },
    });
    if (!rows.length) break;
    storedRounds += rows.length;
    for (const row of rows) {
      const file = resolve(root, `source/players-${row.slug}-${row.round}.json`);
      if (existsSync(file)) continue;
      const source = await db.franchiseH2hRound.findUniqueOrThrow({
        where: { id: row.id }, select: { payload: true },
      });
      const payload = source.payload as { players: unknown; collected_finished?: boolean };
      await writeFile(file, JSON.stringify(payload.players));
      if (payload.collected_finished) await writeFile(file.replace(/\.json$/, ".complete"), "complete");
    }
    cursor = rows.at(-1)!.id;
  }
  cursor = undefined;
  for (;;) {
    const rows: { id: string; slug: string; team: string; round: number }[] = await db.franchiseH2hSquad.findMany({
      where: { season, ...(cursor ? { id: { gt: cursor } } : {}) },
      orderBy: { id: "asc" },
      take: 100,
      select: { id: true, slug: true, team: true, round: true },
    });
    if (!rows.length) break;
    const missing = rows.filter((row) => !existsSync(resolve(root, `source/squads/${row.slug}-${row.team}-${row.round}.json`)));
    for (let start = 0; start < missing.length; start += 25) {
      const batch = missing.slice(start, start + 25);
      const sources = await db.franchiseH2hSquad.findMany({
        where: { id: { in: batch.map((row) => row.id) } },
        select: { id: true, payload: true },
      });
      if (sources.length !== batch.length) throw new Error("Franchise restore source disappeared");
      for (const source of sources) {
        const row = batch.find((entry) => entry.id === source.id)!;
        await writeFile(resolve(root, `source/squads/${row.slug}-${row.team}-${row.round}.json`), JSON.stringify(source.payload));
        restoredSquads++;
      }
    }
    cursor = rows.at(-1)!.id;
  }
  return { restoredSquads, storedRounds };
}
