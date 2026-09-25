# WI-031: Популярность Sports — parser, история и чтение

- Kind: `implement`
- Canon action: `direct-edit`

## Outcome

FEAT-006 реализована: опубликованные рейтинги Sports собираются bounded-collector, нормализуются в собственные таблицы с source/revision/category, ownership и его дельта отличаются от покупок, read API и панель Squad показывают категорию, единицу, freshness и ограничения выборки.

## Specs

- Governing: `spec://modules/machete/FEAT-006-sports-popularity#root`
- Governing: `spec://modules/machete/FEAT-006-sports-popularity#sources`
- Governing: `spec://modules/machete/FEAT-006-sports-popularity#data`
- Governing: `spec://modules/machete/FEAT-006-sports-popularity#contracts`
- Governing: `spec://modules/machete/FEAT-006-sports-popularity#errors`
- Affected: `spec://modules/machete/FEAT-006-sports-popularity#changelog`
- Constraint: `spec://modules/machete/INFRA-004-sorareinside-starters#root`

## Scope

- In: parser ленты и статей Sports (HTML + JSON-LD), категории `BUYS`/`SELLS`/`OWNERSHIP`/`CAPTAINS`/`OWNERSHIP_DELTA_PP`, единицы и `metricKind`, до 15 игроков в исходном порядке, revision по content hash; Prisma-таблицы `SportsTrendSource`/`SportsTrendSnapshot`/`SportsTrendEntry`; ownership-снимки из полностью пагинированного `FantasyPlayerPrice.selectedByPercent` с null-safe проверкой; collector с bounded HTTP, retry/429, lease; scheduler и CLI; `GET /api/machete/sports-trends`; панель «Популярное на Sports» в Squad; tests.
- Out: поддержка лиг без синхронизированного расписания, обратный импорт состава, платные каналы, изменение существующего импорта цен.

## Acceptance

- [ ] Реальный HTML пример распознаёт 10 покупок и 10 продаж; тест JSON-LD с коротким анонсом не теряет HTML-списки.
- [ ] Проверены списки 0/3/10/15/более 15, позиции, капитаны, топ-1000, запятые в процентах, повторная публикация и неоднозначное имя.
- [ ] OWNERSHIP, покупки и изменение ownership различаются в данных и UI; `null` не становится 0.
- [ ] Тур/сезон, source URL и freshness проверяются до показа; недоказанный тур не публикуется как тренд.
- [ ] Повтор цикла не создаёт дубли; retention и метрики skipped/failed/unmapped заданы.
- [ ] `npm run check` проходит; миграция additive.

## Result

Реализован первый выпуск FEAT-006 и выпущен в production 0.3.86 (release `20260925T082846Z-v0.3.86-e14f27c`, commit `e14f27c`, deploy run 36112589545).

Проверки:

- `src/providers/sports-ru-trends/parser.test.ts`: 13/13 — реальная статья Sports даёт 10 покупок и 10 продаж, JSON-LD-анонс не теряет HTML-списки, позиции/топ-1000/запятые/0/15/17/повтор/неоднозначность, discovery ленты, 429/403/too-large.
- `npm test`: 1183 теста, 0 fail; `npm run lint` 0 errors; `npm run typecheck`; `npm run check` (release:verify-version, тесты, lint, typecheck, production build) успешно.
- Миграция `20260925081319_sports_trends_telegram_deadline` additive; production `_prisma_migrations` = 1, таблицы `sports_trend_sources`/`sports_trend_snapshots`/`sports_trend_entries` созданы (всего 4/4 целевых).
- Production `/api/machete/sports-trends` → 401 без сессии (маршрут выпущен); collector выключен флагом `SPORTS_TRENDS_SYNC_ENABLED=false`.
- `specs/TECHDEBT.md`: TD-004 (discovery зависит от вёрстки ленты).

REVIEW: регулярность публикаций по лигам не доказана; сбор включается только для соревнований с синхронным расписанием. Панель в Squad доступна для выбранного тура. Одношаговый CLI: `npm run sports-trends -- collect|ownership|status|prune`.
