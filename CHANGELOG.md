# Changelog

## 0.3.122 - 2026-10-08

- Correct Sports.ru squad planning to three transfers per round without accumulating unused transfers, including older cached pools, saved-plan rollover and legacy opening allowances.
- Remove the incorrect accumulation claim from both transfer descriptions in Russian and English.
- Keep FPL transfer banking and point costs covered by regression checks.

## 0.3.121 - 2026-10-08

- Apply franchise calendar, league and completed-round filters automatically after a short pause, with immediate submit/retry, invalid-date feedback and cancellation of superseded requests.
- Make all franchise league choices visible, add quick single-league selection and retain multi-league comparisons, all-league reset and URL/reload state.
- Verify that bounded report-cache entries keep date/league populations and empty intervals separate.

## 0.3.120 - 2026-10-07

- Add per-league platform transfer summaries in football/FPL and KHL Squad, comparing each participant's latest saved plan with their latest eligible published-round squad.
- Show the top five additions/removals, counts, percentages and comparable sample coverage, with explicit empty/error states and bounded read-only aggregation.
- Correct both local workflow validators to honor explicit standalone mode while retaining managed receipt validation.
- Include the verified production browser smoke and compatible dependency patches from 0.3.119.

## 0.3.119 - 2026-10-06

- Align the production browser smoke with the bounded KHL source contract and the catalog snapshots actually displayed after history and view changes.
- Verify explicit unavailable-forecast messages during publication while preserving formula, coverage, sorting and complete XLSX checks for available data.
- Patch sharp to 0.35.5 and source-map-js to 1.2.2 to clear the production dependency audit failures.

## 0.3.118 - 2026-10-05

- Reconcile KHL fantasy weeks against fresh Sports calendars from both clubs, correcting stale assignments while preserving verified boundaries and historical statistics.
- Refresh club calendars in the existing hourly collector independently of cached player history; retain bounded correction evidence and invalidate affected week revisions.

## 0.3.117 - 2026-10-04

- Replace franchise chart label connectors with matching point/text colors in both themes; keep labels within the immediate point neighborhood.

## 0.3.116 - 2026-10-04

- Split purchase/form charts into stacked groups at horizontal H2h purchase delta 12 percentage points, preserving axes, labels, and missing-value access.

## 0.3.115 - 2026-10-04

- Redesign franchise scatter charts with small abbreviated names beside every point, an expandable searchable directory, exact values, sorting and profile selection (WI-047/WI-048). Split the ownership/captain chart into stacked groups at 35% starting-lineup ownership (horizontal axis).
- Preserve complete populations, CSV, calendar filters, formulas and bounded report caching; remove obsolete dense-label layout code.

## 0.3.114 - 2026-10-04

- Reuse franchise metric groups and bounded, revision-aware report JSON without changing calculations or filters.
- Release full Squad refresh working memory through a serialized child process and remove a redundant full-pool JSON copy.

## 0.3.113 - 2026-10-04

- Let expanded franchise graphs retain readable text sizes by using their full natural height.

## 0.3.112 - 2026-10-04

- Keep all franchise chart names readable and selectable with adaptive plot height, bounded label placement and connecting lines for dense groups of 75 points.

## 0.3.111 - 2026-10-03

- Patch Next.js and brace-expansion dependencies to clear the existing production audit failures before release.

- Compare managers across all available personal rounds, including reserve and frozen rounds and leagues outside their franchise tournament entry.
- Filter franchise reports by inclusive Moscow calendar dates shared across leagues.
- Register 74 workbook franchises and the virtual `шизы` group of 24 personal profiles, without board or freeze semantics.
- Deduplicate shared source squads, publish complete membership snapshots atomically, and bound snapshot encoding, examples and cache memory.


## 0.3.110 - 2026-09-28

- Record successful production verification of FPL squad import, repeated-import idempotency and resource cleanup; close WI-044.

## 0.3.109 - 2026-09-28

- Import published FPL squads when active shared-roster players have different FotMob positions, retaining official FPL positions, lineup and captain choices.
- Keep inactive and wrong-club players blocked before changing saved squads.
- Allow complete FPL price, schedule and official-score transactions to finish within a bounded 30-second limit.

## 0.3.108 - 2026-09-28

- Restore the complete production browser smoke against the current player search interface.
- Verify five betting assessments with explicit insufficient-history skips and bounded probabilities instead of requiring complete history for every live fixture.
- Retry only explicit KHL catalog revision conflicts during the statistics refresh check, with a bounded test budget that accommodates the existing forecast publication wait.
- Check KHL forecast publication immediately before opening the card and compare its formula with the exact refreshed catalog payload rendered by the interface.

## 0.3.107 - 2026-09-28

- Finalize the KHL server refresh status release with Moscow timestamps, separate full-success and latest-attempt outcomes, and source error visibility.
- Verify production authentication against the current protected planner component and compare player-card coverage using the selected history window.

## 0.3.106 - 2026-09-28

- KHL: publish the server refresh panel with Moscow timestamps, full-success and last-attempt outcomes, source errors and interrupted runs.
- Keep the production SSH promotion connected during quiet builds; bound Docker dependency download timeouts and retries after a disconnected release attempt.

## 0.3.105 - 2026-09-28

- KHL: show catalog and full-success date/time in Moscow, the latest refresh outcome, affected sources, active runs and interruptions on all KHL views.
- Keep the previous success timestamp on source errors and pending batches; poll a bounded authenticated status endpoint without collecting provider data.
- Integrate the published KHL/franchise/Telegram features with main's documentation, patched dependencies and isolated CI checks.

## 0.3.104 - 2026-09-28

### Documentation

- Record the successful Linux security and application checks, document the CI test environments, and archive WI-041.

## 0.3.103 - 2026-09-28

### Checks

- Run CI unit-test files serially so timing assertions do not compete with other tests for CPU and memory; retain the existing five-second optimizer limit.

## 0.3.102 - 2026-09-28

### Checks

- Run all tracked database integration tests in disposable common, betting, and KHL databases that match the existing safety guards; enable the isolated KHL test cases and run each group serially.
- Record the verified dependency remediation and resolve TD-007.

## 0.3.101 - 2026-09-28

### Build

- Regenerate the dependency lockfile with CI's npm 10.8.2, restoring the required optional WASM runtime entries without changing the patched dependency versions.

## 0.3.100 - 2026-09-28

### Security

- Update the sharp override and its native libraries to patched releases.
- Refresh compatible baseline-browser-mapping, browserslist, and postcss-selector-parser resolutions to address dependency denial-of-service vulnerabilities.

## 0.3.99 - 2026-09-28

### Documentation

- Record verified publication of the English documentation on the default GitHub branch and archive WI-039 with validation evidence.

## 0.3.98 - 2026-09-28

### Documentation

- Translate public Markdown documentation to English, organize it by topic, add an index and current project overview, and repair references while preserving contract anchors.
- Consolidate Git ignore rules for local configuration, credentials, generated files, caches, and reports; stop tracking the generated `next-env.d.ts` file.

All production versions are built from Git commits and tagged after successful
promotion. Runtime identity is available from `/api/health` and from the OCI
image labels `org.opencontainers.image.version` and
`org.opencontainers.image.revision`.

