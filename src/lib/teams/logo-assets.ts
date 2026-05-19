import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const logoExtensions = [".png", ".svg", ".jpg", ".jpeg", ".webp"] as const;
let duplicateHashesCache: Set<string> | null = null;

function publicLogoFilePath(logoUrl: string) {
  if (!logoUrl.startsWith("/team-logos/")) return null;

  const relativePath = logoUrl.slice(1);
  const parts = relativePath.split("/");
  if (parts.some((part) => part === ".." || part === "")) return null;

  return path.join(/* turbopackIgnore: true */ process.cwd(), "public", ...parts);
}

function collectLogoFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];

  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) return collectLogoFiles(fullPath);
    if (entry.isFile() && logoExtensions.some((ext) => entry.name.toLowerCase().endsWith(ext))) return [fullPath];
    return [];
  });
}

function fileHash(filePath: string) {
  return createHash("sha256").update(readFileSync(filePath)).digest("hex");
}

function duplicateLogoHashes() {
  if (duplicateHashesCache) return duplicateHashesCache;

  const counts = new Map<string, number>();
  for (const filePath of collectLogoFiles(path.join(/* turbopackIgnore: true */ process.cwd(), "public", "team-logos"))) {
    if (statSync(filePath).size === 0) continue;
    const hash = fileHash(filePath);
    counts.set(hash, (counts.get(hash) ?? 0) + 1);
  }

  duplicateHashesCache = new Set(
    [...counts.entries()].filter(([, count]) => count > 1).map(([hash]) => hash)
  );
  return duplicateHashesCache;
}

export function validTeamLogoUrl(logoUrl: string | null | undefined) {
  if (!logoUrl) return null;

  const filePath = publicLogoFilePath(logoUrl);
  if (!filePath || !existsSync(filePath) || statSync(filePath).size === 0) return null;

  return duplicateLogoHashes().has(fileHash(filePath)) ? null : logoUrl;
}

export function teamLogoUrlForSlug(leagueId: string, slug: string, preferredLogoUrl?: string | null) {
  const preferred = validTeamLogoUrl(preferredLogoUrl);
  if (preferred) return preferred;

  for (const ext of logoExtensions) {
    const logoUrl = `/team-logos/${leagueId}/${slug}${ext}`;
    const validLogoUrl = validTeamLogoUrl(logoUrl);
    if (validLogoUrl) return validLogoUrl;
  }

  return null;
}
