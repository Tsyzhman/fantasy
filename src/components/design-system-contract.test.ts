import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const globals = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
const layout = readFileSync(new URL("../app/layout.tsx", import.meta.url), "utf8");
const themeToggle = readFileSync(new URL("./theme-toggle.tsx", import.meta.url), "utf8");
const appHeader = readFileSync(new URL("./app-header.tsx", import.meta.url), "utf8");
const tailwindConfig = readFileSync(new URL("../../tailwind.config.ts", import.meta.url), "utf8");

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

test("semantic 950 text cannot collapse onto its soft alert background", () => {
  assert.match(tailwindConfig, /950: `rgb\(var\(--\$\{name\}-rgb\)/);
  assert.doesNotMatch(tailwindConfig, /950: `rgb\(var\(--\$\{name\}-soft-rgb\)/);

  assert.ok(contrastRatio("#8a5a10", "#fff5d8") >= 4.5);
  assert.ok(contrastRatio("#f3c76d", "#3b311a") >= 4.5);
});

function contrastRatio(foreground: string, background: string) {
  const lighter = Math.max(relativeLuminance(foreground), relativeLuminance(background));
  const darker = Math.min(relativeLuminance(foreground), relativeLuminance(background));
  return (lighter + 0.05) / (darker + 0.05);
}

function relativeLuminance(hex: string) {
  const channels = hex.match(/[a-f\d]{2}/gi)?.map((value) => Number.parseInt(value, 16) / 255) ?? [];
  const linear = channels.map((value) => (value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4));
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
}
