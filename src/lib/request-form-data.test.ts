import assert from "node:assert/strict";
import test from "node:test";

import { readFormDataOrNull } from "./request-form-data";

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
