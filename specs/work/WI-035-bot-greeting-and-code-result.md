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

Заполняется при завершении.
