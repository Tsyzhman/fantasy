import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

const workspaceRoot = process.cwd();
const sourceRoot = path.join(workspaceRoot, "extensions", "sports-squad-transfer");
const outputRoot = path.join(workspaceRoot, "output", "browser-extension");
const downloadsRoot = path.join(workspaceRoot, "public", "downloads");
const sharedFiles = ["background.js", "content.js"];
const targets = [
  { name: "chromium", manifest: "manifest.chromium.json" },
  { name: "firefox", manifest: "manifest.firefox.json" }
];

const baseManifest = await readJson(path.join(sourceRoot, "manifest.base.json"));
for (const target of targets) {
  const targetRoot = path.join(outputRoot, target.name);
  assertBoundedTarget(targetRoot, outputRoot);
  await rm(targetRoot, { recursive: true, force: true });
  await mkdir(targetRoot, { recursive: true });

  const targetManifest = await readJson(path.join(sourceRoot, target.manifest));
  const manifest = deepMerge(baseManifest, targetManifest);
  const entries = [
    {
      name: "manifest.json",
      data: Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`, "utf8")
    }
  ];
  for (const fileName of sharedFiles) {
    entries.push({
      name: fileName,
      data: await readFile(path.join(sourceRoot, fileName))
    });
  }
  for (const entry of entries) {
    await writeFile(path.join(targetRoot, entry.name), entry.data);
  }

  await mkdir(downloadsRoot, { recursive: true });
  const archiveName = `fantasy-sports-transfer-${target.name}.zip`;
  await writeFile(path.join(downloadsRoot, archiveName), createStoredZip(entries));
  console.log(`Built ${target.name} extension ${manifest.version}: public/downloads/${archiveName}`);
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

function deepMerge(base, override) {
  const result = { ...base };
  for (const [key, value] of Object.entries(override)) {
    if (isRecord(result[key]) && isRecord(value)) result[key] = deepMerge(result[key], value);
    else result[key] = value;
  }
  return result;
}

function isRecord(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function assertBoundedTarget(target, parent) {
  const relative = path.relative(path.resolve(parent), path.resolve(target));
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`Refusing to clean unbounded extension target: ${target}`);
  }
}

function createStoredZip(entries) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;
  for (const entry of entries) {
    const name = Buffer.from(entry.name, "utf8");
    const data = Buffer.from(entry.data);
    const checksum = crc32(data);
    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(0, 6);
    localHeader.writeUInt16LE(0, 8);
    localHeader.writeUInt16LE(0, 10);
    localHeader.writeUInt16LE(33, 12);
    localHeader.writeUInt32LE(checksum, 14);
    localHeader.writeUInt32LE(data.length, 18);
    localHeader.writeUInt32LE(data.length, 22);
    localHeader.writeUInt16LE(name.length, 26);
    localHeader.writeUInt16LE(0, 28);
    localParts.push(localHeader, name, data);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(0x0314, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(0, 8);
    centralHeader.writeUInt16LE(0, 10);
    centralHeader.writeUInt16LE(0, 12);
    centralHeader.writeUInt16LE(33, 14);
    centralHeader.writeUInt32LE(checksum, 16);
    centralHeader.writeUInt32LE(data.length, 20);
    centralHeader.writeUInt32LE(data.length, 24);
    centralHeader.writeUInt16LE(name.length, 28);
    centralHeader.writeUInt16LE(0, 30);
    centralHeader.writeUInt16LE(0, 32);
    centralHeader.writeUInt16LE(0, 34);
    centralHeader.writeUInt16LE(0, 36);
    centralHeader.writeUInt32LE((0o100644 << 16) >>> 0, 38);
    centralHeader.writeUInt32LE(offset, 42);
    centralParts.push(centralHeader, name);
    offset += localHeader.length + name.length + data.length;
  }

  const centralDirectory = Buffer.concat(centralParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);
  return Buffer.concat([...localParts, centralDirectory, end]);
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}
