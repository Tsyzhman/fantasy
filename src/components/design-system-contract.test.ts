import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const globals = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
const layout = readFileSync(new URL("../app/layout.tsx", import.meta.url), "utf8");
const themeToggle = readFileSync(new URL("./theme-toggle.tsx", import.meta.url), "utf8");
const appHeader = readFileSync(new URL("./app-header.tsx", import.meta.url), "utf8");
const tailwindConfig = readFileSync(new URL("../../tailwind.config.ts", import.meta.url), "utf8");

test("Cloudline semantic tokens define both complete themes", () => {
  for (const token of [
    "--bg-page",
    "--surface-1",
    "--text-primary",
    "--accent-primary",
    "--focus-ring",
    "--page-atmosphere",
    "--button-primary-bg",
    "--chart-8"
  ]) {
    const declarations = globals.match(new RegExp(`${token}:`, "g")) ?? [];
    assert.equal(declarations.length, 2, `${token} must exist once per theme`);
  }

  assert.match(globals, /html\[data-theme="light"\]/);
  assert.match(globals, /html\[data-theme="dark"\]/);
  assert.match(globals, /--bg-page:\s*#f4f8fd/);
  assert.match(globals, /--bg-page:\s*#0d1727/);
  assert.match(globals, /body\s*\{[\s\S]*background:\s*var\(--page-atmosphere\)/);
});

test("theme control stays centered and meets the shared touch target", () => {
  assert.match(themeToggle, /data-icon-button/);
  assert.match(themeToggle, /className="ui-icon-button !justify-center"/);
  assert.match(themeToggle, /aria-hidden="true"/);
  assert.match(themeToggle, /aria-pressed=\{theme === "dark"\}/);
  assert.match(globals, /\.ui-icon-button\s*\{[\s\S]*width:\s*var\(--control-default\)/);
  assert.match(globals, /@media \(pointer: coarse\)[\s\S]*width:\s*var\(--control-touch\)/);
  assert.match(appHeader, /button:not\(\[data-icon-button\]\)/);
});

test("ordinary cards have borders and Cloudline elevation", () => {
  assert.match(globals, /\.ui-card\s*\{[\s\S]*border: 1px solid var\(--border\)/);
  assert.match(globals, /\.ui-card\s*\{[\s\S]*box-shadow: var\(--shadow-sm\)/);
  assert.match(globals, /\.shadow-soft\s*\{[\s\S]*box-shadow: var\(--shadow-sm\)/);
});

test("Onest is self-hosted by Next instead of relying on a system font", () => {
  assert.match(layout, /import \{ JetBrains_Mono, Onest \} from "next\/font\/google"/);
  assert.match(layout, /variable: "--font-onest"/);
  assert.match(layout, /variable: "--font-jetbrains-mono"/);
  assert.match(layout, /className=\{`\$\{onest\.variable\} \$\{jetbrainsMono\.variable\}`\}/);
  assert.match(globals, /font-family: var\(--font-onest\)/);
});

test("semantic 950 text cannot collapse onto its soft alert background", () => {
  assert.match(tailwindConfig, /950: `rgb\(var\(--\$\{name\}-rgb\)/);
  assert.doesNotMatch(tailwindConfig, /950: `rgb\(var\(--\$\{name\}-soft-rgb\)/);

  assert.ok(contrastRatio("#7b5a13", "#fff4d8") >= 4.5);
  assert.ok(contrastRatio("#efc56d", "#3b3120") >= 4.5);
  assert.ok(contrastRatio("#61718a", "#f4f8fd") >= 4.5);
  assert.ok(contrastRatio("#91a2ba", "#0d1727") >= 4.5);
});

/** @spec spec://modules/machete/FEAT-003-squad-player-card#contracts */
test("fixture neutral fallback has zero specificity so known FDR colours win in either CSS order", () => {
  assert.match(globals, /:where\(\.fixture-pill\)\s*\{[^}]*background: var\(--surface-3\)/);
  assert.doesNotMatch(globals, /^\.fixture-pill\s*\{/m);
  for (let level = 1; level <= 5; level++) {
    const rule = globals.split(`.fixture-difficulty-${level} {`)[1]?.split("}")[0];
    assert.ok(rule?.includes(`background: var(--fdr-${level})`));
    assert.ok(rule?.includes("color: var(--fdr-text)"));
  }
  assert.match(globals, /\.fixture-difficulty-na\s*\{[^}]*color: var\(--text-muted\)/);
  assert.match(globals, /\.fixture-pill-home\s*\{\s*font-weight: 800/);
  assert.match(globals, /\.fixture-pill-away\s*\{\s*font-weight: 400/);
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
