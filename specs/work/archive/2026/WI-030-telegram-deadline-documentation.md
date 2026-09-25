# WI-030: Документация Sports trends и Telegram перед дедлайном

- Kind: `research`
- Canon action: `new-spec`

## Outcome

Подготовлен проверяемый проект решения: популярные игроки Sports, привязка Telegram, персональная рассылка по дедлайнам и оценка до миллиона пользователей с фактическим обследованием production.

## Specs

- Constraint: `spec://modules/machete/INFRA-004-sorareinside-starters#root`
- Affected: `spec://modules/machete/FEAT-006-sports-popularity#root`
- Affected: `spec://modules/telegram/FEAT-007-deadline-assistant#root`
- Affected: `spec://modules/telegram/INFRA-005-deadline-pipeline#root`
- Legacy product context: `specs/common/main.md`, `docs/DEPLOYMENT.md`.

## Scope

- In: read-only проверка источников и сервера через SSH alias `deploy`; документация, draft specs, регистрация, расчёт ограничений, acceptance будущей реализации.
- Out: production mutations, запуск массового парсинга, реализация бота, миграции, деплой, отправка Telegram-сообщений, покупка Stars.

## Acceptance

- [x] Возможность извлечения популярных игроков проверена на публичном источнике, семантика покупок и ownership разделена.
- [x] Фактические runtime, память, кэш, состав сервисов и ограничения импорта записаны без секретов.
- [x] Описаны 15-секундный код, безопасная привязка, отписка и масштабирование.
- [x] Описаны 08:00 / 08:10 / 09:00 МСК, данные состава, ALT/blank/unknown, расписание в три столбца и теги каждого дедлайна.
- [x] Зафиксированы capacity, дедупликация, freshness, ошибки, recovery и REVIEW без обещания недоступных возможностей.
- [x] Ссылки и spec snapshot проверены; изменены только документы.

## Result

Созданы обзор `docs/TELEGRAM_DEADLINE_PLAN.md` и draft FEAT-006, FEAT-007, INFRA-005; зарегистрированы в SPEC-MAP и технической карте как будущие namespaces. Продуктовая реализация не начиналась, governing active канон Sorare не менялся.

Проверки и evidence:

- `specs/work/evidence/WI-030/research.md`: внешний поиск, серверный HTTP 200 и разбор 10 покупок/10 продаж; GraphQL 15/15 непустых selectedBy; read-only БД и runtime через alias deploy.
- Два resource snapshot: available RAM 5325 → 5315 MiB, build cache 1,756 GB без изменения, штатная пара web/worker healthy, лишние работающие экземпляры не появились. Это не длительный leak/load test.
- Локальная проверка 21 spec/Markdown ссылки и anchors в пяти созданных содержательных документах: 0 ошибок. Первоначальные относительные пути исправлены.
- `git diff --check`: без whitespace errors; только предупреждения Git о нормализации CRLF. Код/миграции/config не менялись; build/tests приложения и deploy не запускались.
- `node .agents/skills/spec-driven-work/scripts/sync-spec-space.mjs snapshot --root .`: итог `status=current`, diagnostics `[]`; устранены начальные authoring diagnostics по обязательным anchors и будущему ещё не созданному traceability file.
- Fingerprint `ebe547befef35242b71d914bed5344bb3273ebe4453a014140757086646580f5`; source `working_tree`, base commit `b5b5eb81cecaa3347ba5be4ffb6ce18964296738`. Полный компактный receipt: `specs/work/evidence/WI-030/spec-check.json`. Документы не закоммичены.

REVIEW перед реализацией: канал последних приватных замен Sports; реальный deadline/покрытие sync каждой лиги; массовая Sports quota; paid Telegram SLA/бюджет; политика дедлайнов до 09:00. Эти вопросы прямо отражены в draft и не являются незавершённой реализацией WI-030. Нового runtime-компромисса не принято, TECHDEBT не менялся. WAL-checkpoint не создавался: исследование завершено в этой сессии.
