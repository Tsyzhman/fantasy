/** @spec spec://common/INFRA-006-continuous-deployment#runtime */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createContext, runInContext } from "node:vm";
import ts from "typescript";

test("independent production server bundles reuse one database client and query listener", () => {
  const compiled = ts.transpileModule(readFileSync("src/lib/db.ts", "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText;
  let clients = 0, listeners = 0;
  class DatabaseClient {
    constructor() { clients++; }
    $on() { listeners++; }
  }
  const context = createContext({ process: { env: { NODE_ENV: "production" } } });
  const dependency = (id: string) => {
    if (id === "@prisma/client") return { PrismaClient: DatabaseClient };
    if (id === "@/lib/database-url") return { hasDatabaseUrl: () => true, isDatabaseConfigured: () => true };
    if (id === "@/server/runtime-diagnostics") return { recordSqlQuery() {} };
    throw new Error(`Unexpected dependency ${id}`);
  };
  const load = () => {
    const loadedModule = { exports: {} };
    runInContext(`(function(exports, require, module) { ${compiled}\n })`, context)(loadedModule.exports, dependency, loadedModule);
    return loadedModule.exports as { prisma: unknown };
  };
  const route = load(), instrumentation = load();
  assert.equal(route.prisma, instrumentation.prisma);
  assert.equal(clients, 1); assert.equal(listeners, 1);
});
