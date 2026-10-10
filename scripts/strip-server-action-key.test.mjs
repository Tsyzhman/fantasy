/** @spec spec://common/INFRA-006-continuous-deployment#acceptance */
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { stripServerActionKey } from "./strip-server-action-key.mjs";

const salt = Buffer.alloc(32, 7).toString("base64");
async function fixture(callback) {
  const root = await mkdtemp(join(tmpdir(), "fantasy-actions-"));
  try {
    for (const directory of ["server", "standalone/.next/server"]) {
      await mkdir(join(root, directory), { recursive: true });
      const manifest = { node: { actionId: { workers: { login: "123" } } }, edge: {}, encryptionKey: salt };
      await writeFile(join(root, directory, "server-reference-manifest.json"), JSON.stringify(manifest));
      const edge = { ...manifest, encryptionKey: "process.env.NEXT_SERVER_ACTIONS_ENCRYPTION_KEY" };
      await writeFile(join(root, directory, "server-reference-manifest.js"), "self.__RSC_SERVER_MANIFEST=" + JSON.stringify(JSON.stringify(edge)));
    }
    await mkdir(join(root, "cache"));
    await writeFile(join(root, "cache", ".rscinfo"), salt);
    await callback(root);
  } finally { await rm(root, { recursive: true, force: true }); }
}

test("removes both encryption keys and private cache while retaining action IDs", async () => fixture(async root => {
  const result = await stripServerActionKey(root, salt);
  assert.equal(result.encryptionKeyEmbedded, false);
  assert.equal(result.scannedFiles, 4);
  for (const directory of ["server", "standalone/.next/server"]) {
    const manifest = JSON.parse(await readFile(join(root, directory, "server-reference-manifest.json")));
    assert.equal(manifest.encryptionKey, "");
    assert.deepEqual(manifest.node, { actionId: { workers: { login: "123" } } });
  }
  await assert.rejects(stat(join(root, "cache")), { code: "ENOENT" });
}));
test("rejects an unexpected key without including it in diagnostics", async () => fixture(async root => {
  await assert.rejects(stripServerActionKey(root, Buffer.alloc(32, 9).toString("base64")), error => !error.message.includes(salt));
}));
test("rejects a secret in an unexpected build file, including a stream boundary", async () => fixture(async root => {
  await writeFile(join(root, "leak.bin"), Buffer.concat([Buffer.alloc(65530), Buffer.from(salt), Buffer.alloc(100)]));
  await assert.rejects(stripServerActionKey(root, salt), /remains in build output/);
}));
test("rejects a changed edge runtime contract", async () => fixture(async root => {
  await writeFile(join(root, "server/server-reference-manifest.js"), "self.__RSC_SERVER_MANIFEST=" + JSON.stringify(JSON.stringify({ encryptionKey: salt })));
  await assert.rejects(stripServerActionKey(root, salt), /must use runtime encryption/);
}));
