# WAL

## Active Checkpoints

### WI-084: Current production audit and supervised release (@tsyzhman)
- Work: [WI-084](work/WI-084-project-server-audit.md)
- Updated: 2026-11-04
- Checkpoint: Plan and Russian audit report published. Isolated codex/project-audit-20261104 includes production ef9830d (0.3.148) and merged main 6de1694/WI-083 completion. Four Sol 6.1 Max chats implemented WI-085–088; independent review returned concrete regressions for correction. Canon amendments integrated. Local checks and all 64 Telegram DB regressions passed; baseline full Linux Check 41809518427 succeeded. WI-089 mobile sorting and its two independent-review corrections passed 70 unit/contract tests, six browser scenarios, typecheck and final production build. Root owns integration and release; chat IDs remain in evidence/WI-084/PLAN.md and the coordination history.
- Next: Production 0.3.149 / 269980b is verified through Deploy 41819445507, 611 error-free release probes, live mobile sorting at 320/390px and successful Production Browser Smoke 41822996750 (authorization plus 28 scenarios). Finish documenting/merging PR53 after its exact-head Check. Continue WI-088 with the same Sol 6.1 Max franchise chat: fresh acquisition failed at fixture identity resolution; read-only diagnosis proves a single-value map loses duplicate calendar scopes. Correct candidate sets and source-board isolation, review/test, then release 0.3.150 through the canonical pipeline and retry the bounded sync. The normal entry supports an explicit FRANCHISE_RESUME_AFTER within three hours; any reuse must reference the verified November 4 acquisition, never October calculation artifacts.
- Blocker: Fresh franchise publication remains unverified. The 11:42–12:27 UTC trial received 68,368 source squads then failed before computation/import. Previous October 21 snapshot SHA is unchanged. Acquisition sampled cgroup maximum 1,445,416,960 bytes, minimum host available 5,465,972,736 bytes, OOM/restarts zero; kernel peak unavailable. Sync/monitor sessions are finished; job/env/markers removed. Source conflict evidence concerns board 520404, La Liga, overlapping rounds 9/10 with title uniquely pointing to 9. Root removed 1,043,442,744 bytes of old intermediates and 72,361,490 bytes of expired HTTP cache under the common lock; sources/snapshot/lock remain. Canonical release cleanup retains 149+148 and one verified backup. Local synthetic-directory removal remains policy-denied. No new backup schedule; original checkout unchanged.

### WI-001: Automatic global ranking strategy (@tsyzhman)
- Work: [WI-001](work/WI-001-global-strategy.md)
- Updated: 2026-09-07
- Checkpoint: GLOBAL_AUTO implemented in math, providers, sync, schema, API, Worker and UI. Formula/search/ownership/cache and component browser smoke tests are recorded in evidence; synthetic p95 fits into 2.5x.
- Next: with working PostgreSQL, apply migration using safe-update workflow, perform FPL ownership repair and rebuild old pools; check authorized API/UI and READY contexts; measure saved real pools 20 times after warming up.
- Blocker: PostgreSQL localhost:5433 and Docker Linux engine are not available; FPL returns HTTP 503. The actual migration and live acceptance have not been completed.

<!--
### WI-001: Brief status (@handle)
- Work: [WI-001](work/WI-001-short-slug.md)
- Updated: YYYY-MM-DD
- Checkpoint: what has already been done.
- Next: next step.
- Blocker: —
-->

### WI-017: KHL protocols and forecasts (@tsyzhman)
- Work: [WI-017](work/WI-017-khl-protocol-statistics.md)
- Updated: 2026-09-20
- Checkpoint: WI-026 восстановил серверный HTTP без браузера и часовой сбор в :22. Проверены 697 карточек / 691 KHL ID, 65 протоколов повторены без изменений после дополнения статистики. Матчевые факты и beta EP работают; подробное evidence в WI-026.
- Next: получить доступный player-match ixG feed либо решение по собственной оценочной модели.
- Blocker: готовый ixG недоступен, решение по собственной модели не получено. Доступ к протоколам больше не блокирует работу.

## Cross-work

## Decisions Pending

- WI-017: available ready-made ixG source or separately matched proprietary model. The current EP remains clearly labeled beta without xG.
