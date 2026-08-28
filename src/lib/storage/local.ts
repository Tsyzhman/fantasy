import { createHash } from "crypto";
import { mkdir, writeFile } from "fs/promises";
import path from "path";

export function checksum(buffer: Buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

export function sanitizeFilename(filename: string) {
  return filename.replace(/[^\w.\- ]+/g, "_").replace(/\s+/g, " ").trim();
}

export function localUploadRoot() {
  const configuredRoot = process.env.LOCAL_UPLOAD_DIR?.trim();
  if (!configuredRoot || configuredRoot === "./storage/uploads" || configuredRoot === "storage/uploads") {
    return path.join(/* turbopackIgnore: true */ process.cwd(), "storage", "uploads");
  }
  return path.resolve(configuredRoot);
}

export async function storeUpload(sourceFileId: string, filename: string, buffer: Buffer) {
  const safeName = sanitizeFilename(filename);
  const directory = path.join(localUploadRoot(), sourceFileId);
  await mkdir(directory, { recursive: true });

  const absolutePath = path.join(directory, safeName);
  await writeFile(absolutePath, buffer);

  return {
    absolutePath,
    storagePath: path.relative(process.cwd(), absolutePath).replace(/\\/g, "/")
  };
}