## 0.3.97 - 2026-09-25

- FEAT-007: расписание в сообщении — только строки «Команда 1 - Команда 2» (без `<pre>`, даты, времени, статусов); убраны отметки времени обновления данных («загружен …», «Статистика/кэфы/прогнозы XI»), источник состава указывает только опубликованный тур.

## 0.3.96 - 2026-09-25

- FEAT-007: в таблице расписания скрывается технический статус `NOT_STARTED` (остаются только переносы/отмены), подпись источника не дублирует «тур».

## 0.3.95 - 2026-09-25

- FEAT-007: расписание в сообщении — два столбца (хозяева | гости) без даты и времени МСК; секции роста/падения доли выбора убраны из сообщения (данные остаются в БД); официальные популярные трансферы выводятся без очков — только имя и команда.

## 0.3.94 - 2026-09-25

- Синхронизация Sports.ru различает одинаковые заголовки Premier League по HRU: Russia → `Russian Premier League`, England → `English Premier League`; теги и маппинг трендов больше не путают РПЛ и АПЛ.

## 0.3.93 - 2026-09-25

- FEAT-006: часовой guard трансферных снимков проверяет наличие расширенного топа (`TRANSFERS_GAIN`), а не официального, чтобы не пропускать сбор после частичного сбоя.

## 0.3.92 - 2026-09-25

- FEAT-006: если у целевого тура ещё нет опубликованного графика владения, расширенный топ трансферов строится по последнему доступному туру и явно помечается; идемпотентность снимков не зависит от совпадения тура.

## 0.3.91 - 2026-09-25

- FEAT-006/WI-037: отчёт дедлайна показывает официальные популярные трансферы Sports (`topTransferPlayers`, топ-3 с очками) и расширенный топ-10 роста/падения доли выбора за тур по `chartSelectedBy`; точное число трансферов API не публикует — это явно помечено.
- Сбор трансферов bounded: один раз на турнир/тур (до 6 страниц пула), идемпотентно в пределах часа; в сообщение попадают тур и источник.
- Неофициальный расширенный рейтинг отделён от официального списка Sports и не подменяет его.

## 0.3.90 - 2026-09-25

- Шапка: пункты без иконок. Вторая навигация раздела заменена путём «Machete / страница». На составе лига и свежесть стоят в этой строке. «Задачи данных» перенесены в общую шапку.
- FEAT-006/FEAT-007: теги и маппинг трендов понимают английские названия турниров Sports (`Championship`, `Premier League`, `Champions League`, `LaLiga`, `Bundesliga`, `Serie A`, `Ligue 1`, `Eredivisie`, `Liga Portugal`, `Super Lig`); добавлен тег `#Турция`.
- Проверено на реальном отчёте Championship через production pipeline (WI-036/WI-034 verification).

## 0.3.89 - 2026-09-25

- FEAT-007/WI-036: бот получает updates через long polling (`getUpdates`) поверх VPN relay в worker-роли, потому что Telegram не может открыть входящее соединение к хосту; offset продолжается от durable inbox, webhook удаляется и остаётся альтернативой.
- VPN relay allowlist расширен read-only `getUpdates`.

## 0.3.88 - 2026-09-25

- FEAT-007/WI-035: бот отвечает без AI — `/start` даёт приветствие и инструкцию с кодом, введённый код получает результат «подошёл/не подошёл» с email аккаунта; подтверждение на сайте остаётся обязательным, конфликт чужого Telegram аккаунт не раскрывает.
- VPN relay: в allowlist добавлен read-only `getWebhookInfo` для операторской проверки webhook.

## 0.3.87 - 2026-09-25

- FEAT-007/WI-034: сообщение дедлайна включает опубликованные Sports списки покупок и продаж (до 10 игроков, исходный порядок, значение, единица и ссылка на источник); отсутствие публикации не блокирует отчёт.
- Telegram Bot API идёт через существующий VPN relay (`sharovik-vpn`): тот же Unix-сокет, что у FPL, с allowlist методов `sendMessage`/`setWebhook`; прямой доступ к `api.telegram.org` без VPN не используется.
- `/profile` автоматически показывает ротируемый каждые 15 секунд код для не привязанного пользователя; код и сессия доступны только владельцу под session auth, `no-store` и без записи открытого кода в БД/логи.
- Deploy: `TELEGRAM_*` и `SPORTS_TRENDS_*` теперь берутся из операторского `/home/deploy/.config/fantasy-scout/notifications.env` (mode 600) в web и worker, без секретов в Git и архивах релиза.
- Admin: `POST /api/admin/telegram/webhook` регистрирует webhook бота через VPN relay (admin session), когда появится `TELEGRAM_BOT_TOKEN`.
- Production: включены `TELEGRAM_LINK_ENABLED`, `TELEGRAM_DEADLINE_ENABLED`, `TELEGRAM_SEND_ENABLED`, `SPORTS_TRENDS_SYNC_ENABLED`; paid broadcast остаётся false.

## 0.3.86 - 2026-09-25

- FEAT-006: парсер опубликованных рейтингов Sports (покупки, продажи, владение, капитаны, до 15 игроков), история ownership и дельта в п.п. из `selectedByPercent`, bounded collector с source/revision/retention, read API и панель «Популярное на Sports» в Squad. Сбор включается `SPORTS_TRENDS_SYNC_ENABLED` (по умолчанию off).
- FEAT-007: привязка Telegram через deep link и код с ротацией 15 секунд, подтверждение в профиле, webhook с secret token и durable inbox, подписки по турнирам, пауза и отвязка. Включается `TELEGRAM_LINK_ENABLED` (по умолчанию off).
- INFRA-005: кампании дедлайна 08:00/08:10/09:00 МСК с gate `DEADLINE_CONFLICT`/ранний дедлайн, классификация ALT/blank/XI/unknown, отчёт с тегами и тремя столбцами, outbox с free-лимитом 25/с, retry и `DELIVERY_UNKNOWN`. Флаги `TELEGRAM_DEADLINE_ENABLED` и `TELEGRAM_SEND_ENABLED` по умолчанию off (shadow-режим).
- Additive-миграция `20260925081319_sports_trends_telegram_deadline`: новые таблицы trends/telegram/deadline, существующие потоки и UI не меняются.

## 0.3.85 - 2026-09-21

- xФО сопоставляется с реальными ФО одной и той же основы без капитанского удвоения в обоих показателях; ФО и разница показаны также у менеджеров и по чемпионатам.
- Исправлено подключение пакетного сборщика к существующей БД в production: параметры Prisma передаются PostgreSQL по отдельности, без ошибочного локального сокета.
- «Франшизы»: мобильные таблицы сравнения прокручиваются внутри карточек и больше не растягивают страницу шире экрана.
- Явно показано, что диапазон туров применяется к каждой лиге отдельно, сколько составов вошло по каждому чемпионату и почему в xФО может не быть оценки.

## 0.3.84 - 2026-09-21

