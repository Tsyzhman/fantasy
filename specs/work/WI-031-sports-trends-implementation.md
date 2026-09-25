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

Заполняется при завершении.
