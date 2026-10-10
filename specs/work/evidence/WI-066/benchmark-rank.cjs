// Local synthetic audit benchmark. Executes the unmodified production function.
const fs = require('node:fs');
const vm = require('node:vm');
const { performance } = require('node:perf_hooks');
const ts = require('typescript');
const sourcePath = 'src/franchises/analytics.ts';
const source = fs.readFileSync(sourcePath, 'utf8');
const start = source.indexOf('function rankStyle(rows: Summary[])');
const end = source.indexOf('\nfunction hypothesisContext', start);
if (start < 0 || end < 0) throw new Error('Source boundary changed');
const compiled = ts.transpileModule(source.slice(start, end), {
  compilerOptions: { target: ts.ScriptTarget.ES2022 }
}).outputText;
const rankStyle = vm.runInNewContext(compiled + '\nrankStyle');
function rows(count) {
  return Array.from({ length: count }, (_, i) => ({
    name: `Manager ${i}`, metrics: {
      own_cohort_gap: (i * 19) % 101,
      cap_gap: (i * 31) % 97,
      buy_delta_gap: (i * 43) % 83
    }
  }));
}
rankStyle(rows(100));
const samples = [250, 500, 1000, 2000, 3000].map(count => {
  const timings = Array.from({ length: 3 }, () => {
    const input = rows(count);
    const started = performance.now();
    rankStyle(input);
    return Number((performance.now() - started).toFixed(2));
  });
  return { count, timingsMs: timings, medianMs: [...timings].sort((a,b) => a-b)[1], fullScanComparisons: 7 * count * count };
});
console.log(JSON.stringify({ sourcePath, synthetic: true, node: process.version, capturedAt: new Date().toISOString(), samples }, null, 2));