- Новый модуль «Франшизы» вне Machete: доступ после входа, выбор чемпионатов и диапазона туров сезона 2026/27, 12 франшиз включая Fratelli.
- Сохранение решений H2H в PostgreSQL, восстановление кэша и расчёт аналитики без ИИ и без внешних запросов при фильтрации.
- Рейтинги стиля и xФО по формуле Excel, покрытие данных, текущие и исторические прогнозы, частота и эффект заморозок.

## 0.3.83 - 2026-09-20

- КХЛ: архивные протоколы заполняют статистику подтверждённых игроков даже при отсутствии карточки Sports. Происхождение показано в интерфейсе; отсутствующие FP и сведения о пропусках не выдумываются, последующее восстановление Sports безопасно дополняет снимок.

## 0.3.82 - 2026-09-20

- КХЛ: неполные протоколы завершённых матчей повторяются отдельно в следующем часу и не блокируют остальные игры; противоречивые строки Sports сохраняют последние проверенные значения и не откатывают всю историю игрока.

## 0.3.81 - 2026-09-20

- КХЛ: новые подтверждённые привязки обновляют покрытие архивной статистики; неизменённые связи используют кэш. Отсутствие свежего подтверждения травмы обозначается корректно, подробный quarantine не повторяется в итоговом журнале.

## 0.3.80 - 2026-09-20

- КХЛ: проверка всех игроков по независимым датам рождения, безопасный импорт подтверждённых связей и автосверка новых игроков; различия имён и fantasy-амплуа больше не теряют протоколы.
- Официальные списки травмированных обновляются каждый час с ограниченным сроком актуальности и очисткой истории.

## 0.3.79 - 2026-09-20

- КХЛ: часовой сбор использует свежий каталог и ждёт занятую публикацию при старте, не сообщает ложную ошибку из-за конкурирующего worker. Подробный quarantine не дублируется в журнале каждого пакета.

## 0.3.78 - 2026-09-20

- КХЛ: полный публичный протокол через лёгкий HTTP REST без браузера на сервере; проверка идентичности и состава полей.
- Серверное обновление каждый час в :22 МСК, инкрементальные очереди и ограниченные архивные пакеты вместо принудительного полного сбора.

## 0.3.77 - 2026-09-18

- Production deploy still promotes when GitHub cannot store the release archive because artifact quota is full.

## 0.3.76 - 2026-09-18

- Squad advances to the Sports.ru OPENED round even when a finished round still has one postponed match left as NOT_STARTED.

## 0.3.75 - 2026-09-16

- Correct the Europa League fantasy limit to three players per club in Squad, price sync and the current persisted contest.

## 0.3.74 - 2026-09-14

- The release is waiting for the completion of the full collection of KHL before stopping the containers; The scheduled collection is waiting for the server replacement to be completed.

- KHL: each full training camp re-checks the Fonbet dictionary of hockey outcomes; a normal line update stores the time of the last actual dictionary check.

## 0.3.73 - 2026-09-14

- KHL: clicking on EP opens the expected G/A/SOG/PIM/+− and initial amounts, coverage, weights and formulas; full Excel supplemented with a waiting list.
- EP summarizes individual matches with a transparent beta-correction of the attack on a fresh, verified Fonbet line in 60 minutes; no line—explicitly specified base forecast.
- A complete collection of Sports, calendar and KHL protocols, archive and line is launched in 10:00 and 20:00 MSC. Repetitions are limited by lock/checkpoints, source errors keep the last good data and a separate status.
- Between full cycles, coefficients and EP are updated; publication history is limited to 96 photos for the tournament and seven days.

## 0.3.72 - 2026-09-14

- The last KHL season is supplemented with accurate match protocols: shots, TOI, power play, minority and time in attack with separate coverage.
- Last year's throws and their implementation are included in the EP; official FP Sports are preserved, re-import does not double the data.
- Hints for each column and cell: meaning, calculation, period, coverage, source and player EP components; available reference of indicators.
- Full Excel of the entire catalog, regardless of page and filters: six sheets with current/past statistics, averages, forecasts and help.
- Fixed directory expansion beyond the page on the desktop; The wide table retains its own scrolling.

## 0.3.71 - 2026-09-13

- KHL: shots, goals, assists, penalty minutes and plus/minus in separate sortable columns; maximum two decimal digits in indicators.
- Archive of the previous Sports season, separate viewing period and limited prior for a short current story.
- Single explainable EP: G/A/SOG/PIM/+/−, contribution of indicators, frequency of participation and sample sizes. Official FPs are retained.
- Additive table khl_historical_seasons; idempotent import and migration of a verified local archive.

## 0.3.70 - 2026-09-13

- Split KHL TOI, PP, PK and attack time into separate sortable columns with per-field coverage.
- Use a compact hockey rink on desktop and a readable touch roster on mobile, following the corresponding football Squad views.
- Import the current 17-player Sports hockey squad through the linked public profile, with verified ownership, atomic saves, source errors and bounded snapshots.

## 0.3.69 - 2026-09-13

- Keep known KHL TOI/PP/PK/attack averages visible when other matches lack those fields, with explicit per-field coverage.
- Refresh KHL statistics without resetting draft selections or filters; accept fresh server snapshots instead of retaining stale initial data.
- Open the KHL catalog with forecast leaders and distinguish missing match statistics from observed zeros.

## 0.3.68 - 2026-09-11

- Import starting-XI predictions from each club's nearest future SorareInside fixture every hour at :05, using persistent player/team UUID mappings.
- Preserve complete team flags on missing predictions or unresolved identities; refresh current-XI caches transactionally and prevent older automatic sources overwriting an upcoming prediction.
- Add a bounded dry-run/apply CLI and private worker-only credentials, with no schema migration or changes to saved user squads.

## 0.3.67 - 2026-09-11

- Aggregate KHL season statistics from individual match protocols, including attack time and per-field coverage; preserve Sports.ru official fantasy scores.
- Publish a clearly labelled seven-day beta EP from official FP history and observed appearances, independent of unverified fantasy-week boundaries.
- Add bounded, idempotent protocol imports with source priority, raw retention and explicit HTTP access failure reporting. Ready-made individual xG remains unavailable without a verified feed.

## 0.3.66 - 2026-09-08

- Correct the Champions League fantasy limit to three players per club in Squad, price sync and the current persisted contest.

## 0.3.65 - 2026-09-08

- Fix Squad Excel exports for full league pools above 1000 players; support up to 5000 rows, matching the player-page export.

## 0.3.64 - 2026-09-08

- Restore UCL club mappings for Bodø/Glimt, Club Brugge, Sabah, Shakhtar and Slavia.
- Support scoped, reviewable Sports.ru roster backfills using existing provider-only identities when FotMob lacks a squad.
- Apply the reviewed UEFA Matchday 1 predictions for all 36 UCL teams (396 starters), preserving source provenance and restoring eight missing Sports.ru price mappings.

## 0.3.63 - 2026-09-08

- Load real KHL player match history, official fantasy points, TOI and goalie statistics from public Sports.ru profiles matched to the KHL calendar.
- Refresh changed players in bounded worker batches with resumable checkpoints; preserve DNP, unknown fields and correction history.
- Show match-specific FP and scoring/goalie facts in KHL player history.

## 0.3.62 - 2026-09-07

