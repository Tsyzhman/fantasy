---
name: spec-driven-work
description: Ведёт продуктовую и инженерную работу через канонические спецификации, impact resolution, work items, проверки, checkpoints и evidence. Используй для любого изменения продукта или кода, создания и изменения specs, планирования или выполнения WI, ведения BOARD/WAL/TECHDEBT, возобновления работы и подключения spec-driven workflow к репозиторию.
---

# Spec-driven work

Этот файл читается в начале каждой AI-сессии.

Используй его как главный skill-роутер. Сначала выбери маршрут и подгрузи только названные ниже references. Не читай все references заранее.

## 0. Обязательный managed preflight {#managed-preflight}

В `prist-managed` до первой repository write выполни весь порядок:

1. flush pending spec sync;
2. получи `project_context`, а затем `work_context` для явного WI или `resolve_change` для запроса обычным языком;
3. выбери маршрут и `canonAction`;
4. прочитай focused references этого маршрута;
5. для `new-spec` и первого spec-space перечисли планируемые типы PROP/FEAT/INFRA и вызови `get_spec_example` для каждого типа до authoring;
6. для tracked работы создай полный WorkItem и вызови `start_work`;
7. сообщи человеку одной строкой: `Маршрут: <...> · References: <...> · Examples: <...|не нужны> · structure.md: <создать|обновить|без изменений>`.

Не изменяй specs, code или tests до завершения применимых пунктов. `references/prist-managed.md` задаёт точные semantic operations.

Для tracked `new-spec` отсутствие файла новой спеки не откладывает WorkItem. До `create_work` определи тип, namespace и планируемый полный spec-адрес с якорем `#root`, укажи существующий вышестоящий канон и ограничения, если они есть, а планируемый адрес — в affected links. После регистрации и перевода новой спеки в `active` обнови её governing anchor, scope и acceptance WorkItem и только затем начинай зависимую реализацию.

## 1. Быстрый вход {#entry}

Сначала разреши явный workflow mode из `.prist/workflow.json` или repository entrypoint. Выполни это до поиска задачи и любых operational mutations:

- `standalone`: WI, BOARD, WAL и TECHDEBT ведутся в repository; `specs/.me` задаёт agent identity;
- `prist-managed`: operational state ведётся только через Prist. Сразу прочитай `references/prist-managed.md`, выполни его Start a turn и не создавай repository-копии WI/BOARD/WAL/TECHDEBT.

Если mode отсутствует или противоречив, останови operational mutation и прочитай `references/repository-bootstrap.md`. Доступность Prist не определяет и не меняет mode. Specs, code, tests и Git остаются repository canon в обоих режимах.

Сначала разреши рабочий контекст минимальным числом чтений.

### Если в запросе указан `WI-NNN`

В `standalone`:

1. Открой его файл в `specs/work/` или `specs/work/archive/`.
2. Найди одну строку WI в `specs/BOARD.md`.
3. Ищи checkpoint этого WI в `specs/WAL.md`. Открывай WAL целиком только при наличии релевантной секции или общего решения.
4. Открой перечисленные в WI governing specs и только необходимые constraint/affected specs.

- В `prist-managed` получи `project_context`, затем `work_context` для этого ID и открой перечисленные governing/constraint/affected specs из repository. Не ищи repository WI/BOARD/WAL.

### Если WI не указан

В `standalone` ищи контекст в таком порядке. Ищи контекст в таком порядке:
1. активные строки `BOARD.md`;
2. человекочитаемая карта `SPEC-MAP.md`;
3. техническая карта `common/structure.md`;
4. имена файлов, заголовки и anchors в `specs/**`;
5. `@spec` в коде и тестах;
6. названия модулей, экранов, процессов, компонентов и файлов.

В `prist-managed` сначала получи `project_context` и вызови `resolve_change` для запроса об изменении. Затем читай найденные specs, связи и минимальный набор code/tests из repository. Для вопроса о состоянии используй точечные `readiness_context`, `list_ideas`, `list_work` и `work_context`.

Поиск выполняется лениво. Не загружай весь spec-space и весь код, если задача уже разрешилась меньшим контекстом.

В `standalone` действует правило: `specs/.me` нужен перед claim work item или изменением ownership, `BOARD.md` и `WAL.md`. Для read-only анализа и одношаговой работы без операционного учёта отсутствие `.me` не блокирует чтение. Если операционное изменение нужно, а файла нет, попроси человека создать его из `specs/.me.template`. Не коммить `specs/.me`.

В `prist-managed` owner задаёт authenticated connection identity; `specs/.me` не используется.

## 2. Выбор контура {#scope}

Выбери один из четырёх маршрутов.

### A. Одношаговая работа

