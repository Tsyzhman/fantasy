# WI-001 verification — 2026-09-07

## Implemented behavior

Previously the planner had balanced/reliable/upside selection, without a provider-bound global context or a whole-plan strategy loss budget. GLOBAL_AUTO now adds versioned K, separate EP/strategy scoring, per-round XI/captain exposures, an EP baseline retained across candidate search, no-op comparison and paid-transfer penalties. Existing modes retain their original scoring path.

The server loads coherent provider standings/calendar/history, verifies the user's linked profile and provider squad, returns fresh ownership keyed by provider player ID, and stores unique common/personal state. FPL create/update and repair sync now persist ownership. API/UI/Worker carry revisions and reject expired results. Saved filters preserve unrelated preferences and explicit squad binding. Legacy player pools receive provider IDs when rebuilt sequentially; until then incomplete mappings produce an explained fallback.

Prisma models and additive migration: `prisma/migrations/20260907000000_global_strategy`. Recommendation audit is compact and idempotent by input/config/round, retained for 60 days on subsequent writes. Forecast evidence is explicitly `CLIENT_EP_REPORTED`, not a server-verified forecast.

## Automated and schema checks

- Pure math: five published examples, exact arithmetic and displayed rounding; monotonic rank/gap/urgency for 500 and 10,506,303 entrants; invalid/stale/neutral/finished cases; no mutation; zero and negative score history.
- Optimizer: whole-XI loss budget, per-round captain, mapping/ownership/expiry fallback, no-op and paid penalties, a permitted small negative EP transfer, and retention of the true EP baseline when keeping the squad.
- FPL sync mock invokes the real sync function: ownership 0/100 on create, changes on update, idempotent rerun and one-time repair of the old successful sync format. This is not a real database repair run.
- Provider contract fixtures: full FPL calendar, Overall discovery, coherent entry/history, exact-deadline invalidation, exact relay allowlist, rate limiting and bounded transient retries.
- Cache: three rounds of 1,800 insertions exercise bounded count/bytes, TTL eviction, in-flight deduplication and permit release. At most two source loaders per provider. Limits: common 32 entries/1 MiB, personal 256 entries/2 MiB, bounded wait queue 32.
- Prisma validate/generate passed. Generated migration SQL was compared with the declared schema, including truncated unique-index names. Migration execution and real DB constraints remain unverified.
- Final `npm run check` exited 0: version check; 1,036 tests / 1,035 passed / 1 skipped / 0 failed; lint 0 errors and 5 pre-existing warnings; typecheck; production build; standalone sanitization. This includes the apply-time expiry/revision regression and saved-filter compatibility regression. Local detailed log: `.tmp/global-strategy-final-check.log`.
- `git diff --check` passed. Spec-space snapshot reported `current` with no diagnostics. Local identity `specs/.me` is Git-ignored.

## Live source evidence and limits

`src/server/__fixtures__/global-strategy-sports.json` is an anonymized live Sports.ru capture. Current RPL has 30 rounds and 18,951 entrants; round 7 was IN_PROGRESS. Leader points were 487. Six completed round scores were 90, 66, 64, 78, 57, 68, giving ER 70.5. The fixture regression expects `STANDINGS_RECALCULATING` while the round is live. Competitor names/profile IDs are not retained.

Official FPL bootstrap returned HTTP 503. The configured relay path requires an unavailable local Docker/Linux environment. A live READY FPL context and actual relay round trip have not been verified.

The configured PostgreSQL endpoint localhost:5433 was unavailable: Prisma migrate status failed, and Docker Desktop's Linux-engine pipe remained absent after an attempted local startup. No migration, database cleanup, ownership repair or provider-bound end-to-end check was performed against the real database.

## Performance, memory and UI evidence

`WI-001-performance.json` contains 2 warmups and 20 measured runs for each provider label, on deterministic **synthetic** pools of 120 players. p95 GLOBAL_AUTO/baseline ratios: FPL 2.01735, Sports.ru 1.80709. These satisfy the synthetic 2.5x guard, but do not satisfy the spec's saved real-provider pool benchmark.

Repeated post-GC heap samples stabilize near 9.13 MB (FPL) and 9.17 MB (Sports.ru) in this run. Cache tests separately verify expiry/eviction cleanup and bounded entries/bytes. This is bounded test evidence, not proof of absence of all leaks. No user cache or user data was deleted.

The actual `GlobalStrategyPanel` was exercised in Edge with a temporary mock API harness: GLOBAL_AUTO selection, READY K/EP explanation, unavailable fallback, and expiry clearing parent Worker context. Desktop and 390px mobile views were inspected; no console errors/warnings or horizontal overflow were observed. Expiry does not start polling. This is a component smoke test, not authenticated full-application coverage.

- [READY screenshot](global-strategy-ready.png)
- [Mobile expired screenshot](global-strategy-mobile-expired.png)

The named browser session and temporary HTTP server were stopped. Their own generated bundle/helper scripts were removed; screenshots were moved here without duplicate copies. Existing unrelated processes, temporary artifacts and concurrent work were preserved.

## Remaining acceptance

1. Restore PostgreSQL/Docker; apply the migration using the repository's safe migration workflow and check constraints/upsert concurrency and duplicate counts on the real DB.
2. Run the FPL ownership repair, rebuild old player-pool snapshots, and verify real Sports.ru/FPL profile and squad contexts through the configured provider paths.
3. Run authenticated full-application API/Worker/UI scenarios, including stale apply and saved-mode reload.
4. Save actual provider pools and repeat at least 20 warmed measurements, verify p95 <= 2.5x and repeated request memory/duplicate counts.
