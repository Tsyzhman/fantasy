# WI-036: Long polling бота через VPN

- Kind: `implement`
- Canon action: `direct-edit`

## Outcome

Бот получает updates через `getUpdates` в worker-процессе поверх VPN relay, не требуя входящих соединений от Telegram; offset и durable inbox не теряют и не дублируют updates, webhook остаётся альтернативным режимом.

## Specs

- Governing: `spec://modules/telegram/INFRA-005-deadline-pipeline#delivery`
- Governing: `spec://modules/telegram/FEAT-007-deadline-assistant#actors`
- Affected: `spec://modules/telegram/FEAT-007-deadline-assistant#changelog`
- Constraint: `spec://modules/telegram/INFRA-005-deadline-pipeline#data`

## Scope

- In: allowlist `getUpdates` в relay, polling-цикл в worker role, флаг `TELEGRAM_POLLING_ENABLED`, offset из inbox, тесты, релиз и production-переключение.
- Out: webhook-доставка как обязательная, несколько ботов, группы.

## Acceptance

- [ ] `getUpdates` доступен через VPN relay; webhook и polling взаимоисключающие.
- [ ] Повторный запуск не переобрабатывает updates: offset берётся из max(updateId) inbox, дубликаты поглощаются UNIQUE.
- [ ] `npm run check` проходит; production удаляет webhook и запускает polling.
- [ ] Реальное сообщение пользователя появляется в inbox и получает ответ.

## Result

Заполняется при завершении.