- Include local Arena opportunity ranking and multiple unique recommended outcomes per match; retain all five algorithm cards.
- Adapt football Squad contact-sheet cards and side-by-side catalog to KHL, retaining all 17 active slots and hockey actions.
- Add position-filter shortcuts from empty slots and expandable player details with direct keep/remove controls.

## 0.3.61 - 2026-09-07

- Restore FDR difficulty colours on opponent chips in tables and squad cards in both themes; keep neutral fallback from overriding rated fixtures.

## 0.3.60 - 2026-09-07

- Restore the latest owned KHL draft on entry and provide an explicit new draft action.
- Allow European league-phase models to combine domestic history and prior European games, with explicit regulation-time gates.
- Remove the manual settlement tab and dialog from Arena. Keep virtual result settlement.
- Expire match advice with scoped one-shot timers instead of redrawing the market list every second.

## 0.3.59 - 2026-09-07

- Enable the real KHL catalog and local drafts, with bounded recurring catalog refresh and explicit unavailable forecasts.
- Show five algorithm advice cards directly inside the selected match, with a best pick or an explicit skip reason.
- Use the same league list and order as Squad in Betting, including leagues without loaded events.

## 0.3.58 - 2026-09-07

- Consolidate local global-ranking strategy, rotation risk, squad contact-sheet UI and provider ownership changes with the deployed Arena release.
- Add isolated KHL storage, planning UI, bounded ingestion and optimizer; production source/readiness flags remain disabled.
- Preserve all existing navigation and use bounded web-vitals collectors. Order new KHL migrations after the deployed migration history.

## 0.3.57 - 2026-09-07

- Add Arena, a virtual Fonbet league for existing Fantasy users and five experimental algorithms.
- Give each participant 100,000 coins once; record accepted odds on each immutable ticket, with atomic spending, idempotent payouts and an auditable ledger.
- Browse full pre-match markets in downloaded leagues, compare recommendations, skip events, track results and settle special markets with an admin source record.
- Add bounded worker synchronization and an additive database migration. WI-005.

## 0.3.56 - 2026-09-01

### Fixed

- Rebuild bookmaker favorites as a compact `table-fixed` sidebar so favorite, clean-sheet and team over-1.5 columns stay aligned beside transfer suggestions without overflowing.

## 0.3.55 - 2026-09-01

### Changed

- Count Sports.ru transfers as 3 per round with unused banking up to 6, and use FPL banked free transfers from the last import.
- Add a squad rollback control that restores the last save on this page.
- Recolor fixture difficulty 1–5 as blue, green, yellow, orange and red for both themes, and apply those fills site-wide.
- Make bookmaker favorites denser, show oldest/newest starting-XI flag updates in data freshness, and drop the fixture-calendar easiest-to-hardest caption.
- Shrink FO/ALT hover tooltips to total plus every arithmetic term, without the formula text, component grid, or truncated term list.

### Fixed

- Keep budget/bank/transfer metrics from clipping, make the bench Replace control icon-only, and restore the previous compact squad-card layout.

## 0.3.54 - 2026-09-01

### Changed

- Collapse Squad to one current squad. Remove saved-variant and variant-name
  controls, preserve existing squad names, and name only newly created squads
  from the user name plus `squad`.
- Put next-round, forecast, budget, bank and transfer-limit progress directly
  above the squad; move Round forecast below it and keep the existing
  planning configuration without exposing a separate settings panel.
- Make save and provider-import actions icon-only, move Fits beside the price
  range, and show at most two compact transfer suggestions beside denser
  bookmaker favorites.
- Tighten the all-team fixture calendar, use difficulty as the cell background,
  enlarge fixture text, simplify its legend and remove the explanatory footer.
- Use the position order FWD, MID, DEF, GK, UNK consistently across player and
  squad tables, exports and optimizer output.

### Performance

- Compute only the two displayed suggestion plans and page position-sorted
  database reads in bounded groups instead of loading a full player table.

### Fixed

- Copy tracked local npm packages into the Docker dependency stage and invoke
  the pinned Prisma CLI directly, so an incomplete install cannot silently
  download an incompatible latest CLI during a production build.

## 0.3.53 - 2026-09-01

### Fixed

- Run the model-forecast cycle in a disposable production subprocess. Explicit
  V8 collection still bounds the peak between leagues, while process exit now
  guarantees that native allocator pages return to the OS instead of remaining
  in the long-lived worker's RSS.

## 0.3.52 - 2026-09-01

### Fixed

- Restrict background model-forecast recalculation to current Sports.ru
  contests that are actually available in Squad. Stale current-season metadata
  for legacy UEFA tournaments no longer schedules unused work.
- Release each league's temporary forecast working set before processing the
  next league. The production worker now exposes explicit V8 collection and
  reports post-cycle RSS/heap counters for memory acceptance checks.

## 0.3.51 - 2026-09-01

### Added

- Add an all-team fixture calendar at the bottom of Squad, with a 5–10-round
  horizon, separate attack/defence difficulty and easiest-to-hardest ranking.
  Reuse the player-table FDR scale and show home/away, double and blank rounds.
- Store one normalized calendar in each league snapshot, not in player rows.
  Reuse existing fixture calculations, lazily render the table near the viewport,
  and update it with the existing background snapshot flow without resetting
  the user's draft or calendar controls. Old snapshots upgrade in the worker.

### Changed

- Retire the six position-calibrated/Joint forecast variants from Squad and
  player tables. Preserve the parsed external FFO, primary FO and personal ALT,
  including their existing round and starting-XI behavior.
- Stop constructing adaptation player/team features, six sets of coefficient
  breakdowns and their server cache. Do not load shot histories or adaptation-only
  team statistics during player-pool refreshes. Research artifacts remain offline
  and are not imported by the application calculation path.
- Drop retired fields when reading older rotating snapshots. Migrate saved
  columns, widths and filters without discarding unrelated preferences. Requests
  from old formula tooltips return authenticated HTTP 410 without recalculating
  players. No database migration or snapshot purge is required.

### Fixed

- Make Sports.ru league switching in Squad immediate and latest-request-wins.
  Cancel the previous league's progressive/background player downloads as soon
  as a new league is selected, keep stale/intermediate league responses blocked
  until the matching planner mounts, and use a guarded full-navigation fallback
  only if the complete page does not commit.
- Upgrade Next.js from 16.2.12 to 16.3.4, which includes the upstream route-cache
  fix for stale query parameters being restored by `router.push`/`router.replace`.

## 0.3.50 - 2026-08-31

### Added

- Precompute one complete CURRENT_XI player-pool snapshot per current Sports.ru
  league in the worker at every exact Moscow hour from 10:00 through 23:00.
  Publish atomically and retain three READY revisions; there is no NO_XI copy.
- Persist and deduplicate manual/imported starting-XI changes in the same
  transaction as their flags. A separate worker groups affected teams by league,
  recalculates only changed team vectors, and safely retries concurrent edits.
- Render the saved squad and its forecasts directly from PostgreSQL; load the
  remaining complete forecasts in approximately 10% batches, prioritizing all
  saved-squad players and then Sports.ru popularity. Forecast calculation is
  no longer part of ordinary default-history page requests.
