import assert from "node:assert/strict";
import test from "node:test";

import {
  finishBetaTestSession,
  flushBetaTelemetry,
  getBetaTestSession,
  discardBetaTestSession,
  startBetaTestSession,
  stopBetaTestSession,
  storedBetaSessionHasRecordedMilestone,
  betaSessionHasMilestone,
  type StoredBetaTestSession
} from "@/lib/beta-telemetry-client";

const runId = "123e4567-e89b-42d3-a456-426614174000";

test("a pending completion milestone is not presented as server-recorded", () => {
  const session = makeSession({
    pending: [{
      action: "observe",
      runId,
      kind: "MILESTONE",
      name: "SQUAD_RESTORED",
      route: "/machete/squad"
    }]
  });

  assert.equal(storedBetaSessionHasRecordedMilestone(session, "SQUAD_RESTORED"), false);
  session.recordedKeys.push("MILESTONE:SQUAD_RESTORED:/machete/squad");
  assert.equal(storedBetaSessionHasRecordedMilestone(session, "SQUAD_RESTORED"), true);
});

test("a pending completion milestone still selects the non-aborting finish path", { concurrency: false }, async () => {
  await withBrowser(async ({ requests, storage }) => {
    await startBetaTestSession({ synthetic: true });
    const session = getBetaTestSession();
    assert.ok(session);
    session.pending.push({
      action: "observe",
      runId,
      kind: "MILESTONE",
      name: "SQUAD_RESTORED",
      route: "/machete/squad"
    });
    storage.replaceOnlyValue(session);
    requests.length = 0;

    assert.equal(betaSessionHasMilestone("SQUAD_RESTORED"), true);
    assert.equal(await finishBetaTestSession(), true);
    assert.equal(requests.some((request) => request.name === "JOURNEY_ABORTED"), false);
  });
});

test("finish waits for an already active completion flush instead of reporting a false send failure", { concurrency: false }, async () => {
  await withBrowser(async ({ requests, storage, deferObserveRequests }) => {
    await startBetaTestSession({ synthetic: true });
    const session = getBetaTestSession();
    assert.ok(session);
    session.pending.push({
      action: "observe",
      runId,
      kind: "MILESTONE",
      name: "SQUAD_RESTORED",
      route: "/machete/squad"
    });
    storage.replaceOnlyValue(session);
    requests.length = 0;

    const release = deferObserveRequests();
    const activeFlush = flushBetaTelemetry();
    await Promise.resolve();
    const finish = finishBetaTestSession();
    release();

    await activeFlush;
    assert.equal(await finish, true);
    assert.equal(requests.some((request) => request.name === "JOURNEY_ABORTED"), false);
  });
});

test("finishing an acknowledged run clears it without recording JOURNEY_ABORTED", { concurrency: false }, async () => {
  await withBrowser(async ({ requests, storage }) => {
    await startBetaTestSession({ synthetic: true });
    const session = getBetaTestSession();
    assert.ok(session);
    session.recordedKeys.push("MILESTONE:SQUAD_RESTORED:/machete/squad");
    storage.replaceOnlyValue(session);
    requests.length = 0;

    assert.equal(await finishBetaTestSession(), true);
    assert.equal(getBetaTestSession(), null);
    assert.equal(requests.some((request) => request.name === "JOURNEY_ABORTED"), false);
  });
});

test("finishing keeps pending telemetry when the network does not acknowledge it", { concurrency: false }, async () => {
  await withBrowser(async ({ requests, storage, failRequests }) => {
    await startBetaTestSession({ synthetic: true });
    const session = getBetaTestSession();
    assert.ok(session);
    session.pending.push({
      action: "observe",
      runId,
      kind: "MILESTONE",
      name: "SQUAD_RESTORED",
      route: "/machete/squad"
    });
    storage.replaceOnlyValue(session);
    requests.length = 0;
    failRequests();

    assert.equal(await finishBetaTestSession(), false);
    assert.equal(getBetaTestSession()?.pending.length, 1);
    assert.equal(requests.some((request) => request.name === "JOURNEY_ABORTED"), false);
  });
});

