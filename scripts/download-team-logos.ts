import { existsSync } from "node:fs";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

import { leagueSeeds, type LeagueSeed, type TeamSeed } from "../src/lib/leagues/seed-data";
import { teamLogoUrlForSlug } from "../src/lib/teams/logo-assets";
import { normalizeName, slugify } from "../src/lib/text";

const outDir = "public/team-logos";
const userAgent = "fantasy-export-logo-bot/1.0 (local development asset fetch)";
const logoExtensions = [".png", ".svg", ".jpg", ".jpeg", ".webp"] as const;
const requestDelayMs = 1500;

type PageMatch = {
  pageTitle: string;
  imageUrl: string;
};

type DownloadResult = PageMatch & {
  publicUrl: string;
};

const args = new Set(process.argv.slice(2));
const force = args.has("--force");
const includeNationalTeams = args.has("--include-national");
const leagueFilter = process.argv.find((arg) => arg.startsWith("--league="))?.split("=")[1];
const teamFilter = process.argv.find((arg) => arg.startsWith("--team="))?.split("=")[1];
const limit = Number(process.argv.find((arg) => arg.startsWith("--limit="))?.split("=")[1] ?? 0);

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function htmlDecode(value: string) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&#95;/g, "_")
    .replace(/&#160;/g, " ")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'");
}

function wikipediaArticleUrl(title: string) {
  return `https://en.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, "_"))}`;
}

function wikipediaSearchUrl(query: string) {
  const url = new URL("https://en.wikipedia.org/w/index.php");
  url.searchParams.set("search", query);
  url.searchParams.set("title", "Special:Search");
  url.searchParams.set("ns0", "1");
  return url.toString();
}

async function fetchText(url: string) {
  const response = await fetchWithBackoff(url, {
    "User-Agent": userAgent,
    Accept: "text/html,application/xhtml+xml"
  });

  if (!response.ok) return null;
  return {
    url: response.url,
    text: await response.text()
  };
}

async function fetchWithBackoff(url: string, headers: HeadersInit) {
  let response: Response | null = null;

  for (let attempt = 1; attempt <= 4; attempt++) {
    response = await fetch(url, { headers });
    if (response.status !== 429) return response;

    const waitMs = attempt * 30_000;
    console.log(`    (rate limited; sleeping ${waitMs / 1000}s)`);
    await sleep(waitMs);
  }

  return response as Response;
}

function candidateNames(team: TeamSeed) {
  const names = [team.name, ...(team.aliases ?? [])];
  const exactNames = [...new Set(names)]
    .filter(Boolean)
    .sort((a, b) => normalizeName(b).length - normalizeName(a).length);

  const variants = exactNames.flatMap((name) => {
    const dotted = name
      .replace(/\bAFC\b/g, "A.F.C.")
      .replace(/\bFC\b/g, "F.C.")
      .replace(/\bSC\b/g, "S.C.")
      .replace(/\bSK\b/g, "S.K.");

    return [
      dotted,
      `${name} FC`,
      `${name} F.C.`,
      `${name} football club`
    ];
  });

  return [...new Set([...exactNames, ...variants])]
    .filter(Boolean)
}

function isBadPageTitle(title: string) {
  return /\b(women|academy|under-?21|under-?23|youth|reserves?|season|fixtures?|statistics|stadium|supporters)\b/i.test(title);
}

function hasBadShortDescription(html: string) {
  const shortDescription = html
    .match(/<div class="shortdescription[^"]*"[^>]*>([\s\S]*?)<\/div>/i)?.[1]
    ?.replace(/<[^>]*>/g, "");

  return /\b(city|town|district|municipality|province|commune|settlement|satellite)\b/i.test(shortDescription ?? "");
}

function extractCanonicalTitle(html: string, fallbackUrl: string) {
  const heading = html.match(/<h1[^>]*id="firstHeading"[^>]*>([\s\S]*?)<\/h1>/i)?.[1]?.replace(/<[^>]*>/g, "");
  if (heading) return htmlDecode(heading).trim();

  const title = html.match(/<title>([\s\S]*?)<\/title>/i)?.[1]?.replace(/\s+-\s+Wikipedia$/, "");
  if (title) return htmlDecode(title).trim();

  return decodeURIComponent(fallbackUrl.split("/wiki/")[1] ?? fallbackUrl).replace(/_/g, " ");
}

