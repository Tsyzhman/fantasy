# WI-035: Приветствие бота и результат кода с аккаунтом

- Kind: `implement`
- Canon action: `direct-edit`

## Outcome

Бот на `/start` отвечает фиксированным приветствием и просит код; приняв код, отвечает «подошёл/не подошёл», а при успехе называет аккаунт (email) и по-прежнему требует подтверждение на сайте.

## Specs

- Governing: `spec://modules/telegram/FEAT-007-deadline-assistant#linking`
- Affected: `spec://modules/telegram/FEAT-007-deadline-assistant#changelog`
- Constraint: `spec://modules/telegram/INFRA-005-deadline-pipeline#delivery`

## Scope

- In: hardcoded greeting/help, результат consume с email, allowlist `getWebhookInfo` для операторской проверки, тесты и релиз.
- Out: авто-подтверждение привязки без сайта, AI-ответы, группы, paid.

## Acceptance

- [ ] `/start` без payload показывает приветствие и инструкцию с кодом; для действующей связи отвечает статусом.
- [ ] Успешный код: сообщение содержит «подошёл» и email аккаунта; конфликт чужого Telegram не раскрывает чужой email.
- [ ] `getWebhookInfo` доступен через VPN relay только для чтения.
- [ ] `npm run check` проходит; webhook в production зарегистрирован и отвечает `ok`.

## Result

Выпущено 0.3.88 (release `20260925T095553Z-v0.3.88-f4c0ba7`).

Проверки:

- `src/server/telegram/link-service.db-test.ts`: 4/4 на PostgreSQL — ответ на код содержит «Код подошёл» и email аккаунта; `/start` от непривязанного пользователя содержит «Привет» и инструкцию «Отправь этот код сюда»; replay остаётся DUPLICATE.
- `npm run check` (0.3.88) успешно.
- Production: `setWebhook` через VPN relay вернул `Webhook was set` (URL `https://fantasy.tsyzhman.ru/api/telegram/webhook`), `getMe` вернул `fantasyfootballhelpbot`. Позже webhook удалён при переходе на polling (WI-036).

REVIEW: подтверждение на сайте (PENDING до `confirm`) сохранено; бот не активирует связь сам, чтобы перехваченный код не привязывал чужой Telegram. Конфликт не раскрывает чужой email.
