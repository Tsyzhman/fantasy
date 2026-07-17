export const clientCriticalErrorKinds = [
  "WINDOW_ERROR",
  "UNHANDLED_REJECTION",
  "REACT_ERROR_BOUNDARY"
] as const;

export const clientCriticalErrorRouteGroups = [
  "root",
  "login",
  "setup",
  "machete",
  "admin",
  "beta-test",
  "other"
] as const;

export type ClientCriticalErrorKind = (typeof clientCriticalErrorKinds)[number];
export type ClientCriticalErrorRouteGroup = (typeof clientCriticalErrorRouteGroups)[number];

export type ClientCriticalErrorPayload = {
  kind: ClientCriticalErrorKind;
  routeGroup: ClientCriticalErrorRouteGroup;
};

export function parseClientCriticalErrorPayload(value: unknown): ClientCriticalErrorPayload | null {
  if (!isRecord(value)) return null;
  const keys = Object.keys(value);
  if (keys.length !== 2 || !keys.includes("kind") || !keys.includes("routeGroup")) return null;
  if (!clientCriticalErrorKinds.includes(value.kind as ClientCriticalErrorKind)) return null;
  if (!clientCriticalErrorRouteGroups.includes(value.routeGroup as ClientCriticalErrorRouteGroup)) return null;
  return { kind: value.kind as ClientCriticalErrorKind, routeGroup: value.routeGroup as ClientCriticalErrorRouteGroup };
}

export function clientErrorRouteGroup(pathname: string): ClientCriticalErrorRouteGroup {
  const firstSegment = pathname.split("/").filter(Boolean)[0] ?? "";
  if (!firstSegment) return "root";
  if (clientCriticalErrorRouteGroups.includes(firstSegment as ClientCriticalErrorRouteGroup) && firstSegment !== "other" && firstSegment !== "root") {
    return firstSegment as ClientCriticalErrorRouteGroup;
  }
  return "other";
}

export function clientErrorWindowMinutes(value: string | undefined) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 5 && parsed <= 1_440 ? parsed : 60;
}

export function clientErrorWindowStart(now: Date, windowMinutes: number) {
  const exactCutoff = now.getTime() - windowMinutes * 60_000;
  return new Date(Math.floor(exactCutoff / 60_000) * 60_000);
}

let requestWindowMinute = -1;
let requestWindowCount = 0;

export function acceptClientErrorRequest(now = Date.now(), maximumRequestsPerMinute = 120) {
  const minute = Math.floor(now / 60_000);
  if (minute !== requestWindowMinute) {
    requestWindowMinute = minute;
    requestWindowCount = 0;
  }
  if (requestWindowCount >= maximumRequestsPerMinute) return false;
  requestWindowCount += 1;
  return true;
}

export function resetClientErrorRequestLimitForTests() {
  requestWindowMinute = -1;
  requestWindowCount = 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