function bestImageFromTag(imgTag: string) {
  const srcset = imgTag.match(/\ssrcset="([^"]+)"/i)?.[1];
  if (srcset) {
    const options = htmlDecode(srcset)
      .split(",")
      .map((item) => item.trim().split(/\s+/)[0])
      .filter(Boolean);
    const best = options[options.length - 1];
    if (best) return best;
  }

  return htmlDecode(imgTag.match(/\ssrc="([^"]+)"/i)?.[1] ?? "");
}

function normalizeImageUrl(url: string) {
  if (!url) return null;
  if (url.startsWith("//")) return `https:${url}`;
  if (url.startsWith("/")) return `https://en.wikipedia.org${url}`;
  return url;
}

function extractInfoboxImage(html: string) {
  const infoboxStart = html.search(/<table[^>]+class="[^"]*\binfobox\b/i);
  if (infoboxStart < 0) return null;

  const infobox = html.slice(infoboxStart, infoboxStart + 120_000);
  const imageCell =
    infobox.match(/<td[^>]+class="[^"]*\binfobox-image\b[\s\S]*?<\/td>/i)?.[0] ??
    infobox.match(/<tr[^>]*>[\s\S]*?<img[\s\S]*?<\/tr>/i)?.[0];

  const imgTag = imageCell?.match(/<img[^>]+>/i)?.[0];
  if (!imgTag) return null;

  const imageUrl = normalizeImageUrl(bestImageFromTag(imgTag));
  if (!imageUrl || /semi-protection|edit-icon|symbol/i.test(imageUrl)) return null;

  return imageUrl;
}

async function tryArticlePage(title: string): Promise<PageMatch | null> {
  const response = await fetchText(wikipediaArticleUrl(title));
  if (!response) return null;

  const pageTitle = extractCanonicalTitle(response.text, response.url);
  if (isBadPageTitle(pageTitle) || /Wikipedia does not have an article/i.test(response.text)) return null;
  if (hasBadShortDescription(response.text)) return null;

  const imageUrl = extractInfoboxImage(response.text);
  if (!imageUrl) return null;

  return { pageTitle, imageUrl };
}

function searchResultTitles(html: string) {
  const titles: string[] = [];
  const seen = new Set<string>();
  const matches = html.matchAll(/<a[^>]+href="\/wiki\/([^"#?:]+)"[^>]+title="([^"]+)"/g);

  for (const match of matches) {
    const title = htmlDecode(match[2]).trim();
    const hrefTitle = decodeURIComponent(match[1]).replace(/_/g, " ");
    const candidate = title || hrefTitle;

    if (!candidate || seen.has(candidate) || isBadPageTitle(candidate)) continue;
    seen.add(candidate);
    titles.push(candidate);
    if (titles.length >= 6) break;
  }

  return titles;
}

async function searchArticlePage(team: TeamSeed, league: LeagueSeed) {
  const query = `${team.name} ${team.aliases?.[0] ?? ""} football club ${league.country}`;
  const response = await fetchText(wikipediaSearchUrl(query));
  if (!response) return null;

  if (response.url.includes("/wiki/") && !response.url.includes("Special:Search")) {
    const imageUrl = extractInfoboxImage(response.text);
    if (imageUrl) return { pageTitle: extractCanonicalTitle(response.text, response.url), imageUrl };
  }

  for (const title of searchResultTitles(response.text)) {
    const match = await tryArticlePage(title);
    if (match) return match;
    await sleep(150);
  }

  return null;
}

function extensionForDownload(url: string, contentType: string | null, buffer: Buffer) {
  const lowerUrl = url.toLowerCase();
  const mime = (contentType ?? "").toLowerCase();

  if (buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return ".png";
  if (buffer.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))) return ".jpg";
  if (buffer.subarray(0, 4).toString("ascii") === "RIFF" && buffer.subarray(8, 12).toString("ascii") === "WEBP") return ".webp";
  if (buffer.subarray(0, 5).toString("utf8").toLowerCase().includes("<svg")) return ".svg";

  if (lowerUrl.endsWith(".png") || lowerUrl.includes(".svg.png")) return ".png";
  if (lowerUrl.endsWith(".jpg") || lowerUrl.endsWith(".jpeg")) return ".jpg";
  if (lowerUrl.endsWith(".webp")) return ".webp";
  if (lowerUrl.endsWith(".svg")) return ".svg";
  if (mime.includes("png")) return ".png";
  if (mime.includes("jpeg") || mime.includes("jpg")) return ".jpg";
  if (mime.includes("webp")) return ".webp";
  if (mime.includes("svg")) return ".svg";

  return ".png";
}

