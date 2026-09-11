# WI-018: Основа из ближайшего матча SorareInside

- Kind: `change`
- Canon action: `new-spec`

## Outcome

На production галочки основы автоматически обновляются по ближайшему матчу команды в SorareInside каждый час в 05 минут, с устойчивым ID-маппингом.

## Specs

- Governing: `spec://modules/machete/INFRA-004-sorareinside-starters#root`.
- Affected: `spec://modules/machete/INFRA-004-sorareinside-starters#root`.
- Constraint: product boundaries в `specs/common/main.md`, действующий deploy в `docs/DEPLOYMENT.md`.

## Scope

- In: исследование API, постоянный маппинг ID, выбор ближайшего матча, безопасное обновление основы и кэша, CLI, расписание, проверки и production rollout.
- Out: изменения интерфейса, пользовательских сохранённых составов, публикация данных аккаунта.

## Acceptance

- [x] Подтверждён формат реального API и стабильных идентификаторов.
- [x] Выбирается только ближайший будущий матч каждой команды; отсутствие его прогноза не ведёт к использованию следующего матча.
- [x] Неоднозначный/неполный маппинг не меняет галочки команды; повторный импорт не создаёт дубли.
- [x] Обновление атомарно и использует существующий механизм актуализации кэша.
- [x] Тесты, необходимые проверки проекта и production dry-run выполнены.
- [x] На сервере проверены запуск в :05, результат импорта, отсутствие конкурирующих записей, память и ограниченность артефактов.

## Result

Выпущена 0.3.68, commit `ec5d6f20bdf4b26831ebec30d3b6e98053e2c62d`. [Production workflow 34600220468](https://github.com/Tsyzhman/fantasy/actions/runs/34600220468) завершён успешно, health и release marker совпадают с commit. `npm run check`: 1107 passed, 1 skipped; lint, typecheck, production build passed. Spec snapshot current, diagnostics пусты.

Серверный dry-run: 150 READY, 61 UNCHANGED, 8 PLAYERS_UNMAPPED, 5 NO_MATCH_OR_TEAM_MAPPING, 2 неполных прогноза по 5 игроков. Память CLI 136 MiB. Второй процесс получил locked=false во время первого. Снимок до применения: 226 команд / 10036 флагов, закрытый серверный файл.

Startup: 150 APPLIED, 60 UNCHANGED. Проверенный почасовой запуск: 2026-09-11 13:05:00.005 UTC (16:05 МСК), завершён 13:08:21 UTC; 3 APPLIED, 207 UNCHANGED, 9 PLAYERS_UNMAPPED, 5 NO_MATCH_OR_TEAM_MAPPING, 2 SOURCE_ERROR. Следующий запуск назначен на 14:05 UTC. Между dry-run и применением изменился прогноз Lokomotiv, добавив ещё одного несопоставленного игрока. Неполные команды сохранены.

Проверка production БД: 210 составов с provenance SORAREINSIDE, в каждом ровно 11 активных игроков и точное совпадение галочек с ID из прогноза; 2027 постоянных PLAYER maps и 184 TEAM maps, обратных дублей нет. Очередь обновления пула пуста, 33 CURRENT_XI snapshots READY. Web/worker healthy, credential только в worker и приватном config 0600. Временные 18 локальных и 3 серверных файла удалены; приватный rollback snapshot сохранён. Worker 1.293 GiB (включая остальные фоновые задачи), Docker build cache 661.6 MB; оставлена штатная rollback-пара, временных audit containers нет.

Evidence: [dry-run](../../evidence/WI-018/dry-run.json), [реальные циклы и пропуски](../../evidence/WI-018/production-runs.json), [проверка БД](../../evidence/WI-018/production-db.json), [итог выпуска](../../evidence/WI-018/production.md), [spec snapshot](../../evidence/WI-018/spec-snapshot.json). Данные с отсутствующим/неактивным игроком требуют исправления исходного ростера или проверенной ручной ID-привязки; автоматическое угадывание запрещено каноном.
