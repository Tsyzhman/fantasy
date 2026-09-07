# Вход для AI

Перед любым действием используй project skill `spec-driven-work` как единый роутер. Codex находит его в `.agents/skills/spec-driven-work/`, Claude Code — в `.claude/skills/spec-driven-work/`. Если client не обнаружил skill, полностью прочитай `specs/protocols/BOOT.md`.

Этот проект ведётся в режиме `standalone`. Спеки, код и тесты — канон в Git. Очередь работы живёт в `specs/BOARD.md`, `specs/work/` и при необходимости в `specs/WAL.md`. Сервис Prist не требуется и не контролирует агента.

## Основные инварианты

- Явный `WI-NNN` ведёт к файлу WI, одной строке `BOARD.md`, возможному checkpoint в `WAL.md` и перечисленным governing specs.
- Запрос обычным языком разрешается через `BOARD.md`, `SPEC-MAP.md`, `common/structure.md`, спеки и `@spec`.
- Одношаговая работа в текущей сессии может выполняться без WI, `BOARD` и `WAL`.
- Отслеживаемая работа получает файл `specs/work/WI-NNN-*.md` и одну строку в `BOARD.md`.
- `WAL.md` меняется только при checkpoint, handoff или возобновлении незавершённой работы.
- Спека хранит канон; WI хранит outcome, scope, acceptance и result текущего прохода.
- Новая спека регистрируется в `SPEC-MAP.md`. `common/structure.md` меняется при изменении модуля, namespace или code ownership.
- Исправление кода по ясной активной спеке использует `Canon action: none`; текст спеки обновляется при реальном изменении или пробеле канона.
- `specs/.me` требуется перед claim WI и изменением `BOARD/WAL`. Read-only анализ и одношаговая работа могут идти без него. Локальный `specs/.me` не коммить.

## Безопасность интерфейса

Сохраняй существующие UI/UX-сценарии при технических изменениях. Явно сообщай человеку, если текущий интерфейс нельзя сохранить на выбранном backend или API. Удаление и упрощение пользовательских возможностей требуют прямого запроса.

## Трассировка

Новый или существенно изменённый spec-owned код получает актуальный `@spec spec://...#...` на точках ответственности: файл, обработчик, сервис, крупный UI-компонент, worker, миграция или materializer.

Прямой contract test, подтверждающий owning contract, также получает `@spec`.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
