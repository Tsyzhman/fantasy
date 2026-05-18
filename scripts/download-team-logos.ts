import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

import { leagueSeeds } from "../src/lib/leagues/seed-data";
import { slugify } from "../src/lib/text";

const execFileP = promisify(execFile);

const apiBase = "https://www.thesportsdb.com/api/v1/json/3";
const outDir = "public/team-logos";
const requestDelayMs = 5000;
const rateLimitBackoffMs = 60_000;

type SportsDbTeam = {
  idTeam: string;
  strTeam: string;
  strTeamAlternate?: string | null;
  strSport: string;
  strCountry?: string | null;
  strLeague?: string | null;
  strBadge?: string | null;
};

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function curlJson(url: string): Promise<any> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const { stdout } = await execFileP("curl", ["-fsSL", "--max-time", "30", url], {
        maxBuffer: 50 * 1024 * 1024
      });
      return JSON.parse(stdout);
    } catch (err) {
      const message = (err as Error).message || "";
      if (message.includes("429")) {
        console.log(`    (rate limited; sleeping ${rateLimitBackoffMs / 1000}s)`);
        await sleep(rateLimitBackoffMs);
        continue;
      }
      throw err;
    }
  }
  throw new Error("rate limit exceeded after retries");
}

async function searchTeams(name: string): Promise<SportsDbTeam[]> {
  const url = `${apiBase}/searchteams.php?t=${encodeURIComponent(name)}`;
  const json = (await curlJson(url)) as { teams: SportsDbTeam[] | null };
  return json.teams ?? [];
}

function pickTeam(matches: SportsDbTeam[], country: string, aliases: string[]): SportsDbTeam | null {
  if (matches.length === 0) return null;
  const soccer = matches.filter((m) => m.strSport === "Soccer" && m.strBadge);
  if (soccer.length === 0) return null;

  const byCountry = soccer.filter((m) => m.strCountry?.toLowerCase() === country.toLowerCase());
  if (byCountry.length > 0) return byCountry[0];

  const aliasMatch = soccer.find((m) =>
    aliases.some(
      (alias) =>
        m.strTeam.toLowerCase() === alias.toLowerCase() ||
        m.strTeamAlternate?.toLowerCase().includes(alias.toLowerCase())
    )
  );
  if (aliasMatch) return aliasMatch;

  return soccer[0];
}

async function downloadImage(url: string, dest: string) {
  await execFileP("curl", ["-fsSL", "--max-time", "30", "-o", dest, url]);
}

async function main() {
  const found: string[] = [];
  const missing: string[] = [];
  let networkCalls = 0;

  for (const league of leagueSeeds) {
    if (league.id === "world-cup-2026") continue;
    const dir = path.join(outDir, league.id);
    await mkdir(dir, { recursive: true });
    console.log(`\n=== ${league.name} ===`);

    for (const team of league.teams) {
      const slug = slugify(team.name);
      const dest = path.join(dir, `${slug}.png`);

      if (existsSync(dest)) {
        console.log(`  - ${team.name} (already on disk)`);
        found.push(`${league.id}/${slug}`);
        continue;
      }

      const candidates = [team.name, ...(team.aliases ?? [])];
      let picked: SportsDbTeam | null = null;
      for (const candidate of candidates) {
        try {
          const matches = await searchTeams(candidate);
          networkCalls++;
          picked = pickTeam(matches, league.country, candidates);
          if (picked) break;
        } catch (err) {
          console.log(`  ! ${team.name} search '${candidate}' failed: ${(err as Error).message}`);
        }
        await sleep(requestDelayMs);
      }

      if (!picked || !picked.strBadge) {
        console.log(`  X ${team.name} — no match`);
        missing.push(`${league.id}/${slug} :: ${team.name}`);
        continue;
      }

      try {
        await downloadImage(picked.strBadge, dest);
        networkCalls++;
        console.log(`  + ${team.name}  <-  ${picked.strTeam} (${picked.strCountry ?? "?"})`);
        found.push(`${league.id}/${slug}`);
      } catch (err) {
        console.log(`  ! ${team.name} download failed: ${(err as Error).message}`);
        missing.push(`${league.id}/${slug} :: ${team.name} (download error)`);
      }

      await sleep(requestDelayMs);
    }
  }

  console.log(`\nDone. Found: ${found.length}, Missing: ${missing.length}, Network calls: ${networkCalls}`);
  if (missing.length > 0) {
    console.log("\nMissing (drop a PNG manually into the listed path):");
    for (const item of missing) console.log(`  - ${item}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
