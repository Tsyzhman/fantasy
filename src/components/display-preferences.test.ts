/** @spec spec://common/PROP-002-editorial-sport-design#preferences */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

function control(file: string, name: string, blocked = false) {
  const values = new Map<string, string>();
  const events = new Map<string, () => void>();
  const dataset: Record<string, string> = {};
  const cleanups: Array<() => void> = [];
  const media = { matches: false, addEventListener: (_: string, fn: () => void) => events.set("media", fn), removeEventListener: () => events.delete("media") };
  const store = { getItem: (key: string) => { if (blocked) throw new Error("Storage denied"); return values.get(key) ?? null; }, setItem: (key: string, value: string) => { if (blocked) throw new Error("Storage denied"); values.set(key, value); } };
  const exports: Record<string, () => { props: { onChange: (event: { target: { value: string } }) => void; value: string } }> = {};
  const context = {
    exports, localStorage: store, matchMedia: () => media, Event: class { constructor(public type: string) {} },
    document: { documentElement: { dataset, style: {} } },
    window: { addEventListener: (key: string, fn: () => void) => events.set(key, fn), removeEventListener: (key: string) => events.delete(key), dispatchEvent: (event: { type: string }) => events.get(event.type)?.() },
    require: (module: string) => {
      if (module === "react") return { useEffect: (fn: () => void) => fn(), useSyncExternalStore: (subscribe: (callback: () => void) => () => void, snapshot: () => string) => { cleanups.push(subscribe(() => {})); return snapshot(); } };
      if (module === "react/jsx-runtime") return { jsx: (_: unknown, props: unknown) => ({ props }), jsxs: (_: unknown, props: unknown) => ({ props }) };
      if (module.endsWith("localized-option")) return { useLanguage: () => "en", localizedText: (_: string, en: string) => en };
      throw new Error(module);
    }
  };
  const source = readFileSync(new URL(file, import.meta.url), "utf8");
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } }).outputText, context);
  const render = () => exports[name]();
  const choose = (value: string) => render().props.onChange({ target: { value } });
  return { render, choose, values, events, dataset, media, cleanups };
}

test("system theme follows OS changes, explicit choice persists, cross-tab removal returns to system", () => {
  const c = control("./theme-toggle.tsx", "ThemeToggle");
  c.render(); assert.equal(c.dataset.theme, "light");
  c.media.matches = true; c.events.get("media")!(); assert.equal(c.dataset.theme, "dark");
  c.choose("light"); assert.equal(c.values.get("fantasy-theme"), "light");
  c.events.get("media")!(); assert.equal(c.dataset.theme, "light");
  c.values.delete("fantasy-theme"); c.events.get("storage")!(); assert.equal(c.dataset.theme, "dark");
  c.cleanups.forEach(fn => fn()); assert.equal(c.events.size, 0);
});

test("denied browser storage preserves usable theme and density controls", () => {
  const theme = control("./theme-toggle.tsx", "ThemeToggle", true);
  theme.choose("dark"); assert.equal(theme.render().props.value, "dark"); assert.equal(theme.dataset.theme, "dark");
  const density = control("./density-toggle.tsx", "DensityToggle", true);
  density.choose("compact"); assert.equal(density.render().props.value, "compact"); assert.equal(density.dataset.density, "compact");
});

test("density persists independently and cross-tab changes synchronize without theme changes", () => {
  const c = control("./density-toggle.tsx", "DensityToggle");
  c.choose("compact"); assert.equal(c.values.get("fantasy-density"), "compact"); assert.equal(c.dataset.theme, undefined);
  c.values.set("fantasy-density", "comfortable"); c.events.get("storage")!(); assert.equal(c.dataset.density, "comfortable");
  c.cleanups.forEach(fn => fn()); assert.equal(c.events.size, 0);
});
