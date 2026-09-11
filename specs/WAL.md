# WAL

## Active Checkpoints

### WI-001: Автоматическая стратегия глобального рейтинга (@tsyzhman)
- Work: [WI-001](work/WI-001-global-strategy.md)
- Updated: 2026-09-07
- Checkpoint: GLOBAL_AUTO реализован в математике, провайдерах, sync, схеме, API, Worker и UI. Тесты формулы/поиска/ownership/cache и компонентный browser smoke записаны в evidence; синтетический p95 укладывается в 2.5x.
- Next: при рабочей PostgreSQL применить миграцию по safe-update workflow, выполнить FPL ownership repair и пересборку старых пулов; проверить авторизованные API/UI и READY контексты; измерить сохранённые реальные пулы 20 раз после прогрева.
- Blocker: PostgreSQL localhost:5433 и Docker Linux engine недоступны; FPL возвращает HTTP 503. Реальная миграция и live-приёмка не выполнены.

<!--
### WI-001: Краткое состояние (@handle)
- Work: [WI-001](work/WI-001-short-slug.md)
- Updated: YYYY-MM-DD
- Checkpoint: что уже сделано.
- Next: следующий шаг.
- Blocker: —
-->

### WI-017: Протоколы КХЛ и прогнозы (@tsyzhman)
- Work: [WI-017](work/WI-017-khl-protocol-statistics.md)
- Updated: 2026-09-11
- Checkpoint: 0.3.67 опубликована; 29 протоколов, сезонные суммы и семидневный beta EP загружены и проверены на production. Повтор changed=0, дублей нет, память и cache проверены; подробное evidence в Result WI.
- Next: получить доступный player-match ixG feed либо решение по собственной оценочной модели; после снятия HTTP 403 проверить регулярную загрузку новых протоколов с сервера.
- Blocker: готовый ixG недоступен, решение по собственной модели не получено; КХЛ блокирует прямой HTTP с production IP. Исторические данные уже отображаются.

## Cross-work

## Decisions Pending

- WI-017: доступный готовый ixG источник или отдельно согласованная собственная модель. Текущий EP остаётся явно обозначенной beta без xG.
