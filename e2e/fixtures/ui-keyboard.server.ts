/** @spec spec://common/PROP-002-editorial-sport-design#checklist */
import { execFileSync } from "node:child_process";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { build, type Plugin } from "esbuild";
import postcss from "postcss";
import tailwindcss from "tailwindcss";

const projectRoot = resolve(__dirname, "../..");
const componentFiles = ["src/components/sortable-table.tsx", "src/components/command-palette.tsx", "src/components/machete/FantasySquadPlanner.tsx", "src/components/machete/planner-explanations.tsx"];

export async function startKeyboardFixture(sourceRevision?: string) {
  const plugins: Plugin[] = sourceRevision ? [{
    name: "review-source-revision",
    setup(buildApi) {
      buildApi.onLoad({ filter: /(?:sortable-table|command-palette|FantasySquadPlanner|planner-explanations)\.tsx$/ }, (args) => {
        const file = componentFiles.find((candidate) => resolve(projectRoot, candidate).toLowerCase() === args.path.toLowerCase());
        return file ? { contents: execFileSync("git", ["show", `${sourceRevision}:${file}`], { cwd: projectRoot, encoding: "utf8" }), loader: "tsx" } : undefined;
      });
    }
  }] : [];
  const bundle = await build({
    absWorkingDir: projectRoot, entryPoints: ["e2e/fixtures/ui-keyboard.tsx"], bundle: true, write: false,
    platform: "browser", format: "iife", define: { "process.env": '{"NODE_ENV":"development"}' }, plugins, logLevel: "silent"
  });
  const css = await postcss([tailwindcss({ config: resolve(projectRoot, "tailwind.config.ts") })])
    .process(await readFile(resolve(projectRoot, "src/app/globals.css"), "utf8"), { from: resolve(projectRoot, "src/app/globals.css") });
  const server = createServer((request, response) => {
    if (request.url?.startsWith("/fixture.js")) {
      response.setHeader("Content-Type", "text/javascript");
      response.end(bundle.outputFiles[0].contents);
    } else if (request.url?.startsWith("/fixture.css")) {
      response.setHeader("Content-Type", "text/css");
      response.end(css.css);
    } else if (request.url?.startsWith("/api/")) {
      response.setHeader("Content-Type", "application/json");
      response.end(JSON.stringify({ presets: [], items: [], players: [], status: "NOT_LINKED" }));
    } else {
      response.setHeader("Content-Type", "text/html; charset=utf-8");
      response.end('<!doctype html><html lang="en" data-language="en" data-theme="light" style="--font-onest:Onest;--font-jetbrains-mono:monospace"><head><meta name="viewport" content="width=device-width, initial-scale=1"><title>Isolated UI keyboard fixture</title><link rel="stylesheet" href="/fixture.css"></head><body><div id="root"></div><script src="/fixture.js"></script></body></html>');
    }
  });
  await new Promise<void>((resolveReady, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolveReady);
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Missing loopback address");
  return {
    url: `http://127.0.0.1:${address.port}`,
    close: () => new Promise<void>((resolveClosed, reject) => server.close((error) => error ? reject(error) : resolveClosed()))
  };
}
