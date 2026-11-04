# WI-085 verification — 2026-11-04

Checkout: `C:/Users/Nik/.codex/worktrees/audit-20261104/fantasy_export`, branch `codex/project-audit-20261104`. Work was limited to deadline-reports, Telegram, their tests, this evidence and WI-085. Canon action: none. Shared tracking, package/schema, release metadata and deployment belong to the coordinator. Production code/tests are stable.

## Before and after

| Before | After | Evidence |
|---|---|---|
| 530 minutes were added on top of hour 8, yielding 16:50 Moscow | 08:50 Moscow / 05:50 UTC; retries stop at the actual cutoff | DB cutoff test |
| Batch/tick timestamps survived slow stages, DB reads, authorization and pool waits | One live clock reaches scheduler, stages, build and delivery; final time checks occur after waits | DB delayed-query, scheduler, pool and lock tests |
| CANCELLED/BLOCKED campaigns and deleted/disabled subscriptions could still send | Current campaign/version, enabled subscription, consent and link version are checked before sender | delivery-before.txt: 7 failures; db-regressions-after.txt: passed |
| Pause left PENDING in the queue, allowing resume to resurrect it | Pause/unlink/block/unsubscribe cancel queued parts; stale builders cannot restore revoked consent | DB lifecycle and pause-during-build tests |
| Abandoned SENDING remained stranded or was overwritten as EXPIRED | At most 500 abandoned claims per recovery pass become DELIVERY_UNKNOWN; live sends remain SENDING; unknown sends are never retried | DB recovery/timeout/expiry tests |
| Final stage lease checking occurred after report/outbox/snapshot effects | Campaign/version, token, RUNNING status and current lease are fenced under locks before publication, including after pool/lock waits | DB publication, rollback and successor-claim tests |
| BUILT/DELIVERING schedule updates left old reportDate, stages and sendable text | Version and unsent invalidation commit atomically; STALE parts await the new report/date; started reports never acquire correction deliveries | DB moved campaign and sent/unknown preservation tests |
| The first limiter SELECT could not lock an absent row | INSERT ON CONFLICT DO NOTHING materializes the shared bucket before FOR UPDATE | concurrency-before.txt: 3 admitted for a limit of 2; fixed test: exactly 2 |
| FAILED was treated as DUPLICATE; polling advanced beyond it; a crash after receipt stranded PENDING | Polling replays up to 100 recoverable durable entries before getUpdates, with a 30-second failed backoff and 2-minute processing lease | DB real polling retry/crash/live-claim tests |
| A replayed old /resume could override a later /stop; command effects and inbox completion could split | Receipt and DB command effects commit together; state-command row locking and later processed intent protect the newer command | DB completion-failure rollback and superseded-command tests |
| A padded /stop executed after trim but did not match the ordering query; kicked events were absent from the query | SQL trims the ECMAScript whitespace set and checks both normalized state commands and kicked events for the affected chat under the link lock | consent-normalization-before.txt: 8 failures; consent-normalization-after.txt: 25 passed |
| Replaying a command could repeat a service reply with an unknown outcome | Replies are deferred until durable completion, then attempted once; a crash in that gap may lose a reply and will not repeat it | DB unknown service-reply test |

No real Telegram sends occurred: every delivery/update/polling test uses a fake sender or fake getUpdates. Existing render, source, settings and command capabilities are preserved. No automatic correction or unknown-send retry was introduced. Outbox CANCELLED tombstones are never reopened; only input-invalidated STALE parts can reopen under a valid new publication. State-command ordering uses the affected link row, so one chat's poison update does not block other chats.

## Checks

- `db-regressions-after.txt`: final 64 tests passed, zero failures/skips; seven focused DB test files on an isolated PostgreSQL 16 cluster. All 61 repository migrations applied to that empty test database. Database timezone UTC, matching CI. Initial initdb inherited the Windows timezone; the test database was explicitly switched to UTC before final runs.
- `unit-tests.txt`: 37 passed; the existing Unix-socket transport test is skipped on Windows and remains for Linux CI.
- `consent-normalization-unit.txt`: four polling unit tests rechecked after the follow-up, all passed. The DB follow-up covers FAILED and abandoned PROCESSING, trailing space, newlines, Unicode whitespace, kicked events whose actor differs from the affected chat, and non-command suffix boundaries (including U+200B, which trim does not remove).
- `eslint.txt`: targeted checks passed with zero warnings. `git diff --check` passed for owned source trees.
- Full repository typecheck/build and Linux CI/runtime gates are intentionally performed by the coordinating chat. These local checks do not constitute deployment validation.

