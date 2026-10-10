/** @spec spec://common/PROP-002-editorial-sport-design#contracts */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const globals = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
const layout = readFileSync(new URL("../app/layout.tsx", import.meta.url), "utf8");
const themeToggle = readFileSync(new URL("./theme-toggle.tsx", import.meta.url), "utf8");
const densityToggle = readFileSync(new URL("./density-toggle.tsx", import.meta.url), "utf8");
const tailwindConfig = readFileSync(new URL("../../tailwind.config.ts", import.meta.url), "utf8");

test("Editorial Sport semantic tokens define both complete themes", () => {
  for (const token of [
    "--bg-page",
    "--surface-1",
    "--text-primary",
    "--accent-primary",
    "--focus-ring",
    "--page-atmosphere",
    "--button-primary-bg"
  ]) {
    const declarations = globals.match(new RegExp(`${token}:`, "g")) ?? [];
    assert.equal(declarations.length, 2, `${token} must exist once per theme`);
  }

  assert.match(globals, /html\[data-theme="light"\]/);
  assert.match(globals, /html\[data-theme="dark"\]/);
  assert.match(globals, /--bg-page:\s*#F5F3EC/);
  assert.match(globals, /--bg-page:\s*#10171F/);
  assert.match(globals, /body\s*\{[\s\S]*background:\s*var\(--page-atmosphere\)/);
});

test("theme and density controls expose independent persisted choices", () => {
  for (const option of ["system", "light", "dark"]) assert.ok(themeToggle.includes(`value="${option}"`));
  for (const option of ["comfortable", "compact"]) assert.ok(densityToggle.includes(`value="${option}"`));
  assert.match(themeToggle, /aria-label=/);
  assert.match(densityToggle, /aria-label=/);
  assert.match(layout, /fantasy-density/);
  assert.match(layout, /prefers-color-scheme: dark/);
});

test("ordinary surfaces have no decorative gradients or elevation", () => {
  assert.match(globals, /--shadow-sm: none/);
  assert.doesNotMatch(globals, /radial-gradient|backdrop-filter/);
  assert.match(globals, /--button-primary-bg: var\(--accent\)/);
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

  const themes = [
    { surfaces: ["#F5F3EC", "#FFFFFF", "#F0F1EC", "#E0EEE7"], text: ["#202925", "#42534A", "#5D6D63"], accent: "#206854", on: "#FFFFFF", warning: "#915B19", warningBg: "#FFF0D9" },
    { surfaces: ["#10171F", "#1C2732", "#24313C", "#1A3938"], text: ["#EAF1F5", "#B8C5CE", "#93A5B4"], accent: "#63CDB8", on: "#102721", warning: "#F1C379", warningBg: "#3B3120" }
  ];
  for (const theme of themes) {
    for (const background of theme.surfaces) {
      for (const foreground of theme.text) assert.ok(contrastRatio(foreground, background) >= 4.5, `${foreground} on ${background}`);
    }
    assert.ok(contrastRatio(theme.on, theme.accent) >= 4.5);
    assert.ok(contrastRatio(theme.warning, theme.warningBg) >= 4.5);
  }
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
