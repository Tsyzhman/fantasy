import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("./auto-submit-form.tsx", import.meta.url), "utf8");

test("auto-submit cancels a delayed filter navigation before explicit actions", () => {
  assert.match(source, /document\.addEventListener\("click", cancelBeforeAnotherAction, true\)/);
  assert.match(source, /target\.closest\("a\[href\], button, \[role='button'\]"\)/);
  assert.match(source, /if \(!action \|\| formRef\.current\?\.contains\(action\)\) return;/);
});

test("auto-submit clears its timer on submit and unmount", () => {
  assert.match(source, /onSubmit=\{\(event\) => \{[\s\S]*?cancelScheduledUpdate\(\);[\s\S]*?updateUrl\(event\.currentTarget\);/);
  assert.match(source, /return \(\) => \{[\s\S]*?cancelScheduledUpdate\(\);/);
});

test("the delayed callback stops being pending before it navigates", () => {
  assert.match(source, /timeoutRef\.current = setTimeout\(\(\) => \{\s*timeoutRef\.current = null;\s*updateUrl\(form\);/);
});