Используй этот маршрут, когда задача:
- завершается в текущей сессии;
- имеет очевидный owning spec;
- не требует отдельного owner/status, handoff, координации или блокера.

Выполни изменение и проверки. `WI`, `BOARD` и `WAL` не создаются. Если меняется канон, обнови существующую спеку direct edit + changelog. В `prist-managed` после material change также синхронизируй spec-space.

### B. Существующий work item

Прочитай `references/work-items.md`, `references/board.md` и только при handoff/blocker/stop — `references/checkpoints.md`.

- В `standalone` работай по найденному файлу WI и строке BOARD.
- В `prist-managed` работай по `work_context`; если status равен `backlog`, вызови `start_work` до изменения specs/code/tests. Не используй checkpoint для старта.

В `standalone`: Работай по найденному `WI-NNN`. `BOARD.md` остаётся источником статуса и owner. Создавай или обновляй `WAL.md` только при реальной необходимости checkpoint.

### C. Новая отслеживаемая работа

Если работе нужен отдельный учёт:

Сначала прочитай `references/work-items.md` и `references/board.md`.

В `standalone`:

1. создай `specs/work/WI-NNN-short-slug.md` по `WORK-ITEM-PROTOCOL.md`;
2. добавь одну компактную строку в `BOARD.md`;
3. если работа начинается сейчас, помести строку сразу в `In Progress`;
4. не создавай WAL в начале сессии;
5. создай WAL-checkpoint, только если работа останется незавершённой, потребуется handoff или переключение контекста.

- В `prist-managed` вызови `create_work` со всеми протокольными полями и затем `start_work` до изменения реализации.
- В обоих режимах не создавай checkpoint в начале; он нужен только для незавершённой остановки, handoff или blocker.

Отдельный учёт нужен при самостоятельном scope/acceptance, нескольких шагах, риске, блокере, зависимости, координации, продолжении между сессиями или явной просьбе человека.

### D. Новый или изменяемый канон

Прочитай `references/specification-authoring.md` и `references/specification-lifecycle.md`.

В `prist-managed` при tracked `new-spec` также прочитай `references/work-items.md` и получи service-owned example для каждого планируемого типа спеки до первой repository write.

Если подходящей спеки нет, до первой repository write определи формат нового канона. Для tracked работы сначала создай и запусти один `new-spec` WorkItem, затем:
1. создай и зарегистрируй спеку в `SPEC-MAP.md`;
2. обнови `common/structure.md`, если меняется модуль, namespace или связь с кодом;
3. доведи governing spec до `active` и актуализируй links, scope и acceptance существующего WorkItem до реализации;
4. реализуй тот же атомарный результат в этом WorkItem либо до кода создай связанные implementation WorkItem, если готовый канон выявил несколько независимых результатов.

Одношаговое authoring без отдельного результата, статуса или продолжения не создаёт WorkItem и строку в `BOARD.md`.

Если найдено несколько равновероятных owning specs и выбор влияет на решение, уточни у человека.

## 3. Маршрутизация по типу задачи {#routing}

- Создание или глубокая переработка спеки: `SPEC-AUTHORING-PROTOCOL.md`.
- Изменение канона, lifecycle, direct edit, supersession или конфликт со спекой: `SPEC-PROTOCOL.md`.
- Создание, разбиение, исправление или завершение `WI-NNN`: `WORK-ITEM-PROTOCOL.md`.
- Статус, owner, priority или blocker work item: `BOARD-PROTOCOL.md`.
- Checkpoint, handoff или возобновление: `WAL-PROTOCOL.md`.
- Сознательный компромисс вне текущего scope: `TECHDEBT-PROTOCOL.md`.
- Внедрение workflow в существующий проект: `.human/adopt-existing-project-agent.md`.

Внутри skill этим compatibility names соответствуют focused references из предыдущего раздела. В `prist-managed` focused reference сохраняет смысл и критерии протокола, а `references/prist-managed.md` задаёт semantic operation вместо repository operational file. Для внедрения или обновления workflow используй `references/repository-bootstrap.md`.

## 4. Исправление кода по действующей спеке {#fix}

Если код противоречит ясной активной спеке:
1. считай спеку governing canon;
2. воспроизведи расхождение тестом или проверкой;
3. исправь код;
4. сохрани `Canon action: none`, если создан WI;
5. обнови спеку только при обнаружении пропущенной детали.

Если человек запрашивает новое поведение, сначала выбери direct edit или supersession по `SPEC-PROTOCOL.md#change-model`.

Полная процедура находится в `references/specification-lifecycle.md#change-model`.

## 5. Правило `@spec` {#traceability}

Новый или существенно изменённый spec-owned код получает полный адрес ответственной спеки:

```ts
/**
 * @spec spec://modules/core/FEAT-010-account-lifecycle#api.create
 * @spec spec://common/PROP-006-API#errors
 */
```

