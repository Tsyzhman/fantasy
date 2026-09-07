# WI-001: Автоматическая стратегия глобального рейтинга

- Kind: `implement`
- Canon action: `direct-edit` (активация утверждённого пользователем канона)

## Outcome

Привязанная команда получает воспроизводимую стратегию GLOBAL_AUTO с ограничением потери EP и объяснением; непригодные данные сохраняют обычный подбор.

## Specs

- Governing: `spec://modules/machete/FEAT-001-global-ranking-strategy#root`
- Governing: `spec://modules/machete/FEAT-002-global-strategy-formula#root`

## Scope

- In: Sports.ru/FPL context, ownership sync, calendar/history, bounded caches, Prisma migration, pure math, squad/transfer/worker integration, API/UI/preferences, tests and performance evidence.
- Out: mini-leagues, automatic provider transfers, new EP engine, claiming proven rank improvement, production deployment.

## Acceptance

- [x] Provider contract fixtures include coherent revisions, bounded requests and explicit unavailable reasons; the real FPL sync function persists ownership on create/update with idempotent repair in mocked storage.
- [x] Pure math passes five examples, boundary/invalid/monotonicity and nonmutation tests.
- [x] Cache TTL/eviction/inflight deduplication, provider concurrency and memory limits verified in repeated tests.
- [x] Global squad, captain and transfer selection preserve an EP baseline, enforce loss budget and leave old strategies on their original path; no-op keeps the best observed baseline.
- [x] API ownership guards, saved-filter merge, worker integration and apply-time freshness implemented; isolated UI smoke explains loss and fallback.
- [x] Final `npm run check`: release version, tests, lint, typecheck and production build passed.
- [ ] Apply the migration and verify unique storage/upserts/concurrency and ownership repair in the actual database.
- [ ] Verify authenticated full-application API/UI and live READY provider contexts, including the configured FPL relay.
- [ ] Benchmark saved real Sports.ru/FPL pools (20 warmed samples, p95 <= 2.5x) and record real DB duplicate and repeated-request memory evidence. Synthetic performance evidence is available separately.

## Result

Created local ignored `specs/.me` for `@tsyzhman` / Никита as directly authorized. FEAT-001/002 are active; code ownership and traces updated.

Before: ordinary selection modes without global rank, provider context or whole-plan loss bounds. After: opt-in GLOBAL_AUTO with normalized provider state, ownership sync, K and explicit EP loss budget, per-round captain/XI, constrained transfers and no-op baseline, bounded caches, authenticated context/binding/audit API, revision-aware Worker, saved strategy and explanation panel. Legacy player-pool snapshots receive provider identity through sequential refresh; missing mapping produces a visible fallback.

Prisma validate/generate and schema-to-SQL inspection passed. No live database migration was executed. Final `npm run check` exited 0: 1,036 tests total, 1,035 passed, 1 skipped, 0 failed; lint 0 errors / 5 pre-existing warnings; typecheck, production build and standalone sanitization passed. Spec snapshot is `current`, with no diagnostics; `git diff --check` passed.

[Verification and remaining steps](evidence/WI-001-verification.md), [synthetic performance measurements](evidence/WI-001-performance.json), [desktop UI](evidence/global-strategy-ready.png), [mobile expiry](evidence/global-strategy-mobile-expired.png).

The synthetic 120-player benchmark used 2 warmups + 20 measurements/provider: p95 ratio 2.01735 FPL / 1.80709 Sports.ru. Repeated post-GC heap stabilized near 9.13/9.17 MB. These measurements do not replace real-provider acceptance. Cache tests verify bounded count/bytes and cleanup after expiry. Own browser/server helper artifacts were stopped/removed; user data, caches and unrelated concurrent work were preserved.

External blockers: PostgreSQL localhost:5433 unavailable; Docker Linux-engine pipe absent after attempted startup; official FPL bootstrap returned HTTP 503. Sports.ru live history was captured anonymously and its active-round recalculation rejection tested. Completion requires restored DB/provider connectivity, real migration/ownership repair, pool refresh, authenticated UI/API checks and the saved real-pool benchmark. No claim of Done, deployed functionality or verified rank improvement.
