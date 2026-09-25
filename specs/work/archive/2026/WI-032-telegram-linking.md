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

Реализована привязка Telegram (WI-032) и выпущена в production 0.3.86 (release `20260925T082846Z-v0.3.86-e14f27c`, commit `e14f27c`, deploy run 36112589545).

Проверки:

- `src/server/telegram/crypto.test.ts`: 6/6 — Crockford-код 12 символов, нормализация, 128-битный secret, стабильная деривация по slot, digest по kind/key, слот 15 секунд.
- `src/server/telegram/link-service.db-test.ts`: 4/4 на PostgreSQL — полный lifecycle (session→code→consume→confirm→ACTIVE), replay=EXPIRED, конфликт Telegram ID, pause/resume, subscriptions, unlink и повторная привязка, purge pending/challenges, атомарные rate limits, webhook `/start <code>` + replay=DUPLICATE + durable inbox.
- `npm test` 1183/0, `npm run lint` 0 errors, `npm run typecheck`, `npm run check` успешно; маршруты `/api/profile/telegram/*` и `/api/telegram/webhook` в production build.
- Production: флаги `TELEGRAM_*` отсутствуют (0 ключей в worker), webhook отвечает 404 при выключенном `TELEGRAM_LINK_ENABLED`; секреты не коммитились (в `.env.example` только пустые имена).

REVIEW: 15-секундный ручной код неудобен — основной путь deep link, fallback с grace 15 секунд. Группы, paid и обратный импорт состава вне выпуска.
