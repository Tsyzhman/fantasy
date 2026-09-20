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
- Updated: 2026-09-20
- Checkpoint: WI-026 восстановил серверный HTTP без браузера и часовой сбор в :22. Проверены 697 карточек / 691 KHL ID, 65 протоколов повторены без изменений после дополнения статистики. Матчевые факты и beta EP работают; подробное evidence в WI-026.
- Next: получить доступный player-match ixG feed либо решение по собственной оценочной модели.
- Blocker: готовый ixG недоступен, решение по собственной модели не получено. Доступ к протоколам больше не блокирует работу.

## Cross-work

## Decisions Pending

- WI-017: доступный готовый ixG источник или отдельно согласованная собственная модель. Текущий EP остаётся явно обозначенной beta без xG.
