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

Выпущено 0.3.89 (release `20260925T101425Z-v0.3.89-0e056fd`, commit `0e056fd`, deploy run 36122362684).

Проверки:

- `src/server/telegram/polling.test.ts`: 4/4 — offset 1 для пустого inbox, offset max+1 после рестарта, полный batch 100 обрабатывается один раз, webhook-conflict останавливает цикл.
- `vpn-transport.test.ts` и `release-contract.test.ts`: 18/18 (1 skip в Windows) — allowlist `getUpdates`, отсутствие доступа к неразрешённым методам.
- `npm run check` (0.3.89) успешно.
- Production: worker `TELEGRAM_POLLING_ENABLED=true`, webhook удалён (`url=<none>`, `pending=0`, `err=none`), конфликтов 409 после удаления нет; synthetic probe-строки inbox очищены, чтобы offset начинался с 1.

REVIEW: webhook и polling взаимоисключающие; при возврате на webhook нужно остановить polling и зарегистрировать webhook заново. Ограничение synthetic update_id зафиксировано в TD-006.
