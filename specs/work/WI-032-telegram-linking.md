# WI-032: Telegram — привязка, webhook и подписки

- Kind: `implement`
- Canon action: `direct-edit`

## Outcome

FEAT-007 в части привязки реализована: пользователь открывает настройки, получает ротируемый код или deep link, подтверждает Telegram identity в сессии сайта, выбирает турниры и может поставить паузу или отвязать связь; webhook durable, секреты только в digest, рассылка не стартует без consent.

## Specs

- Governing: `spec://modules/telegram/FEAT-007-deadline-assistant#linking`
- Governing: `spec://modules/telegram/FEAT-007-deadline-assistant#data`
- Governing: `spec://modules/telegram/FEAT-007-deadline-assistant#contracts`
- Affected: `spec://modules/telegram/FEAT-007-deadline-assistant#changelog`
- Constraint: `spec://modules/telegram/INFRA-005-deadline-pipeline#delivery`

## Scope

- In: Prisma-модели `TelegramLink`, `TelegramLinkSession`, `TelegramLinkChallenge`, `TelegramSubscription`, `TelegramInbox`, `TelegramRateLimit`; link service (HMAC digest, слоты 15 секунд, grace, atomic consume, PENDING-подтверждение 2 минуты), rate limits, private-chat-only webhook с secret header, команды `/start` `/stop` `/unlink` `/settings` `/help` `/status`, API `/api/profile/telegram/*`, профильный UI, флаги, tests.
- Out: отчёты дедлайна, доставка, paid, обратный импорт состава, группы.

## Acceptance

- [ ] Кнопка и ручной код ведут к одной привязке; проверены 15 секунд, grace, повтор, две вкладки, гонка, expiry, CSRF/Origin и конфликт связей.
- [ ] Доставка не начинается без consent; секреты не попадают в логи/кэш; `telegramUserId`/`chatId` хранятся как строки.
- [ ] `/stop` ставит паузу, `/unlink` отзывает связь; повторный `/start` не создаёт вторую привязку.
- [ ] Подписки по турнирам сохраняются и читаются; Sports profile не считается подтверждённым составом.
- [ ] `npm run check` проходит; миграция additive.

## Result

Заполняется при завершении.
