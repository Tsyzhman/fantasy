/** Read the deployed franchise reporting implementation. @spec spec://modules/franchises/FEAT-005-franchise-analytics#api */
const { Worker } = require("node:worker_threads");
const { resolve } = require("node:path");

const url = new URL(process.env.DATABASE_URL);
url.searchParams.set("connection_limit", "1");
const worker = new Worker(resolve("scripts/franchise-report-worker.cjs"), {
  resourceLimits: { maxOldGenerationSizeMb: 768, stackSizeMb: 4 },
  env: { ...process.env, DATABASE_URL: url.href },
});
const timeout = setTimeout(() => { console.error("Reader timed out"); void worker.terminate(); process.exitCode = 1; }, 90_000);
let revision;
worker.on("error", (error) => { console.error(error.message); clearTimeout(timeout); process.exitCode = 1; });
worker.on("message", async ({ id, result, error }) => {
  if (error) { console.error(error); process.exitCode = 1; }
  else if (id === 1) {
    revision = result.revision;
    worker.postMessage({ id: 2, revision, filters: { from: "2026-07-01", to: "2026-10-21", leagues: [], completed: false } });
    return;
  } else {
    const report = JSON.parse(result);
    console.log(JSON.stringify({ revision, generated: report.generated, acquisition: report.acquisition, franchises: report.franchises.length, rounds: report.rounds, squads: report.squads, managerSquads: report.managerSquads, buys: report.buys, responseBytes: Buffer.byteLength(result) }));
  }
  clearTimeout(timeout);
  await worker.terminate();
});
worker.postMessage({ id: 1 });
