# TECHDEBT

Register of current engineering trade-offs and risks.

## Open

### TD-010: Franchise export reaches the bounded job memory boundary

- Area: franchise batch analytics / export working set and full-season growth.
- Related specs: `spec://modules/franchises/FEAT-005-franchise-analytics#data`, `spec://common/INFRA-006-continuous-deployment#heavy-jobs`.
- Introduced by: earlier production aggregation OOM observed during WI-076; narrowed after successful WI-088 recovery on 2026-11-04.
- Current state: 0.3.152 completed the entire controlled collection/calculation/import in 2,196.527 seconds under the unchanged isolated 3.5 GiB/no-swap cap. Fresh file/database/reader/UI acceptance passed. The old shared-worker failure is repaired. Export still triggered 1,313 memory.events.max boundary/reclaim events, with zero OOM and OOM kills. Exact stage RSS reached 2,510,901,248 bytes; whole-cgroup sampled maximum 3,573,325,824 bytes and minimum host available memory 4,277,157,888 bytes. Kernel cgroup peak is unavailable; samples do not establish spare container capacity.
- Risk: growing full-season output or less reclaimable cache may increase export time or cause a future memory failure. A successful current-data run is not a growth-capacity guarantee.
- Trigger: full snapshot construction/serialization under the fixed job budget; wider future history and additional records.
- Mitigation: profile export allocations and charged file cache, stream further serialization where output equivalence is preserved, and test representative full-season growth plus published size bounds. Require exact output/history checks, complete monitored import, unchanged runtime safety limits and sufficient host reserve. Do not silently raise the cap, drop observations, clear valid source data or suppress the pressure counter.
- Work: follow-up A23 in WI-084 PLAN.md; recovery completed by WI-088. Evidence: `specs/work/evidence/WI-088/production-run-0152-summary.json`, `fresh-output-0152.json`, `publication-acceptance-review.md`. Counter semantics independently checked against Linux 5.15 cgroup documentation.

### TD-009: Development tooling retains dependency advisories

- Area: build and lint dependencies.
- Related specs: `spec://common/structure#root`.
- Introduced by: existing locked tooling; discovered in `WI-052`.
- Current state: WI-084 rechecked the 0.3.149 lockfile on 2026-11-04. Production audit reports zero findings; full `npm audit --include=dev` reports 18 affected package entries (one high, 17 moderate), propagated from three advisories in development tooling: zod <4.6.6, postcss-selector-parser <6.1.5 and minimatch <11.0.1. These are affected dependency entries, not 18 distinct advisories. The earlier nine-finding count is obsolete.
- Risk: oversized schema collections, glob or selector input can exhaust a development/build process; the production audit does not include these development packages.
- Trigger: build, lint or watcher processing specially crafted patterns/selectors, or making the complete development audit a required CI gate.
- Mitigation: review patched upstream dependency ranges (zod 4.6.6, postcss-selector-parser 6.1.5/7.1.6 and minimatch 11.0.1), then verify full audit, lint behavior, types, CSS output and the existing interface. Do not apply npm's proposed downgrade to ESLint 4 or force a minimatch major override across incompatible callers.
- Work: WI-084 follow-up plan; evidence in `specs/work/evidence/WI-084/npm-audit-full-final.json`; original evidence in `specs/work/evidence/WI-052/verification.json`.

### TD-001: Доставка дедлайна идёт тиком в worker-процессе
- Area: `deadline-reports`
- Related specs: `spec://modules/telegram/INFRA-005-deadline-pipeline#decisions`
- Introduced by: `WI-033`
- Current state: `runDeadlineDeliveryTick` вызывается таймером в worker-процессе рядом с ingestion; отдельный ограниченный delivery-контейнер и общий limiter для нескольких реплик не построены.
- Risk: память и CPU доставки делятся с ingest; при нескольких delivery-репликах лимиты Telegram могут нарушаться.
- Trigger: пилот больше 1000 получателей или запуск второй delivery-реплики.
- Mitigation: вынести тик в отдельную роль/контейнер и добавить общий атомарный token bucket.
- Work: —

### TD-002: ALT отчёта строится на общей формуле
- Area: `deadline-reports`
- Related specs: `spec://modules/telegram/FEAT-007-deadline-assistant#signals`
- Introduced by: `WI-033`
- Current state: ALT берётся из опубликованного CURRENT_XI snapshot; при личной формуле пользователя сигнал становится `UNKNOWN`, материализатор по fingerprint формулы не построен.
- Risk: часть подписчиков получит «Нет надёжных данных» по ALT, либо расчёт будет пересчитываться на пользователя.
- Trigger: пилот с пользователями, у которых включена личная формула ALT.
- Mitigation: группировать отчёты по fingerprint формулы и материализовать ALT один раз на группу.
- Work: —

### TD-003: Synthetic million load не проводился
- Area: `deadline-reports`
- Related specs: `spec://modules/telegram/INFRA-005-deadline-pipeline#capacity`
- Introduced by: `WI-033`
- Current state: capacity-числа остаются расчётными; нагрузочный прогон на заявленный объём, проверка bytes-per-row и retention на диске не выполнялись.
- Risk: фактический delivery window и память очереди на большом объёме неизвестны.
- Trigger: планирование paid/SLA или рост подписчиков выше малой аудитории.
- Mitigation: синтетический прогон по INFRA-005#acceptance с измерением throughput, p95, RSS и размера очереди.
- Work: —

