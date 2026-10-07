/** @spec spec://common/PROP-001-workflow-validation#acceptance */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";
import { test } from "node:test";

const script = resolve(".agents/skills/spec-driven-work/scripts/check-workflow.mjs");
const mirror = resolve(".claude/skills/spec-driven-work/scripts/check-workflow.mjs");
const fixtureParent = resolve(".tmp/workflow-check-tests");
const standalone = { schemaVersion: "4", mode: "standalone", stateSource: "repository", setupMode: "adopt", status: "ready" };
const managed = { schemaVersion: "4", mode: "prist-managed", stateSource: "prist", bundleVersion: "test-v1", status: "connection_ready", files: ["AGENTS.md"] };
type Report = { status: string; checks: { id: string; status: string; detail: string }[]; errors: string[] };
type Fixture = { state?: unknown; connection?: unknown; entrypoint?: string; boot?: boolean; rawWorkflow?: string; rawConnection?: string };

async function withFixture(options: Fixture, check: (root: string) => void | Promise<void>) {
  await mkdir(fixtureParent, { recursive: true });
  const root = await mkdtemp(join(fixtureParent, "case-"));
  const contents: Record<string, string> = {
    "AGENTS.md": options.entrypoint ?? "This repository uses `standalone` mode.",
    "CLAUDE.md": "@AGENTS.md",
    "specs/SPEC-MAP.md": "# Specification map",
    "specs/common/main.md": "# Product {#root}",
    "specs/common/structure.md": "# Technical map {#root}",
    ".agents/skills/spec-driven-work/SKILL.md": "# Shared skill",
    ".claude/skills/spec-driven-work/SKILL.md": "# Shared skill"
  };
  if (options.boot !== false) contents["specs/protocols/BOOT.md"] = "# Bootstrap";
  if (options.rawWorkflow !== undefined) contents[".prist/workflow.json"] = options.rawWorkflow;
  else if (options.state !== undefined) contents[".prist/workflow.json"] = JSON.stringify(options.state);
  if (options.rawConnection !== undefined) contents[".prist/connection.json"] = options.rawConnection;
  else if (options.connection !== undefined) contents[".prist/connection.json"] = JSON.stringify(options.connection);
  try {
    for (const [path, value] of Object.entries(contents)) {
      await mkdir(dirname(join(root, path)), { recursive: true });
      await writeFile(join(root, path), value);
    }
    await check(root);
  } finally {
    const ownedPath = relative(fixtureParent, resolve(root));
    assert.ok(ownedPath.startsWith("case-") && !ownedPath.includes(sep) && resolve(root) === join(fixtureParent, ownedPath));
    await rm(root, { recursive: true, force: true });
  }
}

function run(root: string, validator = script) {
  const child = spawnSync(process.execPath, [validator, root], { encoding: "utf8", timeout: 15_000, maxBuffer: 2 * 1024 * 1024 });
  assert.ifError(child.error);
  const report = JSON.parse(child.stdout) as Report;
  return { code: child.status, report };
}
function passed(root: string, validator?: string) {
  const result = run(root, validator);
  assert.equal(result.code, 0, JSON.stringify(result.report.errors));
  assert.equal(result.report.status, "passed");
  return result.report;
}
function failed(root: string, checkId: string) {
  const result = run(root);
  assert.equal(result.code, 1);
  assert.equal(result.report.status, "failed");
  assert.ok(result.report.checks.some(check => check.id === checkId && check.status === "failed"), JSON.stringify(result.report));
}

test("workflow validator: explicit standalone receipt passes both mirrored CLIs without a connection kit", async () => {
  await withFixture({ state: standalone, connection: "unused stale connection" }, async root => {
    for (const validator of [script, mirror]) {
      const report = passed(root, validator);
      assert.ok(report.checks.some(check => check.id === "state:standalone" && check.status === "passed"));
      assert.ok(!report.checks.some(check => check.id === "state:connection-kit"));
      assert.ok(report.checks.some(check => check.id === "spec-space:current"));
    }
  });
  assert.equal(await readFile(script, "utf8"), await readFile(mirror, "utf8"));
});

test("workflow validator: explicit entrypoint supplies standalone mode without a local receipt", async () => {
  await withFixture({ connection: "stale connection", entrypoint: "Workflow mode: `standalone`." }, root => { passed(root); });
});

test("workflow validator: standalone still requires local canon/bootstrap files", async () => {
  await withFixture({ state: standalone, boot: false }, root => failed(root, "required:specs/protocols/BOOT.md"));
});

for (const [field, value] of [["status", "connection_ready"], ["stateSource", "prist"], ["schemaVersion", "99"]]) {
  test(`workflow validator: invalid standalone ${field} fails`, async () => {
    await withFixture({ state: { ...standalone, [field]: value } }, root => failed(root, "state:standalone"));
  });
}

test("workflow validator: an unsupported explicit mode does not fall back to the entrypoint", async () => {
  await withFixture({ state: { ...standalone, mode: "unknown" } }, root => failed(root, "state:mode"));
});

test("workflow validator: conflicting explicit declarations fail", async () => {
  await withFixture({ state: managed }, root => failed(root, "state:mode"));
});

for (const rawWorkflow of ["{", "null", "[]"]) {
  test(`workflow validator: malformed workflow ${rawWorkflow} fails with structured output`, async () => {
    await withFixture({ rawWorkflow }, root => failed(root, "state:workflow"));
  });
}

test("workflow validator: valid managed receipt and matching setup context pass", async () => {
  await withFixture({ state: managed, entrypoint: "This repository uses `prist-managed` mode.", boot: false,
    connection: { workflow: { bundleVersion: managed.bundleVersion, stateSource: managed.stateSource } } }, root => {
    const report = passed(root);
    assert.ok(report.checks.some(check => check.id === "state:connection-kit"));
    assert.ok(!report.checks.some(check => check.id === "state:standalone"));
  });
});

for (const field of ["bundleVersion", "stateSource"]) {
  test(`workflow validator: managed setup context ${field} mismatch fails`, async () => {
    await withFixture({ state: managed, entrypoint: "<!-- prist:begin -->",
      connection: { workflow: { bundleVersion: managed.bundleVersion, stateSource: managed.stateSource, [field]: "wrong" } } }, root => failed(root, "state:connection-kit"));
  });
}

test("workflow validator: existing managed receipt without an explicit mode remains supported", async () => {
  const legacy = { ...managed, mode: undefined };
  await withFixture({ state: legacy, entrypoint: "<!-- prist:begin -->" }, root => { passed(root); });
});

test("workflow validator: a managed connection without its receipt fails", async () => {
  await withFixture({ connection: { workflow: managed }, entrypoint: "<!-- prist:begin -->" }, root => failed(root, "state:connection-kit"));
});

test("workflow validator: managed receipt cannot omit its file manifest", async () => {
  await withFixture({ state: { ...managed, files: [] }, entrypoint: "Workflow mode: prist-managed" }, root => failed(root, "state:connection-kit"));
});

test("workflow validator: malformed managed connection fails with structured output", async () => {
  await withFixture({ state: managed, entrypoint: "Workflow mode: prist-managed", rawConnection: "{" }, root => failed(root, "state:connection-kit"));
});

test("workflow validator: contradictory entrypoint modes fail", async () => {
  await withFixture({ entrypoint: "Workflow mode: standalone.\nThis repository uses `prist-managed` mode." }, root => failed(root, "state:mode"));
});