- Silently poll snapshot revisions while the squad tab is visible and merge a
  fully downloaded revision without replacing unsaved selections, captain,
  filters, search, or scroll. Retry an expired initial revision automatically.
- Mark batch rendering as a non-blocking transition so clicks and typing take
  priority over background player-list updates.
- Add `snapshots:player-pool` for controlled initial publication and diagnostics.

### Fixed

- Restrict the legacy six-hour model-forecast worker to Squad's shared league
  allowlist and one current season per league. Do not schedule archived seasons
  or unrelated cups just because their player memberships remain active.
- Keep mapped Sports.ru players without active FotMob memberships in targeted
  team refreshes. Use the complete authoritative team roster so incremental
  publication preserves every player and the full team's formula allocation.

## 0.3.49 - 2026-08-29

### Added

- Load the fantasy squad player pool progressively: an inexpensive first batch
  contains the active squad followed by the most-owned Sports.ru players, and
  subsequent 64-player batches enrich and complete the list without blocking
  early interaction.
- Persist Sports.ru's player ownership percentage alongside each current price
  and use it as the canonical popularity order with the existing Foontasy value
  retained as a fallback.
- Extend the guarded production price-sync job to refresh Championship alongside
  FPL and Sports.ru EPL, so the largest pool is covered by the same repeatable
  operator workflow.

### Fixed

- Preserve distinct Sports.ru provider players who happen to share the same
  normalized name and club; the legacy name/team uniqueness guard now applies
  only to imports without a provider player ID.

## 0.3.48 - 2026-08-28

### Added

- Reworked the fantasy squad planner into a first-class mobile and tablet
  experience with persistent navigation, touch-sized roster controls, inline
  player actions, and one-step replacements without bouncing between dialogs.

### Fixed

- Bounded local upload discovery and scrubbed local databases, environment
  files, QA output, and development caches from the standalone production
  artifact after every build.
- Kept generated Next.js server chunks inside the standalone runtime and made
  failed production canaries print their startup log before cleanup.

## 0.3.47 - 2026-08-28

### Added

- Added Ligue 1 probable-lineup synchronization from Fantasy Coach. The parser
  selects the latest advertised gameweek, requires all 18 clubs with 11 unique
  players each, and is available through the daily 14:30 UTC scheduler, CLI,
  and the existing admin ingestion page.

## 0.3.46 - 2026-08-28

### Fixed

- Keep a confirmed `official-transfer` club assignment ahead of a stale
  Sports.ru price-team mapping in both the fantasy player pool and transactional
  squad validation. Sports.ru remains authoritative over ordinary FotMob roster
  lag, while completed-match FotMob starting-XI promotion is unchanged.

## 0.3.45 - 2026-08-28

### Fixed

- Accept the official FPL live endpoint's boolean `in_dreamteam` and `played`
  flags while retaining strict numeric validation for scoring data. FPL price
  synchronization can now complete its finalized-gameweek score refresh.

## 0.3.44 - 2026-08-28

### Fixed

- Deactivate stale player memberships and starter flags when FotMob removes a
  club from a league season. This keeps source-agnostic roster consumers such
  as price mapping and forecasts from seeing players at both their current and
  relegated clubs.

## 0.3.43 - 2026-08-28

### Fixed

- Added a durable `official-transfer` roster override for the short window in
  which a club has confirmed a transfer but FotMob still exposes the player in
  the old squad. FotMob refreshes can update the confirmed target membership,
  but cannot reactivate a conflicting stale-club membership.

## 0.3.42 - 2026-08-28

### Fixed

- Split production scheduler ownership between the web and worker containers.
  Heavy background schedulers and their dependency graphs now load only in the
  worker, while FPL and probable-lineup schedules remain in web alongside their
  admin-trigger concurrency guards. This prevents duplicate startup work,
  forecast recalculations, FPL transaction timeouts, and avoidable web memory
  use.

## 0.3.41 - 2026-08-28

### Fixed

- Fixed Serie A probable-lineup matching for joined surnames such as
  `Delprato` / `Del Prato` and for roster nicknames such as
  `Valdepenas` / `Valde` when the source and active roster also agree on the
  shirt number. A shirt number alone is still insufficient to match a player.
- Probable-lineup scheduler warnings now identify each skipped team, unresolved
  source player, reason, and bounded candidate list instead of exposing only an
  aggregate skipped-team count.

## 0.3.40 - 2026-08-27

### Added

- Added independent admin buttons for manually refreshing EPL, Serie A, and
  Bundesliga probable starting lineups from the existing ingestion page. The
  admin-only route accepts only server-defined source keys and shares the
  scheduler's concurrency guard and per-team advisory locks.

## 0.3.39 - 2026-08-27

### Added

- Added the production probable-lineup scheduler: it performs an idempotent
  startup catch-up and then synchronizes EPL, Serie A, and Bundesliga every day
  at 14:30 UTC. Deployment canaries explicitly disable the scheduler so they
  cannot mutate production starting-XI flags.

## 0.3.38 - 2026-08-27

### Added

- Added a guarded probable-lineup sync for Premier League (Fantasy Football
  Scout), Serie A (Gazzetta), and Bundesliga (LigaInsider), with dry-run/apply
  modes, dynamic discovery of LigaInsider club URLs, exact FPL provider-code
  matching, roster-scoped fallback matching, compact provenance, and strict
  league/team completeness checks.

### Changed

- Unified actual-match, manual, and probable-lineup writes on the same
  per-team PostgreSQL advisory lock.
- Updated the pinned `nanoid` and transitive `js-yaml` patch releases to remove
  the high-severity advisories found during the dependency audit.

## 0.3.37 - 2026-08-26

### Changed

- Pinned the sticky global header navigation to the right, so the chrome sits
  with the content's trailing edge instead of stretching from the left on wide
  screens.
- Halved the Bookmaker favorites panel and pinned it to the right of transfer
  suggestions on wide screens.

## 0.3.36 - 2026-08-26

### Changed

- Transfer recommendations and auto-pick now score a squad as the maximum-FO
  starting XI (1 goalkeeper + 10 outfield players), so leftover budget is not
  spent on luxury bench pieces that never enter that XI.
- Tightened Cloudline type and control sizes so dense planner screens fit more
  content, and widened page shells for ultrawide monitors—especially the squad
  pitch and player-pool table.

## 0.3.35 - 2026-08-26

### Changed

- Adopted the Isty Cloudline design system across the product: Cloud Day and
  Cloud Night semantic tokens, page atmosphere, rounded surfaces, gradient
  primary actions, Onest plus JetBrains Mono, and a persisted theme toggle.

## 0.3.34 - 2026-08-26

### Fixed

- Leagues whose provider statistics contain no player xG/goals or recoveries
  at all now receive forecasts via a uniform split of the team totals across
  the probable squad instead of failing allocation for the whole scope.

## 0.3.33 - 2026-08-26

### Fixed

- The forecast recalculation scheduler isolates per-league failures: a league
  whose provider statistics cannot support allocation (no player xG or
  recoveries recorded) no longer blocks recalculation of the other active
  leagues; it is logged and retried on the next cycle.

## 0.3.32 - 2026-08-26

### Added

