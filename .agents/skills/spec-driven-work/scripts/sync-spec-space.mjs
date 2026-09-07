#!/usr/bin/env node
/* global process, fetch, URL */

import { createHash, randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdir, readFile, readdir, rename, stat, unlink, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";
import { parseArgs, promisify } from "node:util";
import { pathToFileURL } from "node:url";

const execute = promisify(execFile);
const specUriPattern = /spec:\/\/[A-Za-z0-9_./*-]+(?:#[A-Za-z0-9_.-]+)?/g;
const tracePattern = /@spec\s+(spec:\/\/[A-Za-z0-9_./-]+(?:#[A-Za-z0-9_.-]+)?)/g;
const traceabilityExtensions = new Set([".c", ".cc", ".cpp", ".css", ".go", ".h", ".html", ".java", ".js", ".jsx", ".json", ".kt", ".kts", ".mjs", ".php", ".py", ".rb", ".rs", ".scss", ".sh", ".sql", ".svelte", ".swift", ".toml", ".ts", ".tsx", ".vue", ".yaml", ".yml", ".zsh"]);
const excludedDirectories = new Set([".agents", ".claude", ".codex", ".git", ".next", ".turbo", ".prist", "build", "coverage", "dist", "evidence", "node_modules", "playwright-report", "specs", "test-results"]);
const generatedTraceabilityPrefixes = ["agent/workflows/", "agent/packages/"];

/**
 * @spec spec://common/PROP-007-BOUNDARIES#sync
 * @spec spec://common/PROP-009-SECURITY#privacy
 */
const sensitivePatterns = [
  { id: "private_key", pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g, replacement: "[REDACTED_PRIVATE_KEY]" },
  { id: "github_token", pattern: /\b(?:github_pat_[A-Za-z0-9_]{20,}|gh[pousr]_[A-Za-z0-9]{20,})\b/g, replacement: "[REDACTED_TOKEN]" },
  { id: "openai_token", pattern: /\bsk-[A-Za-z0-9_-]{20,}\b/g, replacement: "[REDACTED_TOKEN]" },
  { id: "aws_access_key", pattern: /\bAKIA[A-Z0-9]{16}\b/g, replacement: "[REDACTED_TOKEN]" },
  { id: "bearer", pattern: /\bBearer\s+[A-Za-z0-9._~+/-]{20,}/gi, replacement: "Bearer [REDACTED]" },
  { id: "assigned_secret", pattern: /\b(activation[_-]?token|credential|client[_-]?secret|access[_-]?token|refresh[_-]?token|password)\s*[:=]\s*(["']?)(?!<|\[)[^\s,"']{12,}\2/gi, replacement: "$1=[REDACTED]" },
];

function repositoryPath(root, path) {
  return relative(root, path).split(sep).join("/");
}

function uniqueSorted(values) {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right, "en"));
}

function normalizeText(value) {
  return value.replace(/\r\n/g, "\n");
}

function redactSnapshotSecrets(content) {
  let sanitized = content;
  const findings = [];
  for (const candidate of sensitivePatterns) {
    const matches = sanitized.match(candidate.pattern);
    if (!matches?.length) continue;
    findings.push(candidate.id);
    sanitized = sanitized.replace(candidate.pattern, candidate.replacement);
  }
  return { content: sanitized, findings: uniqueSorted(findings) };
}

function stable(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  return `{${Object.keys(value).sort((left, right) => left.localeCompare(right, "en"))
    .map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(",")}}`;
}

function canonicalSpec(spec) {
  return {
    id: spec.id,
    type: spec.type,
    title: spec.title,
    lifecycle: spec.lifecycle,
    summary: spec.summary,
    text: normalizeText(spec.text),
    path: spec.path,
    anchors: uniqueSorted(spec.anchors),
    references: uniqueSorted(spec.references),
    relations: [...spec.relations].map(({ kind, target }) => ({ kind, target }))
      .sort((left, right) => left.kind.localeCompare(right.kind, "en") || left.target.localeCompare(right.target, "en")),
    dependsOn: uniqueSorted(spec.dependsOn),
    productArea: spec.productArea,
    codePaths: uniqueSorted(spec.codePaths),
    testPaths: uniqueSorted(spec.testPaths),
  };
}

function fingerprint(snapshot) {
  const payload = {
    schemaVersion: snapshot.schemaVersion,
    status: snapshot.status,
    specs: [...snapshot.specs].sort((left, right) => left.path.localeCompare(right.path, "en")).map(canonicalSpec),
    documents: [...snapshot.documents].map((document) => ({ path: document.path, text: normalizeText(document.text) }))
      .sort((left, right) => left.path.localeCompare(right.path, "en")),
    traceability: [...snapshot.traceability].map((record) => ({ path: record.path, references: uniqueSorted(record.references) }))
      .sort((left, right) => left.path.localeCompare(right.path, "en")),
    diagnostics: uniqueSorted(snapshot.diagnostics),
  };
  return createHash("sha256").update(stable(payload)).digest("hex");
}

function parseLifecycle(content) {
  const frontmatter = content.match(/^---\s*\r?\n([\s\S]*?)\r?\n---/);
  const declared = frontmatter?.[1]?.match(/^status:\s*([^\s#]+).*$/m)?.[1];
  if (!declared) return { lifecycle: "active" };
  if (["active", "draft", "superseded", "retired"].includes(declared)) return { lifecycle: declared };
  return { lifecycle: "draft", diagnostic: `Неизвестный lifecycle '${declared}', использован draft` };
}

function specAddress(path) {
  return `spec://${path.replace(/^specs\//, "").replace(/\.md$/, "")}`;
}

function canonicalReferenceUris(content) {
  return uniqueSorted((content
    .replace(/```[\s\S]*?```/g, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .match(specUriPattern) ?? []))
    .filter((reference) => !reference.includes("*") && !reference.includes("..."));
}

const relationKinds = {
  related: "related",
  "depends on": "depends_on",
  supersedes: "supersedes",
  "superseded by": "superseded_by",
  "see also": "see_also",
};

function parseRelations(content) {
  const relations = [];
  let governingSection = false;
  for (const line of content.split(/\r?\n/)) {
    if (/^##\s+/.test(line)) governingSection = /Управляющие спеки/i.test(line);
    const explicit = line.match(/^\s*[-*]\s*(Related|Depends on|Supersedes|Superseded by|See also)\s*:/i);
    const targets = line.match(specUriPattern) ?? [];
    if (explicit?.[1]) {
      const kind = relationKinds[explicit[1].toLocaleLowerCase("en-US")];
      if (kind) relations.push(...targets.map((target) => ({ kind, target })));
    } else if (governingSection && /^\s*[-*]\s+/.test(line)) {
      relations.push(...targets.map((target) => ({ kind: "governing", target })));
    }
  }
  return [...new Map(relations.map((relation) => [`${relation.kind}:${relation.target}`, relation])).values()]
    .sort((left, right) => left.kind.localeCompare(right.kind, "en") || left.target.localeCompare(right.target, "en"));
}

function parseSpec(content, path, lastChangedAt, lastChangedSource, now) {
  const heading = content.match(/^#\s+((PROP|FEAT|INFRA)-\d+):\s+(.+?)(?:\s+\{#root\})?\s*$/m);
  if (!heading?.[1] || !heading[2] || !heading[3]) throw new Error(`Не найден заголовок спеки в ${path}`);
  const plainSection = content.split(/##\s+Простыми словами[^\n]*\n/)[1] ?? "";
  const summary = plainSection.split(/\n##\s+/)[0]?.split("\n").map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#")).join(" ") ?? "";
  const ageDays = Math.max(0, (now.getTime() - new Date(lastChangedAt).getTime()) / 86_400_000);
  const freshness = ageDays <= 30 ? "fresh" : ageDays <= 90 ? "aging" : "attention";
  const lifecycle = parseLifecycle(content);
  const relations = parseRelations(content);
  const spec = {
    id: heading[1],
    type: heading[2],
    title: heading[3].trim(),
    lifecycle: lifecycle.lifecycle,
    summary,
    text: normalizeText(content),
    path,
    anchors: uniqueSorted([...content.matchAll(/\{#([A-Za-z0-9_.-]+)\}/g)].map((match) => match[1])),
    references: uniqueSorted(content.match(specUriPattern) ?? []),
    relations,
    dependsOn: relations.filter((relation) => relation.kind === "depends_on").map((relation) => relation.target),
    productArea: path.match(/^specs\/modules\/([^/]+)\//)?.[1] ?? "common",
    codePaths: [],
    testPaths: [],
    lastChangedAt,
    lastChangedSource,
    freshness,
  };
  return lifecycle.diagnostic ? { spec, diagnostic: `${path}: ${lifecycle.diagnostic}` } : { spec };
}

const requiredSpecSections = {
  PROP: ["root", "plain-language", "goal", "scope", "relationships", "checklist", "changelog"],
  FEAT: ["root", "plain-language", "goal", "governing-specs", "scope", "actors", "scenarios", "data", "contracts", "errors", "traceability", "acceptance", "relationships", "changelog"],
  INFRA: ["root", "plain-language", "goal", "governing-specs", "scope", "environments", "decisions", "runtime", "data", "contracts", "recovery", "observability", "traceability", "acceptance", "relationships", "changelog"],
};

function specReadinessDiagnostic(spec) {
  const missing = requiredSpecSections[spec.type].filter((required) => !spec.anchors.includes(required)
    && !spec.anchors.some((anchor) => anchor.startsWith(`${required}.`)));
  return missing.length > 0
    ? `${spec.path}: ${spec.type} ${spec.lifecycle} не готова по актуальному протоколу; отсутствуют sections ${missing.join(", ")}`
    : undefined;
}

function documentAnchors(content) {
  return uniqueSorted([...content.matchAll(/\{#([A-Za-z0-9_.-]+)\}/g)].map((match) => match[1]));
}

function validateReferences(specs, documents, diagnostics) {
  const targets = new Map();
  for (const spec of specs) targets.set(specAddress(spec.path), spec.anchors);
  for (const document of documents) targets.set(specAddress(document.path), documentAnchors(document.text));
  const sources = [
    ...specs.map((spec) => ({ path: spec.path, content: spec.text })),
    ...documents.map((document) => ({ path: document.path, content: document.text })),
  ];
  for (const source of sources) {
    for (const reference of canonicalReferenceUris(source.content)) {
      const [address, anchor] = reference.split("#");
      const anchors = targets.get(address);
      if (!anchors) diagnostics.push(`${source.path}: ссылается на неизвестную спеку ${reference}`);
      else if (anchor && !anchors.includes(anchor)) diagnostics.push(`${source.path}: ссылается на неизвестный anchor ${reference}`);
    }
  }
}

function validateSpecMap(specs, documents, diagnostics) {
  const map = documents.find((document) => document.path === "specs/SPEC-MAP.md");
  if (!map) return;
  for (const spec of specs) {
    const basename = spec.path.split("/").at(-1);
    if (!map.text.includes(basename) && !map.text.includes(specAddress(spec.path))) {
      diagnostics.push(`${spec.path}: typed spec не зарегистрирована в specs/SPEC-MAP.md`);
    }
  }
}

function traceabilitySection(content) {
  const heading = content.match(/^##\s+.*\{#traceability\}.*$/m);
  if (!heading || heading.index === undefined) return "";
  const body = content.slice(heading.index + heading[0].length);
  const next = body.search(/^##\s+/m);
  return next < 0 ? body : body.slice(0, next);
}

function declaredTraceabilityPaths(spec) {
  return uniqueSorted([...traceabilitySection(spec.text).matchAll(/`([^`]+)`/g)]
    .map((match) => match[1].trim())
    .filter((path) => {
      if (!path || path.startsWith("@spec") || path.startsWith("spec://") || path.startsWith("/") || path.includes("\\") || path.includes("*") || path.split("/").some((part) => part === "..")) return false;
      const name = path.split("/").at(-1);
      const extension = name.includes(".") ? `.${name.split(".").at(-1).toLocaleLowerCase("en-US")}` : "";
      return traceabilityExtensions.has(extension) || name === "Dockerfile" || name === "Makefile";
    }));
}

async function validateDeclaredTraceability(root, specs, traceability, diagnostics) {
  const indexed = new Map(traceability.map((record) => [record.path, record.references]));
  for (const spec of specs) {
    const owningAddress = specAddress(spec.path);
    for (const path of declaredTraceabilityPaths(spec)) {
      try {
        const facts = await stat(join(root, path));
        if (!facts.isFile()) throw new Error("not a file");
      } catch {
        diagnostics.push(`${spec.path}: declared traceability path не найден ${path}`);
        continue;
      }
      const ownsPath = indexed.get(path)?.some((reference) => reference.split("#")[0] === owningAddress) ?? false;
      if (!ownsPath) diagnostics.push(`${spec.path}: declared traceability path ${path} не содержит owning @spec ${owningAddress}#...`);
    }
  }
}

async function walkFiles(directory, accept) {
  const result = [];
  async function walk(current) {
    let entries;
    try {
      entries = await readdir(current, { withFileTypes: true });
    } catch (error) {
      if (error.code === "ENOENT") return;
      throw error;
    }
    for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name, "en"))) {
      const path = join(current, entry.name);
      if (entry.isDirectory() && !excludedDirectories.has(entry.name)) await walk(path);
      else if (entry.isFile() && accept(entry.name)) result.push(path);
    }
  }
  await walk(directory);
  return result;
}

async function git(root, args, fallback) {
  try {
    const { stdout } = await execute("git", args, { cwd: root });
    return stdout.trim() || fallback;
  } catch {
    return fallback;
  }
}

async function gitStatus(root) {
  try {
    const { stdout } = await execute("git", ["status", "--porcelain", "--untracked-files=normal"], { cwd: root });
    return stdout;
  } catch {
    return undefined;
  }
}

function dirtyPaths(status) {
  if (!status) return [];
  return uniqueSorted(status.split(/\r?\n/).flatMap((line) => {
    const value = line.slice(3).trim();
    if (!value) return [];
    return [(value.includes(" -> ") ? value.split(" -> ").at(-1) : value).replace(/^"|"$/g, "")];
  }));
}

function materialDirtyPaths(paths) {
  return paths.filter((path) => path === "specs/SPEC-MAP.md" || path === "specs/common/main.md" || path === "specs/common/structure.md"
    || /^specs\/(?:common|modules)\/(?:.*\/)?(?:PROP|FEAT|INFRA)-\d+.*\.md$/.test(path)
    || (!path.split("/").some((part) => excludedDirectories.has(part))
      && (traceabilityExtensions.has(path.includes(".") ? `.${path.split(".").at(-1).toLocaleLowerCase("en-US")}` : "")
        || path.endsWith("/Dockerfile") || path === "Dockerfile" || path.endsWith("/Makefile") || path === "Makefile")));
}

async function buildSnapshot(repositoryRoot, now = new Date()) {
  const root = resolve(repositoryRoot);
  const indexedAt = now.toISOString();
  const commit = await git(root, ["rev-parse", "HEAD"], "working-tree");
  const dirty = await gitStatus(root);
  const source = commit === "working-tree" || dirty === undefined || dirty.length > 0 ? "working_tree" : "git";
  const specFiles = (await Promise.all([
    walkFiles(join(root, "specs/common"), (name) => /^(PROP|FEAT|INFRA)-\d+.*\.md$/.test(name)),
    walkFiles(join(root, "specs/modules"), (name) => /^(PROP|FEAT|INFRA)-\d+.*\.md$/.test(name)),
  ])).flat().sort((left, right) => left.localeCompare(right, "en"));
  const specs = [];
  const diagnostics = [];
  for (const file of specFiles) {
    const path = repositoryPath(root, file);
    try {
      const [content, committedAt, fileStatus, fileStat] = await Promise.all([
        readFile(file, "utf8"),
        git(root, ["log", "-1", "--format=%cI", "--", path], indexedAt),
        git(root, ["status", "--porcelain", "--", path], ""),
        stat(file),
      ]);
      const changed = commit === "working-tree" || fileStatus.length > 0;
      const sanitized = redactSnapshotSecrets(content);
      if (sanitized.findings.length > 0) diagnostics.push(`${path}: потенциальные credentials удалены из snapshot (${sanitized.findings.join(", ")})`);
      const parsed = parseSpec(sanitized.content, path, changed ? fileStat.mtime.toISOString() : committedAt, changed ? "working_tree" : "git", now);
      specs.push(parsed.spec);
      if (parsed.diagnostic) diagnostics.push(parsed.diagnostic);
      const readinessDiagnostic = specReadinessDiagnostic(parsed.spec);
      if (readinessDiagnostic) diagnostics.push(readinessDiagnostic);
    } catch (error) {
      diagnostics.push(error instanceof Error ? error.message : String(error));
    }
  }
  const byAddress = new Map(specs.map((spec) => [specAddress(spec.path), spec]));
  for (const spec of specs) {
    for (const relation of spec.relations) {
      const [address, anchor] = relation.target.split("#");
      const target = byAddress.get(address);
      if (!target) diagnostics.push(`${spec.path}: ${relation.kind} ссылается на неизвестную спеку ${relation.target}`);
      else if (anchor && !target.anchors.includes(anchor)) diagnostics.push(`${spec.path}: ${relation.kind} ссылается на неизвестный anchor ${relation.target}`);
    }
  }
  const traceFiles = (await walkFiles(root, (name) => {
    const extension = name.includes(".") ? `.${name.split(".").at(-1).toLocaleLowerCase("en-US")}` : "";
    return traceabilityExtensions.has(extension) || name === "Dockerfile" || name === "Makefile";
  })).filter((file) => !generatedTraceabilityPrefixes.some((prefix) => repositoryPath(root, file).startsWith(prefix)))
    .sort((left, right) => left.localeCompare(right, "en"));
  const traceability = [];
  for (const file of traceFiles) {
    const path = repositoryPath(root, file);
    let content;
    try {
      content = await readFile(file, "utf8");
    } catch (error) {
      diagnostics.push(`Не удалось прочитать ${path}: ${error instanceof Error ? error.message : String(error)}`);
      continue;
    }
    const references = [];
    for (const match of content.matchAll(tracePattern)) {
      const reference = match[1];
      references.push(reference);
      const spec = byAddress.get(reference.split("#")[0]);
      if (!spec) diagnostics.push(`${path}: @spec ссылается на неизвестную спеку ${reference}`);
      else (path.startsWith("tests/") ? spec.testPaths : spec.codePaths).push(path);
    }
    if (references.length > 0) traceability.push({ path, references: uniqueSorted(references) });
  }
  for (const spec of specs) {
    spec.codePaths = uniqueSorted(spec.codePaths);
    spec.testPaths = uniqueSorted(spec.testPaths);
  }
  const documents = [];
  const documentsToRead = [
    { path: "specs/SPEC-MAP.md", required: true },
    { path: "specs/common/main.md", required: true },
    { path: "specs/common/structure.md", required: specs.length > 0 },
  ];
  for (const { path, required } of documentsToRead) {
    try {
      const sanitized = redactSnapshotSecrets(await readFile(join(root, path), "utf8"));
      if (sanitized.findings.length > 0) diagnostics.push(`${path}: потенциальные credentials удалены из snapshot (${sanitized.findings.join(", ")})`);
      documents.push({ path, text: normalizeText(sanitized.content) });
    } catch (error) {
      if (required || error.code !== "ENOENT") diagnostics.push(`Не удалось прочитать ${path}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  validateReferences(specs, documents, diagnostics);
  validateSpecMap(specs, documents, diagnostics);
  await validateDeclaredTraceability(root, specs, traceability, diagnostics);
  const normalizedDiagnostics = uniqueSorted(diagnostics);
  const snapshot = {
    schemaVersion: "1",
    commit,
    indexedAt,
    source,
    status: normalizedDiagnostics.length > 0 ? "partial" : "current",
    specs,
    documents,
    traceability,
    diagnostics: normalizedDiagnostics,
    provenance: {
      commit,
      source,
      observedAt: indexedAt,
      workingTree: { dirty: Boolean(dirty), materialPaths: materialDirtyPaths(dirtyPaths(dirty)) },
    },
  };
  return { ...snapshot, fingerprint: fingerprint(snapshot) };
}

function outboxPaths(root) {
  return {
    pending: resolve(root, ".prist/outbox/spec-sync.json"),
    receipt: resolve(root, ".prist/spec-sync-receipt.json"),
    connection: resolve(root, ".prist/connection.json"),
  };
}

async function writeAtomic(path, value) {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.${process.pid}.${randomUUID()}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  await rename(temporary, path);
}

function redact(value) {
  return String(value).replace(/Bearer\s+[^\s"']+/gi, "Bearer [redacted]")
    .replace(/((?:activation[_-]?token|credential|access[_-]?token|client[_-]?secret)\s*[:=]\s*)[^\s,"']+/gi, "$1[redacted]")
    .slice(0, 500);
}

async function queue(root, options) {
  const snapshot = await buildSnapshot(root);
  const pending = {
    schemaVersion: "1",
    operation: "sync_spec_snapshot",
    projectId: options.projectId,
    expectedSnapshotVersion: options.expectedSnapshotVersion,
    snapshot,
    queuedAt: new Date().toISOString(),
    attempts: 0,
  };
  await writeAtomic(outboxPaths(root).pending, pending);
  return pending;
}

async function jsonRequest(url, init) {
  const response = await fetch(url, init);
  const text = await response.text();
  let body;
  try { body = text ? JSON.parse(text) : {}; } catch { throw Object.assign(new Error("Prist returned invalid JSON."), { code: "invalid_response", status: response.status }); }
  if (!response.ok) throw Object.assign(new Error(body.error?.message ?? "Prist request failed."), { code: body.error?.code ?? String(response.status), status: response.status, details: body.error?.details });
  return body;
}

async function flush(root) {
  const paths = outboxPaths(root);
  let pending;
  try { pending = JSON.parse(await readFile(paths.pending, "utf8")); } catch (error) { if (error.code === "ENOENT") return { status: "empty" }; throw error; }
  const connection = JSON.parse(await readFile(paths.connection, "utf8"));
  const base = new URL(connection.apiBasePath, connection.origin);
  const headers = { Authorization: `Bearer ${connection.credential}`, "Content-Type": "application/json" };
  const send = (expectedSnapshotVersion) => jsonRequest(new URL(`${base.pathname}/spec-snapshot`, connection.origin), {
    method: "POST",
    headers,
    body: JSON.stringify({ snapshot: pending.snapshot, expectedSnapshotVersion }),
  });
  try {
    let receipt;
    try {
      receipt = await send(pending.expectedSnapshotVersion);
    } catch (error) {
      if (error.code !== "version_conflict") throw error;
      const context = await jsonRequest(new URL(`${base.pathname}/project-context`, connection.origin), { headers });
      const rebuilt = await buildSnapshot(root);
      if (rebuilt.fingerprint !== pending.snapshot.fingerprint) throw Object.assign(new Error("Repository changed during retry; queue a fresh snapshot."), { code: "repository_changed" });
      receipt = await send(context.canon.snapshotVersion);
    }
    if (receipt.projectId !== pending.projectId || receipt.fingerprint !== pending.snapshot.fingerprint) throw Object.assign(new Error("Sync receipt does not match pending snapshot."), { code: "receipt_mismatch" });
    await writeAtomic(paths.receipt, receipt);
    await unlink(paths.pending);
    return { status: "sent", receipt };
  } catch (error) {
    const retry = {
      ...pending,
      attempts: Number(pending.attempts ?? 0) + 1,
      lastError: { code: error.code ?? "unavailable", message: redact(error.message), observedAt: new Date().toISOString() },
    };
    await writeAtomic(paths.pending, retry);
    return { status: "pending", fingerprint: retry.snapshot.fingerprint, attempts: retry.attempts, error: retry.lastError };
  }
}

async function main() {
  const [command = "snapshot", ...args] = process.argv.slice(2);
  const { values } = parseArgs({ args, options: {
    root: { type: "string", default: "." },
    output: { type: "string" },
    "project-id": { type: "string" },
    "expected-version": { type: "string" },
  } });
  const root = resolve(values.root);
  let result;
  if (command === "snapshot") result = await buildSnapshot(root);
  else if (command === "queue" || command === "sync") {
    const expectedSnapshotVersion = Number(values["expected-version"]);
    if (!values["project-id"] || !Number.isInteger(expectedSnapshotVersion) || expectedSnapshotVersion < 0) throw new Error("queue/sync require --project-id and non-negative --expected-version.");
    result = await queue(root, { projectId: values["project-id"], expectedSnapshotVersion });
    if (command === "sync") result = await flush(root);
  } else if (command === "flush") result = await flush(root);
  else throw new Error(`Unknown command: ${command}`);
  if (values.output) await writeAtomic(resolve(values.output), result);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (result.status === "pending") process.exitCode = 3;
}

export { buildSnapshot, fingerprint };

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => {
    process.stderr.write(`${redact(error instanceof Error ? error.message : error)}\n`);
    process.exitCode = 1;
  });
}
