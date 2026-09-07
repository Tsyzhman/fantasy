# Техническая карта: расширение Fantasy КХЛ

## Проверенная база

Проверен текущий worktree: commit `d25913c`, `package.json` версии `0.3.21`. Исследование от 6 сентября относится к другому checkout (`8c4835a`, версия `0.3.56`); его номера строк и production-счётчики не считаются текущим состоянием этого worktree. Перед реализацией повторить сравнение с веткой интеграции.

| Сейчас | Следствие для проекта КХЛ |
|---|---|
| Next.js App Router, React/TypeScript, Prisma/PostgreSQL, миграции | Сохраняем платформу; никаких новых LLM-сервисов для регулярной работы |
| `src/app/machete/fpl/squad/page.tsx` вызывает общий `FantasySquadPage` с `mode="FPL"` | Отдельный пункт, как FPL, не означает пригодность общего футбольного экрана |
| `src/app/machete/fantasy-squad-page.tsx`: только SPORTS_RU/FPL; `src/machete/squad_logic.ts`: 15/11/4, GK/DEF/MID/FWD, капитан | Создать независимые KHL DTO, валидатор и экран; не добавлять хоккей через смену константы 15 на 17 |
| `src/machete/squad_planner.ts`, `deterministic_fantasy_projection.ts`: футбольные read models, per90, 60 минут | Хоккейный прогноз и агрегации отдельные, с TOI в секундах |
| `src/core_data/ingestion-jobs.ts`: FotMob и футбольный fantasy engine | Использовать инфраструктурные приёмы, не отправлять КХЛ в этот pipeline |
| `prisma/schema.prisma`: CorePlayer/CoreMatch имеют BigInt ID, связи составов ведут в футбольное ядро | На первом этапе отдельные `khl_*` таблицы и строковые внутренние ID; исключаем коллизии ID |
| `src/providers/fonbet/odds.ts`: FONBET_FOOTBALL_FACTOR_IDS; `fixture-odds-sync.ts`: футбольный allowlist | Отдельный хоккейный parser/matcher/sync, общий HTTP-транспорт только после выделения нейтрального контракта |
| FixtureOddsSnapshot уникален по matchId/provider | Не подходит для истории хоккейных рынков с периодами и линиями |
| `MacheteShell.tsx` содержит пункты Squad и FPL и текст о FotMob | Добавить КХЛ рядом; в хоккейном контексте показывать его собственные источники |

## Предлагаемые владельцы кода

| Путь (ещё не создан) | Ответственность | Спецификация |
|---|---|---|
| `src/app/machete/khl/{squad,players,calendar}` | Маршруты КХЛ и серверная загрузка | FEAT-001, FEAT-002 |
| `src/components/khl/*` | KhlSquadPlanner, KhlRink, карточки, таблица, сравнение, worker UI | FEAT-002 |
| `src/khl/{rules,scoring,calendar,projections,optimizer}/*` | Чистая хоккейная логика и контракты | FEAT-001, FEAT-003 |
| `src/khl/{repositories,read-model,transfers}/*` | БД, опубликованный пул, версии и транзакции | INFRA-002 |
| `src/providers/{sports-ru-hockey,khl-mobile,khl-protocol,khl-xg}/*` | Независимые адаптеры источников | INFRA-001 |
| `src/providers/fonbet/hockey-*` | Хоккейные факторы и рынок с условиями расчёта | INFRA-003 |
| `src/server/khl/*`, `src/app/api/{machete/khl,admin/khl,cron/khl}` | Отдельные jobs, API, health и readiness | INFRA-001, INFRA-002 |
| `prisma/schema.prisma`, следующая свободная миграция | Аддитивные модели Khl*, без изменений футбольных PK/FK | INFRA-002 |

Общее: `src/lib/auth.ts`, `src/lib/db.ts`, API error helpers, logger, i18n, форматирование дат, доступ по пользователю/франшизе, нейтральные кнопки/диалоги, `ExpiringPromiseCache`. Общие алгоритмы выделять только если они не знают футбольных позиций, стартовых 11, per90 и провайдера. Не копировать целиком `FantasySquadPlanner.tsx` или футбольный scheduler.

Футбол остаётся владельцем действующих `/machete/squad`, `/machete/fpl/squad`, `/api/machete/squads` и core_data. Никакой неявной маршрутизации хоккея через `provider=SPORTS_RU`: вид спорта, турнир и сезон — разные измерения.

На новых точках ответственности при реализации добавить `@spec spec://modules/khl/<имя-файла-без-md>#<якорь>`. В этой задаче прикладной код и тесты не изменяются.