- Fantasy model forecasts are now recalculated automatically: an in-process
  scheduler recomputes `XG_SHARE_V2` forecasts for every active league/season
  scope shortly after startup and then every six hours (configurable via
  `FANTASY_MODEL_FORECAST_SYNC_INTERVAL_HOURS`, disable with
  `FANTASY_MODEL_FORECAST_SYNC_ENABLED=false`). The manual
  `forecasts:recalculate-model` script remains available.

## 0.3.31 - 2026-08-26

### Changed

- Fantasy model forecasts now use the xg_share allocation: a player receives
  the team's next-match expected goals and assists in proportion to their
  blended share of the team's observed xG/xA (season weighted 0.6, last three
  team matches weighted 0.4). Shares are fractions of actual team totals, so
  part-time players can no longer be inflated beyond the team expectation.
- Model version bumped to `XG_SHARE_V2`; stored forecasts are recalculated
  under the new version on the next `forecasts:recalculate-model` run.
- Fixture breakdowns now persist the season/recent/blended shares used for
  the attack projection.

## 0.3.30 - 2026-08-25

### Changed

- Consensus weights rebalanced to trust the user's alternative formula first
  (0.5), then the external Foontasy number (0.3), with the primary projection
  as a stabilizing baseline (0.2).

## 0.3.29 - 2026-08-25

### Added

- Squad recommendations now run on a consensus engine that blends the primary
  projection, the user's alternative formula and the external Foontasy number
  (weights 0.5/0.2/0.3) instead of trusting a single model.
- Auto-pick "Reliable" strategy adds a rotation-risk floor guard on expected
  minutes and start probability; "Upside" caps the volatility bonus so junk
  minutes cannot masquerade as ceiling.
- Transfer suggestions weigh clamped recent-form tilt, confident low-owned
  differentials (Foontasy ownership now reaches the planner), and a small
  fixture-run tie-breaker; plans earn cross-model agreement and calendar-swing
  bonuses, flag differential picks in their reason, and the captain tie-break
  prefers ceiling volatility among equal next-round projections.

## 0.3.28 - 2026-08-25

### Added

- MiXerr shot maps gained an xG-weighted heat-map overlay built from the
  currently filtered shots, toggleable next to the goal/SOT filters and drawn
  under the shot markers with a legend swatch.

### Removed

- Assisted-pass attribution in MiXerr (top pass creators table, assist
  tooltips and shot DTO fields): FotMob only publishes passers on goal
  incidents, so per-shot attribution was misleadingly sparse.

## 0.3.27 - 2026-08-25

### Added

- MiXerr shot maps now attach the final passer to every assisted goal by
  joining the synced goal incidents, surface a "Top pass creators" table with
  assists and assisted xG below the top shooters table, and show the passer in
  each shot tooltip. FotMob publishes passers only for goals, so other shots
  stay unattributed.

## 0.3.26 - 2026-08-25

### Added

- Machete squad planning tables are archived per fantasy round exactly one
  minute before the first kickoff. round boundaries come from the synced
  Sports.ru provider rounds, captures run on one precise timer per round, and
  the stored player pool is exportable with `npm run snapshots:squad` for
  comparing pre-deadline forecasts with real fantasy results.

## 0.3.25 - 2026-08-24

### Added

- Squad projections expose dedicated detail payloads and formula explanations
  without loading the complete player pool for every interaction.
- Release version verification now keeps `package.json`, `package-lock.json`,
  and the newest changelog entry synchronized and rejects unversioned change
  sets in CI.

### Changed

- Machete squad loading reuses bounded shared reads, preserves imported slots,
  and remains ready while fixture kickoffs move through the active window.
- Sports.ru mappings cover current Bundesliga and Serie A team names, and the
  Championship calendar uses the canonical fantasy route.
- Local spreadsheet working artifacts under `.codex_sheet_work` no longer
  pollute Git status.
- Repository text files are pinned to LF so Windows `core.autocrlf` settings
  cannot turn a small edit into a whole-file diff.

### Fixed

- Sports.ru squad imports can finish while the player pool is still loading.
- Sports.ru club limits now use one explicit CoreLeague-ID matrix, with three
  players allowed for both LaLiga and the Russian Premier League.
- Projection formula tooltips retain a readable bounded width.
- The production FPL relay now uses bounded Docker log rotation.

## 0.3.24 - 2026-08-20

### Changed

- Forecasts are aggregated across provider rounds before they are presented in
  the Machete planner and player table.
- Formula adaptation explanations distinguish official FPL scoring from the
  component projection model.

## 0.3.23 - 2026-08-20

### Fixed

- Sports.ru squad imports retain provider players that do not yet have an
  internal identity mapping, including their selections and prices.
- Applying an imported squad no longer loses unresolved players during planner
  normalization or reload.

## 0.3.22 - 2026-08-20

### Fixed

- Provider fixture team names are stored independently from canonical club
  names so later schedule and price refreshes preserve verified mappings.
- Sports.ru player matching reuses the persisted provider-team identity across
  fantasy synchronization and squad planning.

## 0.3.21 - 2026-08-20

### Added

- Versioned provider fantasy schedules and team-name mappings support
  provider-specific rounds across Sports.ru and FPL.
- The planner exposes roster and forecast coverage, while the FPL integration
  uses official names, scoring, and the production VPN relay.
- Audited Sports.ru mapping workflows cover current Ligue 1 teams and finalized
  player identities.

### Fixed

- Forecast minutes are scoped by competition, and a Foontasy refresh updates
  the active fantasy pool without requiring a reload.

## 0.3.20 - 2026-08-09

### Added

- The prepared Champions League UEFA assistant can now be imported into its
  own source namespace. It still fails closed unless at least 90 percent of
  its player IDs overlap the current Sports.ru phase and at least 90 percent
  resolve to internal players. The final URL must retain the UEFA marker and
  its normalized payload must differ from the companion Sports assistant, so
  an ignored query cannot create a mislabeled duplicate.

### Changed

- The legacy flat Foontasy round keys and their redundant query indexes are
  removed after the source-aware writer has occupied the rollback slot.
  Version 0.3.19 remains a compatible rollback because it already writes and
  reads the new source-aware identity.

## 0.3.19 - 2026-08-09

### Changed

- Foontasy forecasts and historical samples now use their source variant,
  Sports.ru phase, phase round, and player ID as the writer identity. The
  previous round-based unique keys remain alongside the new keys for one
  rollback-compatible release.
- Placeholder source fields are backfilled again immediately before the new
  keys are created, covering any rows written during a rollback to 0.3.17.
- UEFA writes remain closed until the previous writer has left the rollback
  slot and the old unique keys can be removed safely.

## 0.3.18 - 2026-08-09

### Added

- The Foontasy admin catalog now covers all ten published national assistants:
  RPL, Premier League, LaLiga, Bundesliga, Serie A, Ligue 1, Eredivisie,
  Liga Portugal, Super Lig, and the Championship. Sports.ru price scopes cover
  the same leagues.
- Sports.ru Champions League, UEFA Champions League, Europa League, and World
  Cup Foontasy variants have distinct source identities. European cup scopes
  stay closed while the database still exposes an outdated current season;
  UEFA writes remain closed during the rollback-compatible schema expansion.
