# Prist-managed operation

Read this reference only when workflow mode is explicitly `prist-managed` or during a confirmed migration dry-run.

## Source of operational truth

Prist owns ideas, priority, work status, owner, blockers, comments, checkpoints, readiness, result and evidence. Git owns specifications, code, tests and history. Do not materialize WI, BOARD, WAL or TECHDEBT mirrors in the repository.

An unavailable service creates a visible pending operation for retry. It never permits fallback writes to repository operational files.

## Start a turn

1. Выполни `node .agents/skills/spec-driven-work/scripts/sync-spec-space.mjs flush --root .` до чтения нового managed context. Pending result блокирует свежий status/completion claim и сохраняет текущий mode.
2. Read `project_context` for project identity, workflow bundle/mode, spec freshness and allowed operations.
3. Read `work_context` for an explicit work ID. For a natural-language change, call `resolve_change` before broad repository search.
4. Выбери маршрут и `canonAction`, затем прочитай focused references этого маршрута до repository write.
5. Для `new-spec` перечисли планируемые типы PROP/FEAT/INFRA, вызови `get_spec_example` для каждого и определи изменение `common/structure.md`.
6. Для tracked работы создай полный WorkItem и вызови `start_work`. В `new-spec` укажи существующий вышестоящий канон и ограничения, если они есть, а планируемый полный spec-адрес с якорем `#root` — в `affectedSpecs`; первый spec-space может начать без `governingSpecs`.
7. Сообщи человеку human-visible preflight summary из главного skill и только затем изменяй specs, code или tests.
8. Use the authenticated connection identity as the agent owner. Never combine it with `specs/.me` for managed ownership.

## Preserve protocol semantics

Prist replaces storage and status operations. It does not shorten the workflow. Read the same focused reference that the standalone route uses:

- spec authoring or lifecycle change — `specification-authoring.md` and `specification-lifecycle.md`;
- work creation, correction, splitting or completion — `work-items.md`;
- priority, status or blocker — `board.md`;
- meaningful stop, handoff or resume — `checkpoints.md`;
- conscious compromise — `technical-debt.md`.

Apply every rule that is independent of repository operational files. Map the fields and transition to the semantic operations below.

## First spec-space

1. Inspect the repository. Existing specs are indexed and synchronized without adding generic documents.
2. If specs are absent, agree with the person on purpose, primary user and the first factual product area.
3. Read `specification-authoring.md`, `specification-lifecycle.md` and, for tracked work, `work-items.md` before authoring.
4. Read example IDs and catalog version from `setup_context`; call `get_spec_example` once for every PROP/FEAT/INFRA type that will be authored.
5. Use each example as a shape reference and follow `specification-authoring.md`. Do not copy its product facts, IDs or unresolved relations.
6. Create `specs/common/main.md` and `specs/SPEC-MAP.md` from confirmed facts. Add `specs/common/structure.md` whenever a typed module, namespace or code ownership appears. Add a typed PROP/FEAT/INFRA only when its required sections have factual content.
7. Obtain a current sync receipt before representing the spec-space as ready.

## Mutations

- Create tracked work through `create_work` with kind, canon action, outcome, scope, acceptance, anchored governing/affected/constraint specs and dependencies.
- Immediately before implementation, move a new backlog item through `start_work`. Starting work never creates a checkpoint.
- Use `update_work` when the protocol permits correcting scope, acceptance or spec links. Do not hide a separate change in a comment on an unrelated work item.
- После authoring в `new-spec` используй `update_work`, чтобы до зависимой реализации добавить active governing anchor и актуализировать affected/constraint links, scope и acceptance. Тот же WorkItem может включать authoring и реализацию одного атомарного результата.
- Record a human or agent note through `comment_work` only when it matters to later work.
- Use `checkpoint_work` for a meaningful unfinished stop, handoff or blocker. Same-session completion creates no checkpoint.
- Record long-lived risk or conscious compromise in the work result/technical-debt operation supported by the contract.
- Complete through `complete_work` with result, actually verified acceptance, named checks, REVIEW, technical debt and evidence. If a required check did not run, leave that acceptance incomplete and keep the WorkItem unfinished. A distinct new outcome receives a new WorkItem.
- A user prohibition on one tool or deployment does not cancel other available checks. Record a checkpoint when the remaining required acceptance cannot be verified.
- Supply idempotency keys for repeatable mutations and the current expected version for an existing entity.

## Spec-space synchronization

After a material change to active/draft specs, `SPEC-MAP`, `common/structure.md` or `@spec`, build the deterministic full snapshot and obtain a matching sync receipt. Completion cannot claim current spec freshness while the receipt is stale, partial or pending.

Keep pending snapshot payload and provenance credential-free in `.prist/outbox/`. Read credentials separately at retry time.

Используй portable script из главного skill:

```bash
node .agents/skills/spec-driven-work/scripts/sync-spec-space.mjs sync \
  --root . \
  --project-id '<project id from project_context>' \
  --expected-version '<canon.snapshotVersion from project_context>'
```

`stored` увеличивает server snapshot version. `unchanged` сохраняет версию и возвращает проверяемый no-op receipt. При `version_conflict` script читает свежий project context, повторно строит snapshot и отправляет его только при неизменном fingerprint.

## Stop or outage

Return the exact pending operation, blocker and retry path to the person. Preserve the current managed version and do not invent a successful checkpoint or completion. A human-visible service projection and the next agent call must observe the same accepted version.
