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

Заполняется при завершении.