- Foontasy rows now retain their source variant, Sports.ru phase ID, original
  round label, phase round, and canonical round. Sports.ru price refreshes
  retain the round history needed when European knockout phases restart at
  round one.

### Fixed

- Uncalculated Foontasy pages with hundreds of all-zero player rows are no
  longer accepted as successful imports. National leagues require at least
  100 calculated rows; cup stages use a lower adaptive floor so valid finals
  remain importable. Every scope still requires 90-percent current Sports.ru
  ID overlap and 90-percent internal mapping coverage before any write.
- A missing or unpublished assistant is reported as unavailable per league,
  without stopping the remaining selected scopes or replacing stored FFO.

## 0.3.17 - 2026-08-09

### Fixed

- Completed-match starter synchronization now accepts every non-empty FotMob
  lineup containing at most 11 unique starters. Partial source lineups replace
  the previous flags with the players actually present; empty or oversized
  lineups preserve the previous flags.

## 0.3.16 - 2026-08-09

### Fixed

- Sports.ru placeholder birth dates such as `0001-01-01` are now treated as
  missing identity evidence. They can no longer confirm or reject an automatic
  Sports.ru-to-FotMob player mapping.
- Correcting a false player link no longer moves a user's squad selection away
  from an identity that is still legitimately used by another Sports.ru price
  row.

## 0.3.15 - 2026-08-09

### Fixed

- Automatic Sports.ru player mapping now requires strong name identity when
  FotMob has no confirming birth date. Team and position bonuses can no longer
  turn weak pairs such as Lewis Orford / Lewis O'Brien into an accepted link.
- A conflicting provider birth date no longer rejects an otherwise exact
  player identity. The conflict remains visible in the candidate reason, while
  only near-exact names may pass this exception; this covers verified Sports.ru
  birthday errors without weakening namesake protection.

## 0.3.14 - 2026-08-09

### Added

- The ingestion admin page now has independent multi-league controls for
  Sports.ru price imports and Foontasy FFO imports. Each selected league is
  processed independently and reports its own result.
- Sports.ru current prices are supported for Spain, the Championship and
  Turkey, including explicit Sports.ru-to-FotMob club aliases and a guarded
  deep-mapping workflow.
- Sports.ru imports retain the provider stat-player identity and date of birth
  so poor transliterations and namesakes can be resolved without weakening the
  global matching threshold.

### Changed

- Routine price refreshes update source fields and prices but send only
  previously unmapped rows to identity matching. An accepted automatic or
  manual player mapping is no longer reinterpreted by a later refresh.
- A completed match now moves each team's starter flags to the eleven players
  who actually started that match. The update is chronological and idempotent;
  a ten-player or otherwise incomplete FotMob lineup preserves existing flags.

### Fixed

- The first completed match of a new round no longer clears starter flags for
  every team in the league.
- The production dependency graph pins patched `nanoid` 3.3.17, removing the
  high-severity infinite-loop advisory affecting earlier 3.x releases.

## 0.3.13 - 2026-08-05

### Fixed

- Fixture odds ingestion now keeps a match when at least one team has both
  required direct markets. A missing opponent team-total line no longer drops
  the complete favorite side from the bookmaker table or its FO forecast.
- Benfica versus Academico Viseu is retained with Benfica's available clean
  sheet and over-1.5 probabilities even while Fonbet does not quote the
  Academico Viseu over-1.5 team total.

## 0.3.12 - 2026-08-05

### Fixed

- A sparse club history can no longer allocate the complete team xG/xA to the
  only player with a non-zero event sample. The shared FO/Alt pipeline now
  reserves the missing allocation share for unmodelled teammates whenever a
  real roster has fewer than seven meaningful player exposures or fewer than
  360 aggregate event minutes. Complete team histories remain unchanged.
- Gabor Szalai's live Maritimo calculation now keeps his evidenced 38.9-minute
  share instead of inheriting the attack of 35 teammates without domestic
  history. The detailed tooltip exposes the player count, minute coverage, and
  reserved goal/assist weights used by this guard.
- Feeder-to-top-flight history adaptation is now shared by the supported
  national leagues instead of being hard-coded only for RPL and Eredivisie.
  Liga Portugal 2 is enabled with two completed seasons plus the upcoming
  season, allowing Maritimo's prior domestic minutes and event history to fill
  the current Liga Portugal roster after backfill.

## 0.3.11 - 2026-08-04

### Fixed

- Manual starting-XI marks now use the same role-aware per-90 protection in
  every league and in both FO and Alt. Accumulated substitute minutes no longer
  count as proof that a player's starter event rate is fully reliable.
- Goal and assist rates are blended toward a position prior when a player is
  manually promoted from a historically limited role. Stable starters remain
  unchanged, while low-minute outliers no longer take an implausible share of
  the team's projected goals.
- Detailed forecast tooltips expose sample reliability, historical-role
  reliability, the final event-minute exposure, and the before/after xG/xA
  rates used by the role adjustment.

## 0.3.10 - 2026-08-03

### Fixed

- Player goal and assist allocation now distinguishes a missing FotMob xG/xA
  value from an explicit zero. Where a competition does not publish xG/xA,
  the rolling formula uses that match's observed goals/assists as the best
  available allocation signal; supplied FotMob xG/xA remains authoritative.
- Promoted teams with complete basic statistics but unavailable player xG/xA
  no longer assign almost the entire team attack to one player who happens to
  have a small top-flight xG/xA sample. This fixes Jaden Slory's inflated Alt
  forecast at Willem II and applies equally to the Eerste Divisie-to-Eredivisie
  and FNL-to-RPL paths.
- Previous-club actual-event fallbacks retain the existing transfer penalty
  instead of cancelling it through the penalized-minutes denominator.

## 0.3.9 - 2026-08-03

### Changed

- Team roster pages with starting-XI controls now show the verified Sports.ru
  fantasy name as the primary player label. FotMob remains the internal player
  identity and is included in the name tooltip; rows without a confirmed
  Sports.ru mapping keep their FotMob name.

### Fixed

- A verified Sports.ru player now becomes an effective team-roster row on the
  starting-XI page even when FotMob keeps that player in a reserve/youth team
  or omits the senior-season roster. Ro-Zangelo Daal therefore appears for AZ
  Alkmaar instead of existing only as a price mapping.
- The starting-XI API can now persist such an authoritative Sports.ru roster
  row after validating the price, matched provider map, player, and team. A
  later FotMob roster refresh preserves the manual starter row until FotMob
  itself takes ownership of that exact player-team row.
- The mapping panel no longer reports `MATCHED` when neither the active FotMob
  roster nor a verified Sports.ru price resolves an effective player row;
  price foreign keys alone are no longer treated as proof of a match.

## 0.3.8 - 2026-08-03

### Fixed

- Removed Gustavo Sa's obsolete Famalicao mapping from the required 2026/27
  Liga Portugal plan. Sports.ru has removed the price row and FotMob now lists
  him outside Portugal, so the deployment script no longer fails while looking
  for a fantasy option that does not exist.

## 0.3.7 - 2026-08-03

### Added

