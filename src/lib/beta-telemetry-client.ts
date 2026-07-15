"use client";

import type {
  BetaClientErrorName,
  BetaDeviceClass,
  BetaTestMilestone,
  BetaWebVitalName,
  BetaWebVitalRating
} from "@/beta/user-test";

const betaSessionStorageKey = "fantasy-beta-test-session-v1";
export const betaSessionChangedEvent = "fantasy-beta-test-session-changed";

type ObserveCommand = {
  action: "observe";
  runId: string;
  kind: "MILESTONE" | "PAGE_VIEW" | "WEB_VITAL" | "CLIENT_ERROR";
  name: string;
  route: string;
  value?: number;
  rating?: BetaWebVitalRating;
};

export type StoredBetaTestSession = {
  version: 1;
  runId: string;
  startedAt: number;
  recordedKeys: string[];
  pending: ObserveCommand[];
};

let flushing = false;

export async function startBetaTestSession({ synthetic = false }: { synthetic?: boolean } = {}) {
  if (typeof window === "undefined") throw new Error("Beta test sessions can only start in a browser.");
  const runId = window.crypto.randomUUID();
  const viewportWidth = Math.round(window.innerWidth);
  const deviceClass: BetaDeviceClass = viewportWidth < 768 ? "mobile" : "desktop";
  const response = await fetch("/api/beta/telemetry", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    cache: "no-store",
    body: JSON.stringify({ action: "start", runId, deviceClass, viewportWidth, synthetic })
  });
  if (!response.ok) throw new Error("BETA_TEST_START_FAILED");
  const session: StoredBetaTestSession = {
    version: 1,
    runId,
    startedAt: Date.now(),
    recordedKeys: [observationKey({ kind: "MILESTONE", name: "JOURNEY_STARTED", route: "/beta-test" })],
    pending: []
  };
  writeSession(session);
  return session;
}

export function getBetaTestSession() {
  if (typeof window === "undefined") return null;
  try {
    const parsed = JSON.parse(window.sessionStorage.getItem(betaSessionStorageKey) ?? "null") as Partial<StoredBetaTestSession> | null;
    if (
      !parsed ||
      parsed.version !== 1 ||
      typeof parsed.runId !== "string" ||
      typeof parsed.startedAt !== "number" ||
      !Array.isArray(parsed.recordedKeys) ||
      !Array.isArray(parsed.pending)
    ) return null;
    return parsed as StoredBetaTestSession;
  } catch {
    return null;
  }
}

export function betaSessionHasMilestone(name: BetaTestMilestone) {
  const session = getBetaTestSession();
  if (!session) return false;
  const prefix = `MILESTONE:${name}:`;
  return session.recordedKeys.some((key) => key.startsWith(prefix)) || session.pending.some((command) => observationKey(command).startsWith(prefix));
}

export function recordBetaMilestone(name: Exclude<BetaTestMilestone, "JOURNEY_STARTED">, route = currentRoute()) {
  return enqueueObservation({ action: "observe", runId: "", kind: "MILESTONE", name, route });
}

export function recordBetaPageView(route = currentRoute()) {
  return enqueueObservation({ action: "observe", runId: "", kind: "PAGE_VIEW", name: "ROUTE", route });
}

export function recordBetaWebVital(name: BetaWebVitalName, value: number, rating: BetaWebVitalRating, route = currentRoute()) {
  return enqueueObservation({ action: "observe", runId: "", kind: "WEB_VITAL", name, route, value, rating });
}

export function recordBetaClientError(name: BetaClientErrorName, route = currentRoute()) {
  return enqueueObservation({ action: "observe", runId: "", kind: "CLIENT_ERROR", name, route });
}

export async function stopBetaTestSession() {
  if (typeof window === "undefined") return;
  await recordBetaMilestone("JOURNEY_ABORTED");
  await flushBetaTelemetry();
  window.sessionStorage.removeItem(betaSessionStorageKey);
  notifySessionChanged();
}

export async function flushBetaTelemetry() {
  if (typeof window === "undefined" || flushing) return;
  flushing = true;
  try {
    while (true) {
      const session = getBetaTestSession();
      const command = session?.pending[0];
      if (!session || !command) return;
      let response: Response;
      try {
        response = await fetch("/api/beta/telemetry", {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          cache: "no-store",
          keepalive: true,
          body: JSON.stringify(command)
        });
      } catch {
        return;
      }
      if (!response.ok) return;
      const latest = getBetaTestSession();
      if (!latest || latest.runId !== session.runId) return;
      const key = observationKey(command);
      latest.pending = latest.pending.filter((item) => observationKey(item) !== key);
      if (!latest.recordedKeys.includes(key)) latest.recordedKeys.push(key);
      writeSession(latest);
    }
  } finally {
    flushing = false;
  }
}

async function enqueueObservation(command: ObserveCommand) {
  const session = getBetaTestSession();
  if (!session) return;
  const withRunId = { ...command, runId: session.runId };
  const key = observationKey(withRunId);
  if (session.recordedKeys.includes(key) || session.pending.some((item) => observationKey(item) === key)) return;
  session.pending.push(withRunId);
  if (session.pending.length > 50) session.pending = session.pending.slice(-50);
  writeSession(session);
  await flushBetaTelemetry();
}

function writeSession(session: StoredBetaTestSession) {
  window.sessionStorage.setItem(betaSessionStorageKey, JSON.stringify(session));
  notifySessionChanged();
}

function notifySessionChanged() {
  window.dispatchEvent(new CustomEvent(betaSessionChangedEvent));
}

function observationKey(command: Pick<ObserveCommand, "kind" | "name" | "route">) {
  return `${command.kind}:${command.name}:${command.route}`;
}

function currentRoute() {
  return typeof window === "undefined" ? "/" : window.location.pathname;
}
