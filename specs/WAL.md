# WAL

## Active Checkpoints

### WI-084: Current production audit and supervised release (@tsyzhman)
- Work: [WI-084](work/WI-084-project-server-audit.md)
- Updated: 2026-11-04
- Checkpoint: Plan and Russian audit report published. Isolated codex/project-audit-20261104 includes production ef9830d (0.3.148) and merged main 6de1694/WI-083 completion. Four Sol 6.1 Max chats implemented WI-085–088; independent review returned concrete regressions for correction. Canon amendments integrated. Local checks and all 64 Telegram DB regressions passed; baseline full Linux Check 41809518427 succeeded. WI-089 mobile sorting and its two independent-review corrections passed 70 unit/contract tests, six browser scenarios, typecheck and final production build. Root owns integration and release; chat IDs remain in evidence/WI-084/PLAN.md and the coordination history.
- Next: c16c7f8/0.3.149 passed Check 41812614866 and two complete Deploy validations/builds, but Deploy 41812628792 and 41814939270 were cancelled before promotion for unusably slow SCP (20–28 and ~90 KiB/s). No remote promoter/new target ran; partial archives removed (31,595,520 bytes). WI-090 adds current-run verified HTTPS artifact delivery in the existing runtime chat; root updated canon/BOARD and awaits implementation/review. Then commit/push revised unreleased 0.3.149 and run full canonical Deploy. Start a new availability sampler for the new SHA; old c16 sampler was stopped after 898 successful probes, evidence saved with cancelled suffix. Production remains 0.3.148. After rollout, run browser smoke, fresh franchise sync with preflight/monitor, scoped cleanup and verified archives.
- Blocker: Delivery is currently gated by WI-090: runner SCP and single-stream server HTTPS are too slow; bounded current-run HTTPS plus verified operator prestaging are being implemented. Fresh franchise acquisition may expose unresolved contradictory board flags and must preserve the old snapshot on failure. Local synthetic-directory cleanup was rejected by automatic policy and is recorded. No new backup schedule is configured. Original Documents/fantasy_export remains untouched.

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
