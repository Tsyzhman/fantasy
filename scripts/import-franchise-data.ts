/** @spec spec://modules/franchises/FEAT-005-franchise-analytics#data */
import {
  readFile,
  readdir,
  mkdir,
  writeFile,
  open,
  unlink,
} from "node:fs/promises";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";
import { spawnSync } from "node:child_process";
import { PrismaClient, type Prisma } from "@prisma/client";
import { validateSnapshot, MAX_SNAPSHOT_BYTES, MAX_COMPRESSED_SNAPSHOT_BYTES } from "../src/server/franchises/snapshot";

async function main() {
  for (const file of [".env.local", ".env"])
    if (existsSync(file)) process.loadEnvFile(file);
  const root = resolve(process.env.FRANCHISE_DATA_DIR ?? "storage/franchises");
  const db = new PrismaClient();
  await mkdir(resolve(root, "source/squads"), { recursive: true });
  const lock = resolve(root, ".sync.lock");
  const handle = await open(lock, "wx").catch(() => {
    throw new Error(
      "Franchise sync is already locked. Verify the previous process before removing .sync.lock.",
    );
  });
  await handle.writeFile(String(process.pid));
  await handle.close();
  const json = async (name: string) =>
    JSON.parse(await readFile(resolve(root, name), "utf8"));
  try {
    if (process.argv.includes("--restore") || process.argv.includes("--sync")) {
      // Resume completed H2H rounds from our database after replacing a container or cache.
      const rounds = await db.franchiseH2hRound.findMany({
        where: { season: "2026/2027" },
      });
      for (const r of rounds) {
        const value = r.payload as {
          players: unknown;
          collected_finished?: boolean;
        };
        const file = resolve(root, `source/players-${r.slug}-${r.round}.json`);
        if (!existsSync(file)) {
          await writeFile(file, JSON.stringify(value.players));
          if (value.collected_finished)
            await writeFile(file.replace(/\.json$/, ".complete"), "complete");
        }
      }
      let cursor: string | undefined;
      let restored = 0;
      for (;;) {
        const rows = await db.franchiseH2hSquad.findMany({
          where: { season: "2026/2027" },
          orderBy: { id: "asc" },
          take: 100,
          ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        });
        if (!rows.length) break;
        for (const r of rows) {
          const file = resolve(
            root,
            `source/squads/${r.slug}-${r.team}-${r.round}.json`,
          );
          if (!existsSync(file)) {
            await writeFile(file, JSON.stringify(r.payload));
            restored++;
          }
        }
        cursor = rows.at(-1)!.id;
      }
      console.log(
        JSON.stringify({
          restoredSquads: restored,
          storedRounds: rounds.length,
        }),
      );
      if (!process.argv.includes("--sync")) return;
      const python =
        process.env.FRANCHISE_PYTHON ??
        (process.platform === "win32"
          ? "python"
          : "/opt/franchises/bin/python");
      const result = spawnSync(
        python,
        [resolve("scripts/franchise-analytics/sync.py")],
        {
          stdio: "inherit",
          env: { ...process.env, FRANCHISE_DATA_DIR: root },
          timeout: 1000 * 60 * 90,
        },
      );
      if (result.error || result.status !== 0)
        throw new Error(
          "Franchise collector did not finish; the previous published snapshot remains available.",
        );
    }
    const payload = await readFile(resolve(root, "snapshot.json.gz"));
    if (payload.length > MAX_COMPRESSED_SNAPSHOT_BYTES)
      throw new Error("Compressed snapshot exceeds bounds");
    const snapshot = validateSnapshot(
      JSON.parse(
        gunzipSync(payload, { maxOutputLength: MAX_SNAPSHOT_BYTES }).toString(
          "utf8",
        ),
      ),
    );
    const season = snapshot.season;
    const fetchedAt = new Date(snapshot.acquisition.to);
    const leagues = (await json("leagues.json")) as {
      slug: string;
      rounds: { round: number }[];
    }[];
    for (const league of leagues)
      for (const round of league.rounds) {
        const id = `${season}:${league.slug}:${round.round}`;
        const data = {
          season,
          slug: league.slug,
          round: round.round,
          fetchedAt,
          payload: {
            ...round,
            collected_finished: existsSync(
              resolve(
                root,
                `source/players-${league.slug}-${round.round}.complete`,
              ),
            ),
            players: await json(
              `source/players-${league.slug}-${round.round}.json`,
            ),
          } as Prisma.InputJsonValue,
        };
        await db.franchiseH2hRound.upsert({
          where: { id },
          create: { id, ...data },
          update: data,
        });
      }
    const files = existsSync(resolve(root, "squad-index.json")) ? await json("squad-index.json") as string[] : (await readdir(resolve(root, "source/squads"))).filter((f) =>
      f.endsWith(".json"),
    );
    if (files.some((f) => !/^[a-z0-9_-]+\.json$/.test(f)))
      throw new Error("Invalid source file name");
    for (let start = 0; start < files.length; start += 50) {
      const rows = await Promise.all(
        files.slice(start, start + 50).map((f) => json("source/squads/" + f)),
      );
      await db.$transaction(
        rows.map((r) => {
          const id = `${season}:${r.slug}:${r.round}:${r.team}`;
          const data = {
            season,
            slug: String(r.slug),
            round: Number(r.round),
            team: String(r.team),
            franchise: Number(r.franchise),
            manager: String(r.manager),
            fetchedAt,
            payload: r as Prisma.InputJsonValue,
          };
          return db.franchiseH2hSquad.upsert({
            where: { id },
            create: { id, ...data },
            update: data,
          });
        }),
      );
    }
    const franchises = (await json("franchises.json")) as {
      id: number;
      name: string;
    }[];
    for (const f of franchises) {
      const id = `${season}:${f.id}`;
      const data = {
        season,
        franchise: f.id,
        fetchedAt,
        payload: {
          ...f,
          events: snapshot.freeze.events.filter((r) => r.franchise === f.id),
          basis: snapshot.freeze.basis.filter((r) => r.franchise === f.id),
        } as Prisma.InputJsonValue,
      };
      await db.franchiseH2hState.upsert({
        where: { id },
        create: { id, ...data },
        update: data,
      });
    }
    // Publish only after every source row has been persisted. Readers retain the previous ready snapshot on failure.
    const data = {
      version: snapshot.version,
      payload,
      sha256: createHash("sha256").update(payload).digest("hex"),
      generatedAt: new Date(snapshot.generated),
      squads: snapshot.squads.length,
    };
    await db.franchiseAnalyticsSnapshot.upsert({
      where: { season },
      create: { season, ...data },
      update: data,
    });
    console.log(
      JSON.stringify({
        season,
        franchises: franchises.length,
        squads: snapshot.squads.length,
        compressedBytes: payload.length,
      }),
    );
  } finally {
    await db.$disconnect();
    await unlink(lock);
  }
}
main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
