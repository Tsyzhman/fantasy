# TECHDEBT

Register of current engineering trade-offs and risks.

## Open

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

## Resolved

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
