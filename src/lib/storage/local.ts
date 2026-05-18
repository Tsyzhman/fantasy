import { createHash } from "crypto";
import { mkdir, writeFile } from "fs/promises";
import path from "path";

export function checksum(buffer: Buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

export function sanitizeFilename(filename: string) {
  return filename.replace(/[^\w.\- ]+/g, "_").replace(/\s+/g, " ").trim();
}

export async function storeUpload(sourceFileId: string, filename: string, buffer: Buffer) {
  const root = process.env.LOCAL_UPLOAD_DIR ?? "./storage/uploads";
  const safeName = sanitizeFilename(filename);
  const directory = path.resolve(process.cwd(), root, sourceFileId);
  await mkdir(directory, { recursive: true });

  const absolutePath = path.join(directory, safeName);
  await writeFile(absolutePath, buffer);

  return {
    absolutePath,
    storagePath: path.relative(process.cwd(), absolutePath).replace(/\\/g, "/")
  };
}
