"use client";

import type {
  BetaClientErrorName,
  BetaDeviceClass,
  BetaTestMilestone,
  BetaWebVitalName,
  BetaWebVitalRating
} from "@/beta/user-test";

const betaSessionStorageKey = "fantasy-beta-test-session-v1";
const betaSubmissionReceiptStorageKey = "fantasy-beta-test-submission-receipt-v1";
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

export type BetaTestSubmissionReceipt = {
  version: 1;
  participantCode: string;
  submittedAt: number;
};

let activeFlush: Promise<void> | null = null;

type BetaDeviceViewport = {
  viewportWidth: number;
  viewportHeight: number;
  coarsePointer: boolean;
  maxTouchPoints: number;
  mobileBrowser: boolean;
};

type BetaBrowserIdentity = {
  userAgentDataMobile: unknown;
  userAgent: string;
};

export function hasMobileBrowserSignal({ userAgentDataMobile, userAgent }: BetaBrowserIdentity) {
  if (typeof userAgentDataMobile === "boolean") return userAgentDataMobile;
  return /\b(?:iPhone|iPod)\b/i.test(userAgent) ||
    (/\bAndroid\b/i.test(userAgent) && /\bMobile\b/i.test(userAgent));
}

export function classifyBetaDevice({
  viewportWidth,
  viewportHeight,
  coarsePointer,
  maxTouchPoints,
  mobileBrowser
}: BetaDeviceViewport): BetaDeviceClass {
  if (viewportWidth < 768) return "mobile";
  const hasTouchInput = coarsePointer || maxTouchPoints > 0;
  const hasPhoneLandscapeGeometry =
    viewportWidth > viewportHeight && viewportWidth <= 960 && viewportHeight <= 500;
  return hasTouchInput && mobileBrowser && hasPhoneLandscapeGeometry ? "mobile" : "desktop";
}

export async function startBetaTestSession({ synthetic = false }: { synthetic?: boolean } = {}) {
  if (typeof window === "undefined") throw new Error("Beta test sessions can only start in a browser.");
  const runId = window.crypto.randomUUID();
  const viewportWidth = Math.round(window.innerWidth);
  const viewportHeight = Math.round(window.innerHeight);
  const navigatorWithUaData = window.navigator as Navigator & { userAgentData?: { mobile?: unknown } };
  const deviceClass = classifyBetaDevice({
    viewportWidth,
    viewportHeight,
    coarsePointer: window.matchMedia?.("(pointer: coarse)").matches ?? false,
    maxTouchPoints: window.navigator?.maxTouchPoints ?? 0,
    mobileBrowser: hasMobileBrowserSignal({
      userAgentDataMobile: navigatorWithUaData.userAgentData?.mobile,
      userAgent: window.navigator.userAgent
    })
  });
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

export function betaSessionHasRecordedMilestone(name: BetaTestMilestone) {
  const session = getBetaTestSession();
  return session ? storedBetaSessionHasRecordedMilestone(session, name) : false;
}

export function storedBetaSessionHasRecordedMilestone(session: StoredBetaTestSession, name: BetaTestMilestone) {
  const prefix = `MILESTONE:${name}:`;
  return session.recordedKeys.some((key) => key.startsWith(prefix));
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
  if (typeof window === "undefined") return true;
  if (!getBetaTestSession()) return true;
  await recordBetaMilestone("JOURNEY_ABORTED");
  await flushBetaTelemetry();
  const session = getBetaTestSession();
  if (session?.pending.length) return false;
  if (session && !(await submitBetaTestSession(session))) return false;
  clearBetaTestSession();
  return true;
}

export async function finishBetaTestSession() {
  if (typeof window === "undefined") return true;
  await flushBetaTelemetry();
  const session = getBetaTestSession();
  if (!session) return true;
  if (session.pending.length || !storedBetaSessionHasRecordedMilestone(session, "SQUAD_RESTORED")) return false;
  if (!(await submitBetaTestSession(session))) return false;
  clearBetaTestSession();
  return true;
}

async function submitBetaTestSession(session: StoredBetaTestSession) {
  let response: Response;
  try {
    response = await fetch("/api/beta/telemetry", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      cache: "no-store",
      keepalive: true,
      body: JSON.stringify({ action: "finish", runId: session.runId })
    });
  } catch {
    return false;
  }
  return response.ok;
}

export function discardBetaTestSession() {
  if (typeof window === "undefined" || !getBetaTestSession()) return false;
  clearBetaTestSession();
  return true;
}

export function rememberBetaTestSubmissionReceipt(runId: string) {
  if (typeof window === "undefined") return;
  const receipt: BetaTestSubmissionReceipt = {
    version: 1,
    participantCode: runId.slice(0, 8),
    submittedAt: Date.now()
  };
  window.sessionStorage.setItem(betaSubmissionReceiptStorageKey, JSON.stringify(receipt));
}

export function consumeBetaTestSubmissionReceipt(): BetaTestSubmissionReceipt | null {
  if (typeof window === "undefined") return null;
  const raw = window.sessionStorage.getItem(betaSubmissionReceiptStorageKey);
  window.sessionStorage.removeItem(betaSubmissionReceiptStorageKey);
  if (!raw) return null;
  try {
    const receipt = JSON.parse(raw) as Partial<BetaTestSubmissionReceipt>;
    if (
      receipt.version !== 1 ||
      typeof receipt.participantCode !== "string" ||
      !/^[0-9a-f]{8}$/i.test(receipt.participantCode) ||
      typeof receipt.submittedAt !== "number" ||
      !Number.isFinite(receipt.submittedAt)
    ) return null;
    return receipt as BetaTestSubmissionReceipt;
  } catch {
    return null;
  }
}

export function flushBetaTelemetry() {
  if (typeof window === "undefined") return Promise.resolve();
  if (activeFlush) return activeFlush;
  activeFlush = drainBetaTelemetry().finally(() => {
    activeFlush = null;
  });
  return activeFlush;
}

async function drainBetaTelemetry() {
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

function clearBetaTestSession() {
  window.sessionStorage.removeItem(betaSessionStorageKey);
  notifySessionChanged();
}

function observationKey(command: Pick<ObserveCommand, "kind" | "name" | "route">) {
  return `${command.kind}:${command.name}:${command.route}`;
}

function currentRoute() {
  return typeof window === "undefined" ? "/" : window.location.pathname;
}