Exact final DB command (PowerShell, from this checkout; the temporary server has since been stopped):

```powershell
$env:DATABASE_URL = 'postgresql://wi085@127.0.0.1:55485/wi085_test?schema=public'
& node_modules/.bin/tsx.cmd --test --test-timeout=20000 --test-concurrency=1 src/server/deadline-reports/campaigns.db-test.ts src/server/deadline-reports/delivery.db-test.ts src/server/deadline-reports/publication.db-test.ts src/server/telegram/link-service.db-test.ts src/server/telegram/rate-limit.db-test.ts src/server/telegram/updates.db-test.ts src/server/telegram/polling.db-test.ts
```

For another isolated database, use its DATABASE_URL and the same file list; migrate that empty test database first. The URL above was a loopback-only, trust-authenticated synthetic cluster and contains no production credential. Do not point integration tests at production.

## Resources and compatibility

`resources-before-stop.json` recorded zero remaining test Node processes. The temporary PostgreSQL process group had a summed RSS of 97.13 MiB (shared pages can be counted more than once) and 71.51 MiB of synthetic cluster files. It was stopped after final DB checks and confirming zero other connections to its database. Its absolute path/listener were verified. `resources-after-stop.json` confirms zero test Node processes, the PostgreSQL process stopped and port 55485 closed; the final retained size after shutdown/checkpoint is 71.72 MiB. The directory `C:/Users/Nik/AppData/Local/Temp/fantasy-wi085-pg-20261104` remains: automatic tool approval rejected native PowerShell recursive removal with `blocked by policy`; removal was not attempted through another mechanism. Temporary original-source replay copies and redundant diagnostic logs were removed. No production cache, persistent user data, other app or other agent process was cleaned.

No migration is required: state fields are strings and all fencing/version/timestamp fields already exist. PROCESSING uses processedAt as attempt start until terminal completion; compare-and-swap fences its owner. Existing nested DB callbacks join the inbox processing transaction; no HTTP is performed inside it. STALE is used solely for prepared, unsent text invalidated by changed input. Report versions follow campaign input versions and preserve previous report records. Keep the single-worker promotion/drain rule: an old worker must not continue publishing during promotion. Legacy pending report versions that disagree with campaign input versions now fail closed; they must not be forcibly resent. Root owns production inspection/reconciliation.

For the normalization follow-up, the same isolated cluster was restarted, then stopped again after its checks. `consent-resources-after-stop.json` confirms zero test Node processes, port 55485 closed and no postmaster PID file. Retained synthetic files are now 71.73 MiB; previously rejected recursive cleanup was not retried.

## Sources checked before implementation

Initial searches included Reddit outbox/Telegram retry discussions and Stack Overflow inbox/outbox concurrency questions. Technical decisions use primary PostgreSQL and Telegram documentation:

- [PostgreSQL row locking](https://www.postgresql.org/docs/17/explicit-locking.html)
- [PostgreSQL Read Committed isolation](https://www.postgresql.org/docs/17/transaction-iso.html)
- [PostgreSQL INSERT / ON CONFLICT](https://www.postgresql.org/docs/16/sql-insert.html)
- [PostgreSQL string functions / btrim](https://www.postgresql.org/docs/16/functions-string.html)
- [ECMAScript String.trim](https://tc39.es/ecma262/multipage/text-processing.html#sec-string.prototype.trim)
- [Telegram sendMessage](https://core.telegram.org/bots/api#sendmessage)
- [Telegram getUpdates](https://core.telegram.org/bots/api#getupdates)
- [Stack Overflow inbox precedent](https://stackoverflow.com/questions/79044538/how-does-inbox-worker-mechanism-work-in-the-masstransit)

The installed Next documentation `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/fetch.md` was read before source edits. No Next route/UI/cache behavior was changed by this work.
