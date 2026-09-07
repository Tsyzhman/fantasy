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

## Cross-work

## Decisions Pending