test("aborting records JOURNEY_ABORTED and clears only after acknowledgement", { concurrency: false }, async () => {
  await withBrowser(async ({ requests }) => {
    await startBetaTestSession({ synthetic: true });
    requests.length = 0;

    assert.equal(await stopBetaTestSession(), true);
    assert.equal(getBetaTestSession(), null);
    assert.equal(requests.some((request) => request.name === "JOURNEY_ABORTED"), true);
  });
});

test("an explicit local discard clears an unsent run", { concurrency: false }, async () => {
  await withBrowser(async ({ failRequests }) => {
    await startBetaTestSession({ synthetic: true });
    failRequests();
    assert.equal(await stopBetaTestSession(), false);
    assert.ok(getBetaTestSession()?.pending.length);
    assert.equal(discardBetaTestSession(), true);
    assert.equal(getBetaTestSession(), null);
  });
});

function makeSession(overrides: Partial<StoredBetaTestSession> = {}): StoredBetaTestSession {
  return {
    version: 1,
    runId,
    startedAt: Date.now(),
    recordedKeys: ["MILESTONE:JOURNEY_STARTED:/beta-test"],
    pending: [],
    ...overrides
  };
}

async function withBrowser(
  callback: (context: {
    requests: Array<Record<string, unknown>>;
    storage: MemoryStorage;
    failRequests: () => void;
    deferObserveRequests: () => () => void;
  }) => Promise<void>
) {
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const originalFetch = Object.getOwnPropertyDescriptor(globalThis, "fetch");
  const originalCustomEvent = Object.getOwnPropertyDescriptor(globalThis, "CustomEvent");
  const storage = new MemoryStorage();
  const requests: Array<Record<string, unknown>> = [];
  let shouldFail = false;
  let observeGate: Promise<void> | null = null;
  let releaseObserveGate: (() => void) | null = null;

  Object.defineProperty(globalThis, "CustomEvent", {
    configurable: true,
    value: class TestCustomEvent {
      constructor(readonly type: string) {}
    }
  });
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      crypto: { randomUUID: () => runId },
      innerWidth: 390,
      location: { pathname: "/beta-test" },
      sessionStorage: storage,
      dispatchEvent: () => true
    }
  });
  Object.defineProperty(globalThis, "fetch", {
    configurable: true,
    value: async (_input: string | URL | Request, init?: RequestInit) => {
      const body = typeof init?.body === "string" ? JSON.parse(init.body) as Record<string, unknown> : {};
      requests.push(body);
      if (shouldFail) throw new Error("offline");
      if (body.action === "observe" && observeGate) await observeGate;
      return new Response("{}", { status: body.action === "start" ? 201 : 200, headers: { "content-type": "application/json" } });
    }
  });

  try {
    await callback({
      requests,
      storage,
      failRequests: () => { shouldFail = true; },
      deferObserveRequests: () => {
        observeGate = new Promise<void>((resolve) => { releaseObserveGate = resolve; });
        return () => {
          releaseObserveGate?.();
          releaseObserveGate = null;
          observeGate = null;
        };
      }
    });
  } finally {
    restoreGlobal("window", originalWindow);
    restoreGlobal("fetch", originalFetch);
    restoreGlobal("CustomEvent", originalCustomEvent);
  }
}

function restoreGlobal(name: "window" | "fetch" | "CustomEvent", descriptor: PropertyDescriptor | undefined) {
  if (descriptor) Object.defineProperty(globalThis, name, descriptor);
  else Reflect.deleteProperty(globalThis, name);
}

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>();

  get length() {
    return this.values.size;
  }

  clear() {
    this.values.clear();
  }

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  key(index: number) {
    return [...this.values.keys()][index] ?? null;
  }

  removeItem(key: string) {
    this.values.delete(key);
  }

  setItem(key: string, value: string) {
    this.values.set(key, value);
  }

  replaceOnlyValue(session: StoredBetaTestSession) {
    const key = this.key(0);
    if (!key) throw new Error("Expected a stored beta session.");
    this.setItem(key, JSON.stringify(session));
  }
}