Маркеры ставятся на точки ответственности:
- файл;
- обработчик;
- сервис или класс;
- крупный UI-компонент;
- worker или job processor;
- миграция;
- materializer, read-model builder или импортёр.
- прямой contract test, который подтверждает owning contract.

Для мелких helper-функций ownership наследуется от ближайшего размеченного блока.

## 6. Работа со спорными местами {#review}

Если реализацию можно честно выполнить по текущему канону:
1. выполни работу;
2. добавь `REVIEW` рядом со спорным местом;
3. укажи вопрос в финальном отчёте.

Если открытый вопрос создаёт высокий риск для данных, безопасности, денег или основного пользовательского сценария, остановись на планировании и запроси решение человека.

## 7. Синхронизация spec-space {#sync}

В `prist-managed` получай live tools через project-local remote MCP, материализованный connection component в `.codex/config.toml` и `.mcp.json`. Credential хранится только в locally ignored connection/config files с ограниченными permissions. Если текущая agent session была открыта до установки config, connection component завершает setup и `connection_ready` сам, а MCP discovery появляется после явного trust и новой сессии.

Material change — это изменение active/draft `PROP`, `FEAT` или `INFRA`, `specs/SPEC-MAP.md`, `specs/common/structure.md` либо добавление, удаление или перенос `@spec` в коде, тестах, tools, agent artifacts или migrations.

После material change и до completion:

1. запусти `node .agents/skills/spec-driven-work/scripts/sync-spec-space.mjs snapshot --root .` и проверь `status`, diagnostics, Git/working-tree provenance и fingerprint;
2. в `prist-managed` возьми текущий `canon.snapshotVersion` из `project_context`, затем выполни `sync --project-id <id> --expected-version <version>`;
3. перед новым managed context всегда выполни `flush --root .`, если существует `.prist/outbox/spec-sync.json`;
4. при `partial`, pending либо version conflict не заявляй current completion: устрани diagnostics или перестрой snapshot по свежему context и повтори;
5. передай в `complete_work` явное `specChange`: `{ "kind": "material", "fingerprint": "<receipt>", "snapshotVersion": <receipt> }`. Если material источники не менялись, передай `{ "kind": "none" }`.

Snapshot и outbox не содержат credential. Скрипт читает `.prist/connection.json` только при отправке, сохраняет receipt отдельно и редактирует transport errors перед записью pending state.

## 8. Завершение сессии {#finish}

Следующие repository writes применяются в `standalone`. В `prist-managed` выполни эквивалентные status, checkpoint, result и evidence operations по `references/prist-managed.md`; WI/BOARD/WAL/TECHDEBT files не меняй.

### Work item завершён

- пройди acceptance WI;
- перечисляй выполненным только acceptance, для которого фактически выполнена названная проверка или сохранено evidence;
- если человек запретил конкретный инструмент или deploy, продолжи остальные доступные проверки; если обязательная проверка невозможна, оставь WI незавершённым и сохрани checkpoint;
- заполни `Result` выполненными проверками и итогом;
- обнови changelog только тех спек, чей канон менялся;
- перенеси WI в `specs/work/archive/YYYY/`;
- переведи строку `BOARD.md` в `Done`;
- удали WAL-checkpoint этого WI, если он существовал;
- укажи `REVIEW` и `TECHDEBT` в отчёте.

### Work item остаётся активным

- сохрани статус `In Progress` или `Blocked` в `BOARD.md`;
- создай или обнови один короткий WAL-checkpoint с текущим состоянием и следующим шагом;
- не копируй в WAL scope и acceptance из файла WI.

### Одношаговая работа

- укажи изменённые файлы и проверки;
- операционные файлы workflow остаются без изменений.

## 9. Минимальный набор изменений {#write-matrix}

| Событие | Какие workflow-файлы меняются |
|---|---|
| Одношаговая реализация | спека только при изменении канона |
| Создание или изменение спеки | спека + `SPEC-MAP.md`; `structure.md` при изменении технической карты |
| Старт отслеживаемой работы | файл WI + одна строка `BOARD.md` |
| Изменение status, owner, priority или blocker | `BOARD.md` |
| Остановка незавершённой сессии | `WAL.md`; `BOARD.md` при изменении статуса или blocker |
| Завершение WI | Result и архив WI + `BOARD.md` + удаление существующего WAL-checkpoint |

Код, тесты и продуктовые артефакты меняются по scope задачи. Таблица фиксирует только операционный контур workflow.

В `prist-managed` та же матрица выполняется через semantic operations: `create_work` + `start_work`, `update_work`, `checkpoint_work` и `complete_work`. Создание или изменение спецификации по-прежнему меняет repository canon и требует spec sync; Prist не пишет specs или code.
