# WI-085: Telegram consent, deadlines and fenced recovery

- Kind: `fix`
- Canon action: `none`

## Outcome

Prevent revoked, stale or duplicate deadline deliveries and enforce the 08:50 Moscow cutoff.

## Specs

- Governing: `spec://modules/telegram/INFRA-005-deadline-pipeline#delivery`
- Governing: `spec://modules/telegram/INFRA-005-deadline-pipeline#data`
- Governing: `spec://modules/telegram/INFRA-005-deadline-pipeline#pipeline`
- Governing: `spec://modules/telegram/INFRA-005-deadline-pipeline#recovery`
- Governing: `spec://modules/telegram/FEAT-007-deadline-assistant#linking`
- Constraint: `spec://common/INFRA-006-continuous-deployment#root`

## Scope

- In: Delivery consent/campaign checks, revoke pending sends, cutoff, abandoned lease recovery and publication fencing; reproduce related Telegram limiter/inbox risks if bounded.
- Out: unrelated work, interface capability removal, unreviewed production mutations.

## Acceptance

- [x] No real Telegram sends; normal active delivery once, revoked delivery never, cutoff boundaries, expired lease unknown/no resend, stale stage cannot publish.
- [x] Changed BUILT/DELIVERING inputs invalidate unsent text atomically, rebuild for the new date/version, and never repeat sent/unknown parts.
- [x] Production polling recovers failed/abandoned inbox entries, preserves a newer consent command, and never replays an unknown service-reply send.
- [x] Applicable tests pass and before/after evidence is recorded.

## Dependencies

- Related: WI-084

## Result

Ready for root integration; operational status/archive are intentionally left to the coordinating chat.

- Before → after: 16:50 cutoff → 08:50 Moscow; stale tick time → live clock through scheduler/stages/build/delivery and checks after pool/query/lock waits.
- Before → after: revoked/cancelled/blocked deliveries could send → current campaign version, active consent/link version and current enabled tournament subscription are checked; pause/unlink/unsubscribe cancel queued parts without reviving them on resume.
- Before → after: abandoned SENDING was stranded or mislabelled EXPIRED → bounded recovery preserves DELIVERY_UNKNOWN without automatic resend.
- Before → after: reports/snapshots/outbox could publish before the final lease check → version/token/status/live lease fence and publication commit together under row locks.
- Before → after: changed BUILT/DELIVERING schedules kept today's text → atomic version invalidation quarantines unsent parts as STALE, creates the new stages/report version and delivery date, and retains sent/unknown tombstones.
- Before → after: concurrent first limiter attempts could exceed quota; FAILED/PENDING inbox entries were lost behind the polling offset → bucket materialization precedes locking; bounded durable inbox replay uses a timestamp lease, atomic DB command completion and a newer-command check. Service replies are sent once after durable completion.
- Follow-up before → after: a newer whitespace-padded /stop was invisible to the ordering query; kicked events were outside that predicate → SQL normalizes the full String.trim whitespace set and orders both command and kicked events under the same link lock. FAILED and abandoned PROCESSING replays preserve PAUSED/BLOCKED; unrecognized command boundaries do not suppress valid older commands.
- Verification: 64/64 targeted PostgreSQL integration tests; 37 unit tests passed, 1 existing Unix-socket test skipped on Windows; the four polling unit tests were rechecked after the normalization follow-up. Targeted ESLint and git diff --check passed. Full typecheck/build/Linux runtime/rollout remain the root release gate. No schema/package changes, Git staging/commit/push, production mutations or real Telegram sends.
- Evidence: [WI-085 evidence](evidence/WI-085/README.md). Temporary baseline source/test copies and duplicate diagnostic logs removed. Isolated PostgreSQL stopped; zero test Node processes remain. Its 71.73 MiB synthetic directory remains because automatic tool approval rejected recursive removal as blocked by policy.

