import assert from "node:assert/strict";
import test from "node:test";

import { multipartBodyLimitForFileBytes, readFormDataOrNull, readFormDataWithLimit } from "./request-form-data";

test("readFormDataOrNull returns parsed form data", async () => {
  const formData = new FormData();
  formData.set("seasonId", "season-1");

  const parsed = await readFormDataOrNull(new Request("http://localhost/api/upload", { method: "POST", body: formData }));
  assert.equal(parsed?.get("seasonId"), "season-1");
});

test("readFormDataOrNull returns null for non-form request bodies", async () => {
  const parsed = await readFormDataOrNull(
    new Request("http://localhost/api/upload", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}"
    })
  );

  assert.equal(parsed, null);
});

test("readFormDataWithLimit rejects oversized requests before parsing form data", async () => {
  const result = await readFormDataWithLimit(
    new Request("http://localhost/api/upload", {
      method: "POST",
      headers: {
        "content-length": "2048",
        "content-type": "application/json"
      },
      body: "{}"
    }),
    { maxBodyBytes: 1024 }
  );

  assert.deepEqual(result, {
    ok: false,
    reason: "body-too-large",
    maxBodyBytes: 1024
  });
});

test("multipartBodyLimitForFileBytes allows fixed multipart overhead per file set", () => {
  assert.equal(multipartBodyLimitForFileBytes(1024), 1024 + 1024 * 1024);
  assert.equal(multipartBodyLimitForFileBytes(1024, 3), 3 * 1024 + 1024 * 1024);
});
