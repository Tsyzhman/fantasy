# WI-011 — Футбольный дизайн сборщика для КХЛ

Kind: change
Canon action: direct-edit

## Outcome
Сборщик КХЛ использует контактные карточки и компоновку футбольного Squad, адаптированные к 17 хоккеистам.

## Specs
- Governing: spec://modules/khl/FEAT-002-khl-squad#layout
- Governing: spec://modules/betting/FEAT-001-virtual-league#opportunities
- Constraint: spec://modules/machete/FEAT-003-squad-player-card#contracts

## Scope
In: композиция, карточки, адаптивность, существующие действия, проверки и осторожная публикация.
In также: интеграция готового WI-009 Betting и production FDR по прямой просьбе пользователя.
Out: новые расчёты, источники данных и правила состава.

## Acceptance
- [x] Контактный лист, тематические цвета и каталог рядом на desktop; читаемые карточки на мобильных.
- [x] Сохранены 17 мест, keep, перестановки, фильтры, сравнение, сохранение и сценарии.
- [x] Проверены пять ширин, светлая/тёмная темы, дубли, память и кэш.
- [x] Проверки и production deployment завершены с evidence.

## Result
Было: большие текстовые блоки КХЛ, каталог под всем составом, сохранение внизу. Стало: общие футбольные contact-sheet стили, инициалы при отсутствии фото, полоса имени, FP/EP/TOI, прямые keep/удаление, раскрываемые подробности и перестановки. Каталог рядом от 1280px; на телефонах две колонки. Кнопки сохранения и подбора над составом. Пустое место фокусирует поиск по позиции. Правила 17 активных G2/D6/F9 сохранены.

Вместе по прямому запросу пользователя включены локальные исходы/EV из WI-009 и уже опубликованный FDR fix cd1ccda. Оригинальная локальная работа сохранена отдельным коммитом d4c7c92 и объединена без потери файлов. Runtime 0d059869b4cff0349ace6fc6d443e611c44b3878, release 20260907T194659Z-v0.3.62-0d05986; deploy 34156552775 success. Последующие commits меняют тесты, историю и evidence.

Проверки: 1081 unit pass / 1 skip; lint 0 errors / 105 warnings; typecheck/build pass. PostgreSQL проверил сортировку до пагинации, устаревание и параметризацию; тестовая транзакция полностью откатилась. KHL browser 14 pass (5 размеров, обе темы, действия, 50 навигаций/фильтров, worker); football 3 pass / 1 intended mobile skip. Production smoke 34157185770: auth 1 pass, UI 10 pass / 20 intended skips локальных fixtures и desktop-only сценариев.

Ресурсы: retained JS +592 bytes после 50 переходов; DOM 916→916, listeners 413→413. Фильтры ~3.3%, подбор ~2.5%; максимум 1 worker, отмена завершает его. CacheStorage 0, duplicate IDs 0. Локальная QA-сессия отозвана, серверы остановлены. Production web 368.8 MiB, worker 783.5 MiB; healthy, restarts 0. Каталог 694 уникальных игрока, receipts 9014→9014 между проверками; ledger mismatches 0. Новые сводки Betting заменяют данные текущей котировки и не создают историю в памяти. Исторические игнорируемые кэши не удалялись.

Evidence: specs/work/evidence/WI-011/{release.json,production-data.txt,post-smoke.txt,spec-snapshot-summary.json}; локальные скриншоты output/playwright-khl/design-*.png. Полные локальные логи .cache/khl-test/wi011-{integrated-check,browser,football}.log. Ограничения источников КХЛ не менялись; при отсутствии фото/прогноза показываются инициалы/«—».
