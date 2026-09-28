# BOARD-PROTOCOL

<a name="purpose"></a>

## 1. Purpose {#purpose}

`BOARD.md` is a compact operational index of work items.

It shows:
- work queue;
- current assignees;
- active blockers;
- recent completions;
- connection of work items with canonical specs.

Neighboring sources:
- `SPEC-MAP.md` - catalog of specs and their responsibilities;
- `specs/work/WI-NNN-*.md` - outcome, scope and acceptance;
- `WAL.md` — checkpoint of an unfinished session;
- `TECHDEBT.md` - documented tradeoffs;
- Git - complete implementation history.

<a name="columns"></a>

## 2. Board columns {#columns}

Minimum columns:
- `Backlog`;
- `In Progress`;
- `Blocked`;
- `Done`.

The project can add service columns while maintaining this semantics.

One work item is in only one column.

<a name="item"></a>

## 3. Accounting unit {#item}

One board line corresponds to one `WI-NNN` and refers to its file.

The WI file is required for any new line. Legacy lines with `FEAT-*` or `INFRA-*` remain valid during forward-only migration; new items receive an independent `WI-NNN`.

One spec can be specified in several work items. One work item can list several spec IDs.

Column `Specs` contains compact IDs for human review. The full `spec://...#anchor` live in the WI file.

<a name="format"></a>

## 4. Minimum format {#format}

### Backlog

```md
| Work | Title | Specs | Owner | Priority |
|---|---|---|---|---|
| [WI-010](work/WI-010-account-lifecycle.md) | Implement account creation | FEAT-010, PROP-006 | @handle | P1 |
```

### In Progress

```md
| Work | Title | Specs | Owner | Started | Blocker |
|---|---|---|---|---|---|
| [WI-011](work/WI-011-account-invite.md) | Invitation of participant | FEAT-010 | @handle | YYYY-MM-DD | — |
```

### Blocked

```md
| Work | Title | Owner | Reason | Waiting for |
|---|---|---|---|---|
| [WI-012](work/WI-012-production-access.md) | Production access | @handle | No access | Human decision |
```

### Done

```md
| Work | Title | Owner | Date |
|---|---|---|---|
| [WI-009](work/archive/YYYY/WI-009-runtime-baseline.md) | Runtime baseline | @handle | YYYY-MM-DD |
```

Scope, acceptance, dependencies and a long description of the result in `BOARD.md` are not repeated.

<a name="ownership"></a>

## 5. Who changes BOARD {#ownership}

- A person can change any line.
- AI changes the item of its `@handle`.
- Reassigning owner requires human decision.
- `BOARD.md` is the source of status, owner and priority; these fields are not duplicated in the WI and WAL file.

`specs/.me` is required before a claim or line change by the agent.

<a name="start"></a>

## 6. Creation and start of {#start}

### Backlog

Place WI in `Backlog` if:
- work found necessary;
- WI file created;
- owning specs are allowed or item has `Kind: research` / `Canon action: new-spec`;
- active implementation has not yet begun.

### Immediate start

If the person instructed to start work now, add the new WI immediately to `In Progress`. No intermediate movement via `Backlog` is required.

For `In Progress` you need:
- owner;
- actual start of work;
- WI file with outcome, specs, scope and acceptance.

WAL-checkpoint is not a start condition. It appears only when the session is incomplete or handoff.

<a name="blocked"></a>

## 7. Blocked {#blocked}

Convert WI to `Blocked` when continuation depends on external conditions:
- human decisions;
- another work item or performer;
- access, environment or external resource;
- confirmation, without which the result cannot be honestly completed.

Normal implementation complexity and local uncertainty resolved by reading the code preserve `In Progress`.

Reason and `Waiting for` live in the board. A detailed checkpoint is added to the WAL only when a renewal is required.

<a name="done"></a>

## 8. Done {#done}

Transfer WI to `Done` when:
- outcome achieved;
- acceptance passed;
- `Result` contains completed checks;
- code, tests and active canon are consistent;
- spec changelog updated if `direct-edit` or `supersede` was used;
- WAL-checkpoint deleted;
- open compromises are reflected in `TECHDEBT.md`.

When completed, the WI file is moved to `specs/work/archive/YYYY/`.

`Done` stores the last ten items or items of the current release - the project selects one stable limit. Older lines are removed from the board; the files remain in the archive and Git.

The next wave is issued by the new `WI-NNN`. The linked spec retains its role as a living canon.

<a name="sync"></a>

## 9. Synchronization {#sync}

Check the following invariants:
- each new line of the board leads to an existing WI;
- one `WI-NNN` occurs in one column;
- owner in the active WAL header matches the owner of the board;
- checkpoint of a specific WI exists only for `In Progress` or `Blocked`;
- `Specs` board matches full WI file links;
- completed WI has completed `Result` and archive path.

A status change usually affects only `BOARD.md`. `WAL.md` changes when checkpoint, the WI file changes when scope/acceptance changes or the result is fixed.
