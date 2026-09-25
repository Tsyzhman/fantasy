# WI-037: Популярные трансферы Sports в отчёте

- Kind: `implement`
- Canon action: `direct-edit`

## Outcome

Отчёт дедлайна показывает официальные популярные трансферы Sports (`topTransferPlayers`: топ-3 с очками) и расширенный топ-10 роста/падения доли выбора за тур, помеченный как неофициальный; сбор идёт один раз на турнир/тур, а не на пользователя.

## Specs

- Governing: `spec://modules/machete/FEAT-006-sports-popularity#sources`
- Governing: `spec://modules/machete/FEAT-006-sports-popularity#data`
- Governing: `spec://modules/telegram/FEAT-007-deadline-assistant#message`
- Affected: `spec://modules/machete/FEAT-006-sports-popularity#changelog`

## Scope

- In: GraphQL-запросы `squadTourInfo.topTransferPlayers` и `players.status.chartSelectedBy`, расчёт дельт, bounded-сбор на турнир/тур, снимки `TRANSFERS_OFFICIAL`/`TRANSFERS_GAIN`/`TRANSFERS_DROP`, рендер секций в сообщении, тесты.
- Out: точное число трансферов (API не отдаёт), paid, обратный импорт состава.

## Acceptance

- [ ] Официальный топ совпадает с `topTransferPlayers` Sports (проверено на RPL 9 тур: Жилсон Беншимол/Обляков/Тюкавин).
- [ ] Расширенный топ считается по дельте доли выбора и помечен как неофициальный; без предыдущего тура запись не создаётся.
- [ ] Сбор bounded (до 6 страниц пула, не на пользователя) и идемпотентен в пределах часа.
- [ ] `npm run check` проходит; сообщение содержит обе секции.

## Result

Заполняется при завершении.