async function removeExistingLogoFiles(leagueId: string, slug: string) {
  await Promise.all(
    logoExtensions.map(async (ext) => {
      const filePath = path.join(outDir, leagueId, `${slug}${ext}`);
      if (existsSync(filePath)) await unlink(filePath);
    })
  );
}

async function downloadFile(url: string, leagueId: string, slug: string) {
  const response = await fetchWithBackoff(url, {
    "User-Agent": userAgent,
    Accept: "image/png,image/jpeg,image/svg+xml,image/*;q=0.8,*/*;q=0.5"
  });

  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);

  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length < 1000) throw new Error(`image too small (${buffer.length} bytes)`);

  const ext = extensionForDownload(url, response.headers.get("content-type"), buffer);
  const dir = path.join(outDir, leagueId);
  await mkdir(dir, { recursive: true });
  await removeExistingLogoFiles(leagueId, slug);

  const filePath = path.join(dir, `${slug}${ext}`);
  await writeFile(filePath, buffer);

  return `/team-logos/${leagueId}/${slug}${ext}`;
}

async function findTeamPage(team: TeamSeed, league: LeagueSeed) {
  for (const title of candidateNames(team)) {
    const match = await tryArticlePage(title);
    if (match) return match;
    await sleep(150);
  }

  return searchArticlePage(team, league);
}

async function downloadTeamLogo(team: TeamSeed, league: LeagueSeed): Promise<DownloadResult | null> {
  const slug = slugify(team.name);
  if (!force && teamLogoUrlForSlug(league.id, slug)) {
    return null;
  }

  const match = await findTeamPage(team, league);
  if (!match) throw new Error("no Wikipedia page with infobox image");

  const publicUrl = await downloadFile(match.imageUrl, league.id, slug);
  return { ...match, publicUrl };
}

async function main() {
  const successes: string[] = [];
  const skipped: string[] = [];
  const missing: string[] = [];
  let processed = 0;

  const leagues = leagueSeeds.filter((league) => !leagueFilter || league.id === leagueFilter);

  for (const league of leagues) {
    if (league.id === "world-cup-2026" && !includeNationalTeams) {
      console.log(`\n=== ${league.name} (skipped; flags are shown for national teams) ===`);
      continue;
    }

    console.log(`\n=== ${league.name} ===`);

    for (const team of league.teams) {
      if (teamFilter && slugify(team.name) !== teamFilter) continue;
      if (limit && processed >= limit) break;
      processed++;

      try {
        const result = await downloadTeamLogo(team, league);
        if (!result) {
          console.log(`  - ${team.name} (already valid)`);
          skipped.push(`${league.id}/${slugify(team.name)}`);
          continue;
        }

        console.log(`  + ${team.name} <- ${result.pageTitle}`);
        successes.push(`${league.id}/${slugify(team.name)}`);
      } catch (err) {
        const message = (err as Error).message;
        console.log(`  X ${team.name} -- ${message}`);
        missing.push(`${league.id}/${slugify(team.name)} :: ${team.name} (${message})`);
      }

      await sleep(requestDelayMs);
    }
  }

  console.log(`\nDone. Downloaded: ${successes.length}, Skipped: ${skipped.length}, Missing: ${missing.length}`);
  if (missing.length > 0) {
    console.log("\nMissing:");
    for (const item of missing) console.log(`  - ${item}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