### TD-004: Discovery трендов Sports зависит от публичной ленты
- Area: `sports-trends`
- Related specs: `spec://modules/machete/FEAT-006-sports-popularity#sources`
- Introduced by: `WI-031`
- Current state: ссылки на статьи ищутся по тегу `fantasy` в HTML ленты; при изменении разметки discovery остановится, но статьи можно задать явно через `SPORTS_TRENDS_ARTICLE_URLS`.
- Risk: новые рейтинги перестанут попадать в сбор без операторского сигнала.
- Trigger: изменение вёрстки или JS-рендер ленты Sports.
- Mitigation: добавить второй источник discovery или официальный фид, мониторить метрику discovered/failed.
- Work: —

### TD-005: Дедлайн кампании зависит от непроверенного `deadlineAt`
- Area: `deadline-reports`
- Related specs: `spec://modules/telegram/INFRA-005-deadline-pipeline#deadlines`
- Introduced by: `WI-033`
- Current state: `FantasyProviderRound.deadlineAt` исторически заполняется из `tour.startedAt`; gate `DEADLINE_CONFLICT` блокирует лиги с расхождением до подтверждения источника.
- Risk: часть лиг останется без кампаний, пока источник дедлайна не проверен.
- Trigger: включение кампаний для лиг с расхождением `deadlineAt` и первого kickoff.
- Mitigation: подтвердить настоящий Sports deadline для каждой лиги и сохранить `deadlineSource`/`verifiedAt`.
- Work: —

### TD-006: Offset polling зависит от max(updateId) в inbox
- Area: `telegram-polling`
- Related specs: `spec://modules/telegram/INFRA-005-deadline-pipeline#delivery`
- Introduced by: `WI-036`
- Current state: offset для `getUpdates` берётся из `max(updateId)` durable inbox; synthetic webhook-апдейты с произвольными большими id могут сдвинуть offset вперёд и пропустить реальные updates.
- Risk: пропуск сообщений после тестового/операторского synthetic webhook-вызова.
- Trigger: ручной POST в webhook с ненастоящим update_id при включённом polling.
- Mitigation: хранить offset в отдельном состоянии polling, а inbox использовать только для dedupe; не отправлять synthetic update_id выше реальных.
- Work: —

## Resolved

### TD-008: Workflow checker treats standalone state as a Prist connection

- Area: local `spec-driven-work` workflow validation.
- Related specs: `spec://common/PROP-001-workflow-validation#root`.
- Introduced by: existing skill script `d9abf51`; discovered while closing `WI-050`.
- Current state: resolved on 2026-10-06 by WI-051. Both mirrored validators select the explicit mode, accept the local standalone receipt and preserve managed context checks. Both actual repository checks pass.
- Risk: the false managed-connection failure is removed; malformed and contradictory declarations still fail.
- Trigger: `node .agents/skills/spec-driven-work/scripts/check-workflow.mjs .` or the Claude mirror.
- Mitigation: 19 direct contract tests, passing repository tests/lint/types, current specification snapshot and mirror parity.
- Work: [WI-051](work/archive/2026/WI-051-workflow-validator-mode.md); [verification](work/evidence/WI-051/verification.json). Original failure evidence remains in WI-050.

### TD-007: Existing production dependencies block the CI audit

- Area: dependency maintenance and the `Check` workflow.
- Related specs: `spec://common/structure#root`.
- Introduced by: before WI-039; both locked versions are identical to commit `20a84cf19f96fbd5abe6c3b67870e75ef5af5e1e`.
- Current state: resolved on 2026-09-28 by WI-040. Patched dependencies are published in `1292dd57848f81da4a8a13cc733a62c124e9e72a`; production and full audits report zero known vulnerabilities. The lockfile includes the optional runtime entries required by CI's npm 10.8.2.
- Risk: the dependency vulnerabilities and production audit blocker have been removed. WI-041 also resolved the CI test-environment failures; the full [Check run 36406463394](https://github.com/Tsyzhman/fantasy/actions/runs/36406463394) passes.
- Trigger: `npm run audit:prod`; confirmed by [Check run 36398972115](https://github.com/Tsyzhman/fantasy/actions/runs/36398972115).
- Mitigation: sharp 0.35.4, baseline-browser-mapping 2.11.26, browserslist 4.29.2, and postcss-selector-parser 6.1.4; clean install, native image checks, local application validation, and a passing GitHub production audit. See [Check run 36404329686](https://github.com/Tsyzhman/fantasy/actions/runs/36404329686) and `specs/work/evidence/WI-040/dependency-checks.json`.
- Work: [WI-040](work/archive/2026/WI-040-dependency-security.md); completed CI environment follow-up: [WI-041](work/archive/2026/WI-041-ci-database-isolation.md).

<!--
### TD-001: Short name
- Area: `module` / subsystem
- Related specs: `spec://...#...`
- Introduced by: `WI-NNN` or commit
- Current state: what is left in the implementation
- Risk: what this can lead to
- Trigger: when the risk appears
- Mitigation: how to close or reduce the risk
- Work: —
-->
