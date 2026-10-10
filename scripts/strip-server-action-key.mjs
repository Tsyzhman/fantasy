/** @spec spec://common/INFRA-006-continuous-deployment#runtime */
import { createReadStream } from "node:fs";
import { lstat, readFile, readdir, realpath, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// The compiler salt stabilizes action IDs. Encryption is supplied privately at runtime.
export async function stripServerActionKey(buildRoot, compilerSalt) {
  if (!compilerSalt || Buffer.from(compilerSalt, "base64").length !== 32) {
    throw new Error("A valid compiler salt is required");
  }
  const root = await realpath(buildRoot);
  const manifests = ["server", "standalone/.next/server"];
  for (const directory of manifests) {
    const path = join(root, directory, "server-reference-manifest.json");
    if (!(await lstat(path)).isFile() || await realpath(dirname(path)) !== resolve(root, directory)) {
      throw new Error("Unexpected action manifest path");
    }
    const manifest = JSON.parse(await readFile(path, "utf8"));
    if (manifest.encryptionKey !== compilerSalt || !manifest.node || !manifest.edge) {
      throw new Error("Unexpected action manifest contract");
    }
    manifest.encryptionKey = "";
    await writeFile(path, JSON.stringify(manifest));
    // Next's edge manifest already references the runtime environment, not the key.
    const script = await readFile(path.replace(/\.json$/, ".js"), "utf8");
    const prefix = "self.__RSC_SERVER_MANIFEST=";
    if (!script.startsWith(prefix)) throw new Error("Unexpected edge action manifest contract");
    const edgeManifest = JSON.parse(JSON.parse(script.slice(prefix.length)));
    if (edgeManifest.encryptionKey !== "process.env.NEXT_SERVER_ACTIONS_ENCRYPTION_KEY") {
      throw new Error("Edge action manifest must use runtime encryption");
    }
  }
  for (const relative of ["cache", "standalone/.next/cache"]) {
    const path = resolve(root, relative);
    if (path === root || !path.startsWith(root + "/") && !path.startsWith(root + "\\")) {
      throw new Error("Cache path escaped the build root");
    }
    await rm(path, { recursive: true, force: true });
  }
  let scannedFiles = 0;
  const needle = Buffer.from(compilerSalt);
  async function scan(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) await scan(path);
      else if (entry.isFile()) {
        let tail = Buffer.alloc(0);
        for await (const chunk of createReadStream(path, { highWaterMark: 65536 })) {
          const bytes = Buffer.concat([tail, chunk]);
          if (bytes.includes(needle)) throw new Error("Compiler salt remains in build output");
          tail = bytes.subarray(Math.max(0, bytes.length - needle.length + 1));
        }
        scannedFiles++;
      }
    }
  }
  await scan(root);
  return { manifests: manifests.length, scannedFiles, encryptionKeyEmbedded: false };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    console.log(JSON.stringify(await stripServerActionKey(".next", process.env.NEXT_SERVER_ACTIONS_ENCRYPTION_KEY)));
  } catch {
    console.error("Server Action build sanitization failed; no image may be published.");
    process.exitCode = 1;
  }
}
