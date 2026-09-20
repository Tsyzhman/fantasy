/** @spec spec://modules/khl/INFRA-001-khl-data-ingestion#protocols */
import { execFile } from "node:child_process";
import { resolve } from "node:path";

export async function fetchKhlProtocol(season: string, match: string, signal: AbortSignal) {
  if (!/^\d{1,10}$/.test(season) || !/^\d{1,12}$/.test(match)) throw new Error("PROTOCOL_SCOPE_INVALID");
  const url = `https://www.khl.ru/game/${season}/${match}/protocol/`;
  if (process.env.KHL_PROTOCOL_TRANSPORT === "rest") {
    const html = await new Promise<string>((accept, reject) => {
      execFile(process.env.KHL_HTTP_PYTHON ?? "/opt/khl-http/bin/python3", [resolve("scripts/khl-protocol-http.py"), season, match],
        { signal, timeout: 55000, killSignal: "SIGKILL", maxBuffer: 5 * 1024 * 1024, encoding: "utf8", windowsHide: true },
        (error, stdout, stderr) => {
          if (error) reject(new Error(/^PROTOCOL_[A-Z0-9_]+$/.test(stderr.trim()) ? stderr.trim() : "PROTOCOL_TRANSPORT_FAILED"));
          else accept(stdout);
        });
    });
    return { html, url };
  }
  const response = await fetch(url, { signal: AbortSignal.any([signal, AbortSignal.timeout(30000)]), redirect: "error", cache: "no-store" });
  if (!response.ok) { await response.body?.cancel(); throw new Error(`PROTOCOL_HTTP_${response.status}`); }
  const reader = response.body?.getReader();
  if (!reader) throw new Error("PROTOCOL_BODY_UNAVAILABLE");
  const chunks: Uint8Array[] = []; let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read(); if (done) break;
      size += value.byteLength;
      if (size > 5 * 1024 * 1024) throw new Error("PROTOCOL_BODY_TOO_LARGE");
      chunks.push(value);
    }
  } finally { await reader.cancel(); }
  return { html: Buffer.concat(chunks).toString("utf8"), url };
}
