import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const globals = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
const layout = readFileSync(new URL("../app/layout.tsx", import.meta.url), "utf8");
const themeToggle = readFileSync(new URL("./theme-toggle.tsx", import.meta.url), "utf8");
const appHeader = readFileSync(new URL("./app-header.tsx", import.meta.url), "utf8");

test("Soft Signal semantic tokens define both complete themes", () => {
  for (const token of [
    "--bg-canvas",
    "--bg-surface",
    "--bg-surface-muted",
    "--border-default",
    "--text-primary",
    "--action-primary",
    "--focus-ring",
    "--chart-8"
  ]) {
    const declarations = globals.match(new RegExp(`${token}:`, "g")) ?? [];
    assert.equal(declarations.length, 2, `${token} must exist once per theme`);
  }

  assert.match(globals, /--bg-canvas:\s*#f7f6f1/);
  assert.match(globals, /--bg-canvas:\s*#121619/);
  assert.doesNotMatch(globals, /linear-gradient\(180deg[\s\S]*body/);
});

test("theme control stays centered and meets the shared touch target", () => {
  assert.match(themeToggle, /data-icon-button/);
  assert.match(themeToggle, /className="ui-icon-button !justify-center"/);
  assert.match(themeToggle, /aria-hidden="true"/);
  assert.match(globals, /\.ui-icon-button\s*\{[\s\S]*width:\s*var\(--control-default\)/);
  assert.match(globals, /@media \(pointer: coarse\)[\s\S]*width:\s*var\(--control-touch\)/);
  assert.match(appHeader, /button:not\(\[data-icon-button\]\)/);
});

test("ordinary cards have borders and no decorative elevation", () => {
  assert.match(globals, /\.ui-card\s*\{[\s\S]*border: 1px solid var\(--border-subtle\)/);
  assert.match(globals, /\.ui-card\s*\{[\s\S]*box-shadow: none/);
  assert.match(globals, /\.shadow-soft\s*\{[\s\S]*box-shadow: none/);
});

test("Onest is self-hosted by Next instead of relying on a system font", () => {
  assert.match(layout, /import \{ Onest \} from "next\/font\/google"/);
  assert.match(layout, /variable: "--font-onest"/);
  assert.match(layout, /className=\{onest\.variable\}/);
  assert.match(globals, /font-family: var\(--font-onest\)/);
});
