/** @spec spec://modules/franchises/FEAT-005-franchise-analytics#data */
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { PrismaClient } from "@prisma/client";
import { restoreFranchiseSources } from "./restore-sources";

test("source recovery preserves existing files and reads only missing payloads in bounded batches", async () => {
  const root = await mkdtemp(join(tmpdir(), "franchise-restore-"));
  await mkdir(join(root, "source/squads"), { recursive: true });
  const payloadReads: string[] = [];
  const rows = Array.from({ length: 121 }, (_, i) => ({ id: String(i).padStart(3, "0"), slug: "epl_2026", team: String(i), round: 1 }));
  const rounds = [{ id: "r1", slug: "epl_2026", round: 1 }, { id: "r2", slug: "epl_2026", round: 2 }];
  const db = {
    franchiseH2hRound: {
      async findMany(args: { where: { id?: { gt: string } }; take: number }) {
        assert.ok(args.take <= 100);
        return rounds.filter((r) => !args.where.id || r.id > args.where.id.gt).slice(0, args.take);
      },
      async findUniqueOrThrow(args: { where: { id: string } }) {
        payloadReads.push(args.where.id);
        return { payload: { players: [{ id: "player" }], collected_finished: true } };
      },
    },
    franchiseH2hSquad: {
      async findMany(args: { where: { id?: { gt?: string; in?: string[] } }; take?: number; select: { payload?: boolean } }) {
        if (args.select.payload) {
          assert.ok(args.where.id?.in && args.where.id.in.length <= 25);
          return args.where.id.in.map((id) => { payloadReads.push(id); return { id, payload: { team: id, players: [] } }; });
        }
        assert.ok(args.take && args.take <= 100);
        return rows.filter((r) => !args.where.id?.gt || r.id > args.where.id.gt).slice(0, args.take);
      },
    },
  } as unknown as PrismaClient;
  try {
    await writeFile(join(root, "source/players-epl_2026-1.json"), "existing round");
    for (const row of rows.filter((_, index) => index >= 32 && index !== 120)) {
      await writeFile(join(root, `source/squads/${row.slug}-${row.team}-${row.round}.json`), "existing squad");
    }
    assert.deepEqual(await restoreFranchiseSources(db, root), { storedRounds: 2, restoredSquads: 33 });
    assert.equal(await readFile(join(root, "source/players-epl_2026-1.json"), "utf8"), "existing round");
    assert.equal(await readFile(join(root, "source/squads/epl_2026-32-1.json"), "utf8"), "existing squad");
    assert.deepEqual(JSON.parse(await readFile(join(root, "source/players-epl_2026-2.json"), "utf8")), [{ id: "player" }]);
    assert.equal(await readFile(join(root, "source/players-epl_2026-2.complete"), "utf8"), "complete");
    assert.equal(payloadReads.length, 34);
    assert.ok(!payloadReads.includes("r1"));
    assert.deepEqual(JSON.parse(await readFile(join(root, "source/squads/epl_2026-120-1.json"), "utf8")), { team: "120", players: [] });
    payloadReads.length = 0;
    assert.deepEqual(await restoreFranchiseSources(db, root), { storedRounds: 2, restoredSquads: 0 });
    assert.deepEqual(payloadReads, [], "a warm restore must not materialize any source JSON");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
