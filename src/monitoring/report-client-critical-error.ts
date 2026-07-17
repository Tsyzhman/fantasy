import { clientErrorRouteGroup, type ClientCriticalErrorKind } from "@/monitoring/client-critical-errors";

const reported = new Set<string>();

export function reportClientCriticalError(kind: ClientCriticalErrorKind) {
  try {
    const routeGroup = clientErrorRouteGroup(window.location.pathname);
    const dedupeKey = `${kind}:${routeGroup}`;
    if (reported.has(dedupeKey)) return;
    reported.add(dedupeKey);
    if (reported.size > 32) reported.delete(reported.values().next().value ?? dedupeKey);
    void fetch("/api/client-errors", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ kind, routeGroup }),
      credentials: "omit",
      referrerPolicy: "no-referrer",
      keepalive: true
    }).catch(() => undefined);
  } catch {
    // Observability must never create another user-visible failure.
  }
}
