# WAL-PROTOCOL

<a name="purpose"></a>

## 1. Purpose {#purpose}

`WAL.md` - short memory of unfinished work between sessions.

It stores the checkpoint and next step for the active `WI-NNN`. Scope and acceptance live in the WI file, status and owner - in `BOARD.md`, implementation history - in Git.

<a name="when"></a>

## 2. When is WAL {#when} needed?

Create or update WAL-checkpoint if:
- session ends before WI is completed;
- the work is transferred to another contractor or agent;
- performer switches to another WI;
- a significant destructive step is ahead;
- needs to save an important next step, temporary blocker, or pending solution.

WAL is not required:
- for `Backlog`;
- when starting work item;
- for a task completed in one session;
- for the small actions log;
- after transferring WI to `Done`.

<a name="structure"></a>

## 3. Structure {#structure}

WAL contains three sections:
- `## Active Checkpoints`;
- `## Cross-work`;
- `## Decisions Pending`.

The completed history is stored in `specs/work/archive/` and Git. Section `Completed` is not used in new projects. Existing legacy records can be preserved until a separate migration.

<a name="format"></a>

## 4. Checkpoint format {#format}

```md
### WI-011: Invitation of a participant (@handle)
- Work: [WI-011](work/WI-011-account-invite.md)
- Updated: YYYY-MM-DD
- Checkpoint: API and successful scenario test are ready.
- Next: add re-invite errors and check UI.
- Blocker: —
```

Required fields:
- `Work`;
- `Updated`;
- `Checkpoint`;
- `Next`;
- `Blocker`.

One WI has one active WAL section.

<a name="rules"></a>

## 5. Recording rules {#rules}

- AI is editing the checkpoint of its `@handle`.
- Foreign checkpoints are used as a read-only context.
- A new section is added to the end of `Active Checkpoints`.
- Summary does not copy scope, acceptance, list of specs and commit history.
- `Checkpoint` describes a state that has already been achieved.
- `Next` contains the nearest specific step.
- `Blocker` has the same meaning as `BOARD.md` if WI is in `Blocked`.

`specs/.me` is required before changing WAL.

<a name="resume"></a>

## 6. Renewal {#resume}

If you continue working:
1. open the WI file;
2. check the status and owner in `BOARD.md`;
3. read checkpoint;
4. do `Next`;
5. update the checkpoint only when there is a new handoff or the end of the session.

Starting a new session does not in itself require a no-op WAL edit.

<a name="finish"></a>

## 7. Completion {#finish}

For `Done`:
1. transfer significant checks and the result to `Result` of the WI file;
2. delete active WAL section;
3. update `BOARD.md`;
4. move WI to archive.

If the item remains `In Progress` or `Blocked`, save one current checkpoint. Old intermediate formulations are not accumulated.

<a name="shared"></a>

## 8. General sections {#shared}

`Cross-work` contains only live dependencies that affect the immediate operation of several WIs.

`Decisions Pending` contains solutions awaiting man. Once solved, the canonical result is transferred to the owning spec or WI, and the entry is deleted.

WAL is written by AI, a person verifies the actual condition.