- Sports.ru-only core identities for nine academy or reserve players in the
  Eredivisie and Liga Portugal price lists. They remain selectable for their
  verified senior fantasy club without fabricated FotMob history; missing
  match metrics are zero.
- An explicit transferred-out state for stale fantasy prices. Kian Fitz-Jim's
  Ajax row is retained for auditability but excluded from the Eredivisie pool
  after his permanent transfer to Torino.

### Fixed

- Verified club overrides now survive later price syncs. Rafik El Arguioui is
  assigned to Cambuur for his 2026/27 loan instead of being moved back to the
  stale Utrecht label published by Sports.ru.
- The remaining exact FotMob identities in the Netherlands and Portugal price
  lists, including Ro-Zangelo Daal, are stored as durable manual mappings
  instead of being cleared by the next scheduled Sports.ru import.

## 0.3.6 - 2026-08-02

### Fixed

- Mapped Sports.ru prices now define a player's current fantasy team when
  FotMob still exposes the previous club or omits the player from its active
  roster. Player form and minutes continue to use FotMob match history,
  including the existing previous-club fallback for new transfers.
- Squad forecasts, fixtures, team limits, saved selections, auto-pick, and
  transfer suggestions use the same Sports.ru-authoritative team assignment.
- A later Sports.ru price sync moves verified mappings to the newly published
  team instead of retaining the stale FotMob club.

## 0.3.5 - 2026-08-01

### Changed

- A successful production deployment now runs bounded artifact retention
  automatically instead of relying on a separate manual operator command.
- Production retains the active Fantasy image and exactly one stopped rollback;
  older rollback containers, images, and release directories are removed.
- BuildKit cache is capped at 1 GB after every successful production rollout.

## 0.3.4 - 2026-08-01

### Added

- Detailed FotMob ingestion for Eerste Divisie, including two complete feeder
  seasons, the upcoming-season calendar, and player-level payloads, as the
  feeder competition for Eredivisie.
- Eerste Divisie history in promoted-team strength profiles and promoted-player
  archive selection, matching the existing FNL-to-RPL path.

### Fixed

- Expected minutes now use every recent match played by the player's club,
  including explicit zero-minute observations when the player was absent from
  the match sheet. Previously those club matches disappeared from the
  denominator, so one isolated 90-minute cup appearance could produce a
  90-minute projection.
- A new signing now fills missing current-club history from the previous club's
  recent match calendar, including matches the player missed. The existing
  ten-percent transfer penalty remains applied; 365-day formula inputs use up
  to ten club matches while the visible last-five history remains five matches.
- Detailed five-plus-match club history now takes precedence over the coarse
  season archive for expected minutes. Short archive fallbacks use real FotMob
  season minutes when available instead of assuming 70 minutes per appearance.

## 0.3.1 - 2026-07-31

### Added

- A current-round Fonbet favorites table below transfer recommendations with
  separate de-vigged clean-sheet and team-over-1.5 probabilities.
- Honest empty-state handling when a fixture has no fresh complete bookmaker
  market for both teams.

### Changed

- The top three transfer recommendations use a denser three-column desktop
  layout with tighter cards, metrics, player rows, and controls.
- Each fixture favorite is selected by the higher available team-over-1.5
  probability; clean-sheet probability remains an independent displayed
  market and is used only as a tie-breaker.

## 0.3.0 - 2026-07-31

### Added

- Chromium and Firefox WebExtension packages that add a one-click
  `Fantasy -> Sports.ru` squad-transfer widget to football fantasy pages.
- A session-authenticated, no-store API that exports the user's latest saved
  squad with current Sports.ru player IDs.
- Atomic Sports.ru squad updates covering all 15 players, the starting XI,
  captain, vice-captain, and substitute priorities.

### Security

- The HttpOnly `fantasy_session` cookie is read only in the extension
  background context. The Sports.ru content script and page DOM never receive
  the session token.
- Extension host access is limited to `fantasy.tsyzhman.ru` and Sports.ru
  football fantasy pages; the extension contains no remote executable code
  and sends no telemetry.

### Changed

- Sports.ru contest metadata now stores the structured tournament HRU while
  retaining the existing source-URL fallback.

## 0.2.5 - 2026-07-30

### Changed

- The authenticated production browser journey now exercises the current RPL
  season explicitly instead of the pre-season EPL scope that has no Sports.ru
  prices or played matches yet.
- Browser checks follow the current accessible player-search controls and no
  longer expect the command palette component that is absent from the shell.

## 0.2.4 - 2026-07-30

### Fixed

- Auto-pick now uses the same operational source-data readiness gate as
  transfer suggestions. Audit-only warnings no longer disable a planner that
  has fresh player/fixture ingestion and real non-zero projections.
- The production squad journey reads the rendered league-season scope instead
  of waiting for the season selector that the current one-season UI no longer
  renders.

## 0.2.3 - 2026-07-30

### Fixed

- Sequential ingestion now isolates every league-season scope. A failed
  tournament or league is recorded in `scope_errors`, the shared job finishes
  as `completed_with_errors`, and later leagues continue updating normally.
- Successful league evidence remains usable for planner and transfer
  readiness even when another league in the same ingestion job fails.

## 0.2.2 - 2026-07-30

### Security

- Updated Next.js, PostCSS, Sharp, and vulnerable transitive
  `brace-expansion` versions reported by the production dependency audit.
  Legacy minimatch consumers use a callable compatibility adapter backed by
  the safe `brace-expansion` 5.0.9 implementation.

### Fixed

- Release manifests now store the semantic app version in `.release-version`
  and the timestamped deployment identifier separately in `.release-name`.
- Prisma now maps long forecast and archive index names to their existing
  PostgreSQL identifiers, so migration drift checks no longer request
  destructive no-op renames.

## 0.2.1 - 2026-07-30

### Fixed

- A lost deploy connection after a successful container swap can no longer
  delete the active immutable release directory or its image.
- A failure during the swap restores both the previous web/worker containers
  and the previous `current` symlink target.

## 0.2.0 - 2026-07-30

### Added

- Six retro-trained forecast columns for the player and squad tables:
  FO/Alt position calibration, Joint all, and Joint accepted.
- Short and detailed per-player formula explanations.
- Formula-aware FO, Alt, and FFO transfer suggestions.
- RPL transfer prioritization and the round-relative Foontasy scheduler.
- Commit and semantic-version identity in health responses and Docker images.
- Clean-source release verification, immutable Git archives, guarded Docker
  promotion, and persistent server-side production history.

### Changed

- Consolidated the formerly separate production line
  `4bf13c9 -> 96eb7ed -> 0db9e57` with the formula, ingestion, and retention
  work that had previously existed only in a local working tree.
- From June 5 through September 1, incremental FotMob jobs scan every enabled
  national league/division and skip tournament calendars.
- Supercopa de España remains explicitly disabled from shared ingestion.
- Release retention now keeps one immediate rollback for both web and worker.

### Fixed

- Detailed FotMob payloads can no longer erase authoritative fixture round,
  status, or score metadata.
- Versioned squad-table preferences containing formula columns remain readable
  across releases.
- Production can no longer be packaged from untracked or unpushed source.

## 0.1.0

- Initial tracked Fantasy Scout application line before consolidated
  production versioning.
