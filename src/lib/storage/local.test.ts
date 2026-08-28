import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import { localUploadRoot, sanitizeFilename } from "./local";
import { withEnv } from "../../test-utils/env";

test("local upload root stays bounded to storage/uploads by default", async () => {
  await withEnv({ LOCAL_UPLOAD_DIR: undefined }, () => {
    assert.equal(localUploadRoot(), path.join(process.cwd(), "storage", "uploads"));
  });
});

test("the documented relative upload root resolves to the same bounded directory", async () => {
  await withEnv({ LOCAL_UPLOAD_DIR: "./storage/uploads" }, () => {
    assert.equal(localUploadRoot(), path.join(process.cwd(), "storage", "uploads"));
  });
});

test("an explicit absolute upload root remains supported", async () => {
  const configuredRoot = path.resolve("runtime-uploads");
  await withEnv({ LOCAL_UPLOAD_DIR: configuredRoot }, () => {
    assert.equal(localUploadRoot(), configuredRoot);
  });
});

test("upload filenames stay sanitized", () => {
  assert.equal(sanitizeFilename("  report / final?.xlsx  "), "report _ final_.xlsx");
});
