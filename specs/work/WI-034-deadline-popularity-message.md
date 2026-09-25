# WI-034: Покупки и продажи в сообщении дедлайна

- Kind: `implement`
- Canon action: `direct-edit`

## Outcome

Отчёт дедлайна содержит опубликованные Sports списки покупок и продаж (до 10 игроков в исходном порядке с единицей и ссылкой на источник), не теряя риски состава и расписание; при этом linking и сбор рейтингов включены в production через operator env без секретов в Git.

## Specs

- Governing: `spec://modules/telegram/FEAT-007-deadline-assistant#message`
- Governing: `spec://modules/machete/FEAT-006-sports-popularity#contracts`
- Affected: `spec://modules/telegram/FEAT-007-deadline-assistant#changelog`
- Constraint: `spec://modules/telegram/INFRA-005-deadline-pipeline#delivery`
- Constraint: `spec://modules/telegram/INFRA-005-deadline-pipeline#recovery`

## Scope

- In: передача BUYS/SELLS snapshots в report builder, рендер списков с HTML escaping и источником, обновление канона сообщения и тестов; merge `notifications.env` в deploy-скрипт для `TELEGRAM_*`/`SPORTS_TRENDS_*`; создание production env с флагами и секретами; релиз и проверка.
- Out: paid broadcast, обратный импорт состава, изменение таблиц и API.

## Acceptance

- [ ] В сообщении появляются до 10 покупок и 10 продаж с значением и источником; отсутствие публикации не ломает отчёт.
- [ ] Рендер экранирует динамические значения и по-прежнему делится на части ≤4096.
- [ ] `npm run check` проходит; новая миграция не требуется.
- [ ] Production: `TELEGRAM_LINK_ENABLED`, `TELEGRAM_DEADLINE_ENABLED`, `TELEGRAM_SEND_ENABLED`, `SPORTS_TRENDS_SYNC_ENABLED` присутствуют в контейнерах; `/profile` показывает блок привязки; секреты только в mode 600 env-файле.
- [ ] Collector создаёт source/snapshot в production БД.

## Result

Заполняется при завершении.
