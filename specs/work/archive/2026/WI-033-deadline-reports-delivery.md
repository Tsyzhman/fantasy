# WI-033: Отчёты дедлайна и доставка Telegram

- Kind: `implement`
- Canon action: `direct-edit`

## Outcome

INFRA-005 и пользовательская часть FEAT-007 реализованы для первой аудитории: кампания `(contest, season, providerRoundId)` планируется из проверенного расписания, на 08:00/08:10/09:00 МСК строятся immutable-отчёты с честной деградацией, а свободная очередь доставляет части сообщений с rate limit, retry и учётом `DELIVERY_UNKNOWN`.

## Specs

- Governing: `spec://modules/telegram/INFRA-005-deadline-pipeline#pipeline`
- Governing: `spec://modules/telegram/INFRA-005-deadline-pipeline#deadlines`
- Governing: `spec://modules/telegram/INFRA-005-deadline-pipeline#freshness`
- Governing: `spec://modules/telegram/INFRA-005-deadline-pipeline#data`
- Governing: `spec://modules/telegram/INFRA-005-deadline-pipeline#delivery`
- Governing: `spec://modules/telegram/FEAT-007-deadline-assistant#signals`
- Governing: `spec://modules/telegram/FEAT-007-deadline-assistant#message`
- Affected: `spec://modules/telegram/FEAT-007-deadline-assistant#changelog`
- Affected: `spec://modules/telegram/INFRA-005-deadline-pipeline#changelog`
- Constraint: `spec://modules/machete/INFRA-004-sorareinside-starters#root`

## Scope

- In: Prisma-модели кампаний, stage jobs, data snapshots, user reports и outbox; deadline gate `DEADLINE_CONFLICT`/ранний дедлайн; classifier ALT/blank/XI/unknown; рендер с тегами, тремя столбцами и разбиением на части; report builder из опубликованного состава и сохранённого плана; delivery с free quota 25/с, per-chat 1/с, retry/backoff, `EXPIRED`, `DELIVERY_UNKNOWN`; scheduler в worker role, CLI `plan`/`dry-run`/`status`/`run-due`/`send-due`; флаги; tests.
- Out: paid broadcast, отдельный delivery-контейнер, материализация ALT по fingerprint формулы, synthetic million load, автоматические correction-сообщения, расширение для последних замен.

## Acceptance

- [ ] Московская дата, ранний дедлайн, одинаковое время нескольких турниров, перенос/отмена, restart и stale calendar покрыты проверками.
- [ ] Duplicate campaign/job/outbox не создаётся; fencing/lease отклоняет позднего worker; backlog не загружается целиком.
- [ ] Проверены webhook forgery/replay, unlink во время очереди, 429/403/400, ambiguous timeout, лимит 4096 и part dedup.
- [ ] ALT 0/null/округление, blank/unknown, капитан/скамейка, двойной тур и неполный маппинг классифицируются по спеке.
- [ ] `npm run check` проходит; миграция additive; флаги по умолчанию off.

## Result

Реализованы отчёты дедлайна и доставка (WI-033) и выпущены в production 0.3.86 (release `20260925T082846Z-v0.3.86-e14f27c`, commit `e14f27c`, deploy run 36112589545).

Проверки:

- `src/server/deadline-reports/classifier.test.ts`: 9/9 — blank только при полном календаре, OUT_OF_XI только при покрытии всех матчей двойного тура, true ALT 0 против округлённого, unknown-причины, несколько причин у игрока, bench/captain split, тег/источник/три столбца/freshness, HTML escaping, «уточняется», детерминированное разбиение ≤4096 с повтором тега и нумерацией частей.
- `npm test` 1183/0, `npm run lint` 0 errors, `npm run typecheck`, `npm run check` успешно.
- Миграция additive: таблицы `deadline_campaigns`, `deadline_stage_jobs`, `deadline_data_snapshots`, `deadline_user_reports`, `telegram_outbox`, `telegram_inbox`, `telegram_rate_limits` созданы; production: строка миграции в `_prisma_migrations` = 1, выборочная проверка четырёх таблиц (`telegram_outbox`, `deadline_campaigns` и trends/telegram) = 4/4.
- Production: web/worker healthy, RestartCount 0, OOMKilled false, release identity совпала (`/api/health` 0.3.86 e14f27c); `TELEGRAM_DEADLINE_ENABLED`/`TELEGRAM_SEND_ENABLED` не заданы → shadow off, отправка невозможна.
- CLI: `npm run deadline-reports -- plan|run|stage|build|dry-run|status`, отправка только `send --apply` при включённых флагах.

REVIEW/TECHDEBT: TD-001 доставка в worker-процессе вместо отдельного контейнера; TD-002 ALT по общей формуле; TD-003 synthetic million load не проводился; TD-005 источник дедлайна не подтверждён для части лиг, gate `DEADLINE_CONFLICT`/EARLY_DEADLINE блокирует их до проверки. Paid broadcast не реализован.
