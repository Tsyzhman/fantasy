# WI-007: Объединённый выпуск локальных изменений 7 сентября

- Kind: `migration`
- Canon action: `direct-edit`

## Outcome
Общий чистый Git release сохраняет сегодняшние локальные изменения и действующий production и безопасно запущен на сервере.

## Specs
- Governing: `spec://modules/betting/FEAT-001-virtual-league#root`.
- Governing: `spec://modules/khl/INFRA-002-khl-storage-and-api#root`.
- Constraint: docs/DEPLOYMENT.md, docs/PRODUCTION_RELEASES.md; существующие FEAT Machete 001–004.

## Scope
- In: Git consolidation, конфликты, совместимость миграций, проверки, immutable release, backup/rehearsal/canary, health и ресурсы.
- Out: покупка feeds, включение неподтверждённых KHL источников, изменение продуктовых правил.

## Acceptance
- [x] Все локальные исходные изменения сохранены; временные credentials не включены.
- [x] Release содержит origin/main и действующий production commit.
- [x] Совместная схема, tests/lint/typecheck/build проходят.
- [ ] Backup, rehearsal и production revision/health подтверждены.
- [ ] Проверены пользовательские маршруты, дубли, кэши и память.

## Result
В работе. Исходный production d9abf51 (0.3.57); локальные изменения сохранены в codex/local-september7-snapshot, КХЛ в codex/khl-local-complete-20260907. Интеграция codex/integrated-release-20260907.

Predeploy: npm run check — 1069 pass/1 skip, 0 fail; lint 0 errors/101 warnings; typecheck и production build pass. 46 migrations на новой локальной БД, schema drift отсутствует; KHL storage/data-layer и betting wallet DB checks pass. KHL browser 9 pass/16 scoped skips, retained JS data +260 bytes, DOM/listeners стабильны; полный JIT-inclusive heap +10.89% записан отдельно. Проверены отсутствие credential в исходном diff и сохранение всех новых football runtime файлов из локального снимка.
