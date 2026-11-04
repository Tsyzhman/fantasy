/** @spec spec://common/INFRA-006-continuous-deployment#runtime */
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const require = createRequire(import.meta.url);
const excelRequire = createRequire(require.resolve("exceljs/package.json"));
const archiveRequire = createRequire(excelRequire.resolve("archiver/package.json"));
const utilsRequire = createRequire(archiveRequire.resolve("archiver-utils/package.json"));

test("ExcelJS archive glob consumers retain recursive matching and ignore behavior", { timeout: 10000 }, async () => {
  const root = await mkdtemp(join(tmpdir(), "fantasy-excel-glob-"));
  try {
    await mkdir(join(root, "nested"));
    await Promise.all(["one.txt", "nested/two.txt", "nested/skip.txt", "other.csv"].map(name => writeFile(join(root, name), "fixture")));
    const glob = utilsRequire("glob");
    assert.deepEqual(glob.sync("**/*.txt", { cwd: root, ignore: "**/skip.txt", nodir: true }).sort(), ["nested/two.txt", "one.txt"]);
    const readdirGlob = archiveRequire("readdir-glob");
    const matches = await new Promise<string[]>((resolve, reject) => {
      const names: string[] = [];
      readdirGlob(root, { pattern: "**/*.txt", ignore: "**/skip.txt", nodir: true })
        .on("match", (entry: { relative: string }) => names.push(entry.relative.replaceAll("\\", "/")))
        .on("error", reject).on("end", () => resolve(names.sort()));
    });
    assert.deepEqual(matches, ["nested/two.txt", "one.txt"]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
