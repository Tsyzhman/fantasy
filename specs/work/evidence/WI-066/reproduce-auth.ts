// Read-only reproduction against exported helpers and an in-memory database stub.
import { isSafeRedirectPath } from "../../../../src/lib/auth";
import { recordFailedAuthAttempt } from "../../../../src/lib/auth-rate-limit";

async function main() {
  const destination = "/\\audit.invalid";
  const openRedirect = {
    input: destination,
    accepted: isSafeRedirectPath(destination),
    resolvedOrigin: new URL(destination, "https://fantasy.tsyzhman.ru").origin,
  };
  let failedCount = 0;
  let lockedUntil: Date | null = null;
  let row: { failedCount: number; lastFailedAt: Date; lockedUntil: Date | null } | null = null;
  const database = {
    async $queryRaw() { return row ? [{ ...row }] : []; },
    async $executeRaw(_sql: TemplateStringsArray, ...values: unknown[]) {
      failedCount = values[3] as number;
      lockedUntil = values[5] as Date | null;
      row = { failedCount, lastFailedAt: values[4] as Date, lockedUntil };
      return 1;
    },
  };
  await Promise.all(Array.from({ length: 10 }, () => recordFailedAuthAttempt(
    database as never,
    [{ action: "login:ip", subject: "192.0.2.1" }],
  )));
  const concurrentFailures = { attempts: 10, storedFailedCount: failedCount, lockedUntil };
  row = null;
  failedCount = 0;
  lockedUntil = null;
  for (let i = 0; i < 10; i++) {
    await recordFailedAuthAttempt(database as never, [{ action: "login:ip", subject: "192.0.2.1" }]);
  }
  console.log(JSON.stringify({ openRedirect, concurrentFailures, sequentialControl: { attempts: 10, storedFailedCount: failedCount, locked: lockedUntil !== null } }, null, 2));
}

void main();
