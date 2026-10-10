/** @spec spec://common/INFRA-006-continuous-deployment#observability */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import { createContext, runInContext } from "node:vm";
import ts from "typescript";
import type * as Diagnostics from "./runtime-diagnostics";

test("independent server bundle copies share SQL summaries and start one process timer", () => {
  const compiled = ts.transpileModule(readFileSync("src/server/runtime-diagnostics.ts", "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText;
  const require = createRequire(import.meta.url);
  let timers = 0, monitors = 0;
  const context = createContext({
    console, process: { env: { NODE_ENV: "production" }, cpuUsage: () => ({ user: 0, system: 0 }) },
    setInterval: () => { timers++; return { unref() {} }; }
  });
  const load = () => {
    const loadedModule = { exports: {} };
    const loadDependency = (id: string) => id === "node:perf_hooks"
      ? { monitorEventLoopDelay: () => { monitors++; return { enable() {} }; } }
      : require(id);
    runInContext(`(function(exports, require, module) { ${compiled}\n })`, context)(loadedModule.exports, loadDependency, loadedModule);
    return loadedModule.exports as typeof Diagnostics;
  };
  const route = load(), instrumentation = load();
  route.recordSqlQuery("SELECT 'private-query-fixture'", 7);
  assert.equal(instrumentation.diagnosticSqlWindow().fingerprints, 1);
  assert.equal(instrumentation.diagnosticSqlWindow().top[0].count, 1);
  assert.ok(!JSON.stringify(instrumentation.diagnosticSqlWindow()).includes("private-query-fixture"));
  route.startRuntimeDiagnostics(); instrumentation.startRuntimeDiagnostics();
  assert.equal(timers, 1); assert.equal(monitors, 1);
});
