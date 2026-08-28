import { constants } from "node:fs";
import { access, mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

import { localUploadRoot } from "@/lib/storage/local";

const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const maximumPhotoBytes = 2 * 1024 * 1024;

export function isFotMobPlayerId(value: string) {
  return /^\d{1,20}$/.test(value);
}

export function fotMobPlayerPhotoSourceUrl(playerId: string) {
  if (!isFotMobPlayerId(playerId)) throw new Error("Invalid FotMob player ID.");
  return `https://images.fotmob.com/image_resources/playerimages/${playerId}.png`;
}

export function playerPhotoPublicUrl(playerId: string) {
  return isFotMobPlayerId(playerId) ? `/api/machete/player-photos/${playerId}` : null;
}

export function playerPhotoCacheDirectory() {
  return path.join(localUploadRoot(), "fotmob-player-photos");
}

export function playerPhotoCachePath(playerId: string) {
  if (!isFotMobPlayerId(playerId)) throw new Error("Invalid FotMob player ID.");
  return path.join(playerPhotoCacheDirectory(), `${playerId}.png`);
}

export function isPngPhoto(buffer: Buffer) {
  return buffer.length >= pngSignature.length && buffer.subarray(0, pngSignature.length).equals(pngSignature);
}

export async function cachedPlayerPhotoExists(playerId: string) {
  try {
    await access(playerPhotoCachePath(playerId), constants.R_OK);
    return true;
  } catch {
    return false;
  }
}

export async function readCachedPlayerPhoto(playerId: string) {
  const buffer = await readFile(playerPhotoCachePath(playerId));
  if (!isPngPhoto(buffer)) throw new Error("Cached player photo is not a PNG.");
  return buffer;
}

export async function cacheFotMobPlayerPhoto(playerId: string, sourceUrl = fotMobPlayerPhotoSourceUrl(playerId)) {
  const response = await fetch(sourceUrl, {
    headers: {
      Accept: "image/png,image/*;q=0.8",
      "User-Agent": "fantasy-scout-player-photo-cache/1.0"
    },
    signal: AbortSignal.timeout(15_000)
  });
  if (!response.ok) throw new Error(`FotMob photo ${playerId}: ${response.status} ${response.statusText}`);

  const contentLength = Number(response.headers.get("content-length") ?? 0);
  if (contentLength > maximumPhotoBytes) throw new Error(`FotMob photo ${playerId} is too large.`);
  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length > maximumPhotoBytes || !isPngPhoto(buffer)) {
    throw new Error(`FotMob photo ${playerId} is not a valid PNG.`);
  }

  const directory = playerPhotoCacheDirectory();
  const destination = playerPhotoCachePath(playerId);
  const temporary = `${destination}.${process.pid}.${crypto.randomUUID()}.tmp`;
  await mkdir(directory, { recursive: true });
  try {
    await writeFile(temporary, buffer, { flag: "wx" });
    await rename(temporary, destination);
  } finally {
    await unlink(temporary).catch(() => undefined);
  }
  return buffer;
}
