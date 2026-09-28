# WORK-ITEM-PROTOCOL

<a name="purpose"></a>

## 1. Purpose {#purpose}

Work item - a limited unit of work with a separate result and its own readiness check.

The specification fixes the canon of the project. A work item captures a specific pass that brings code, tests, documents, or infrastructure to that canon.

One specification can be implemented by several work items. One work item can reference multiple specifications as long as they contribute to the same result being verified.

<a name="when"></a>

## 2. When you need a work item {#when}

Create a work item if the work has at least one of the following characteristics:
- separate scope or acceptance;
- several meaningful steps;
- risk, blocker or addiction;
- separate owner or priority;
- work can continue in the next session;
- needs coordination or explicit status for a person;
- the person asked to put the work on the board.

Minor one-step edits that are completed in the current session can be performed without work item, `BOARD` and `WAL`.

The registration rule is simple: if a job receives a line in `BOARD.md`, it has a file `WI-NNN`.

<a name="naming"></a>

## 3. Identifier and storage {#naming}

Work item uses a separate namespace:
- `WI-001`
- `WI-024`
- `WI-105`

The active file is named `specs/work/WI-NNN-short-slug.md`.

The completed file is transferred to `specs/work/archive/YYYY/`. The recent line `Done` in `BOARD.md` may already refer to the archive path.

Before creating a new work item:
- scan `specs/work/**/*.md`;
- check `BOARD.md` and `WAL.md`;
- select the next free `WI-NNN`;
- do not reuse numbers of completed or canceled items.

work item ID does not match the spec ID. The connection is stored in section `Specs` and in compact column `Specs` of the board.

<a name="format"></a>

## 4. Minimum format {#format}

```md
# WI-024: Fix empty lines of personal report

- Kind: `fix`
- Canon action: `none`

## Outcome

The code follows the canonical behavior of empty lines.

## Specs

- Governing: `spec://modules/report/FEAT-001-management-report#scenarios.compact-empty-rows`

## Scope

- In: line construction, display, regression test.
- Out: composition of indicators and access rights.

## Acceptance

- [ ] The bug is reproduced by the test.
- [ ] The fix is ​​being tested.
- [ ] Script with explicit null is saved.

## Result

Filled in when completed: summary, reviews, commits or release evidence.
```

Required parts:
- header with `WI-NNN`;
- `Kind`;
- `Canon action`;
- one checkable `Outcome`;
- links to specs;
- boundaries of the current passage;
- acceptance work item;
- `Result`, filled in upon completion.

Valid `Kind`:
- `implement` - implementation of the canon already described;
- `fix` — bringing the code to the current spec;
- `change` - agreed change to canon and implementation;
- `migration` - transition between states or contours;
- `research` is a study with a separate verifiable result.

Valid `Canon action`:
- `none` - the text of the canon is saved;
- `direct-edit` - the current spec is updated;
- `new-spec` - the result of the work is a new spec;
- `supersede` - one or more specs are replaced or removed from the active canon.

<a name="specs"></a>

## 5. Links to specifications {#specs}

Work item refers to the exact `spec://...#anchor`.

Link roles:
- `Governing` - sets the required behavior;
- `Affected` - changes with the result;
- `Constraint` - sets a mandatory restriction.

For `implement`, `fix`, `change` and `migration`, at least one `Governing` spec is required if a valid canon for the result already exists.

WorkItem with `Canon action: new-spec` is created before the new spec file and uses:
- existing superior canon to `Governing`, if there is one;
- current restrictions in `Constraint`;
- is the planned full address of the new spec from `#root` to `Affected`.

The first spec-space can start a `new-spec` WorkItem without an existing `Governing` reference. After registering and transferring the new spec to `active`, add its exact responsible anchor to `Governing`, save the address of the document being created in `Affected` and update the scope and acceptance to the dependent implementation.

`research` may start without a specification found. Before implementing the result, the study must resolve the owning spec or explicitly state that `new-spec` is required.

Work item contains the boundaries of the current pass and does not copy scripts, data models and contracts from specifications.

<a name="slicing"></a>

## 6. Size and partition {#slicing}

One work item has:
- one observed outcome;
- one termination decision;
- associated set of checks.

Create separate work items if parts of the work:
- can be released or rolled back independently;
- can be verified independently;
- may appear in different statuses;
- have different external blockers;
- belong to different successive waves.

A small spec can receive one work item to sell the entire `#root`.

Volumetric spec receives several work items with links to specific anchors. The division is preferably carried out according to completed user or runtime results.

Cross-spec work item is acceptable when several specs participate in one atomic result. Several independent results are issued as separate `WI-NNN`.

Relationships between work items are indicated by simple IDs:

```md
## Dependencies

- Depends on: `WI-018`
- Related: `WI-021`
```

<a name="expansion"></a>

## 7. Clarification and expansion of the active work item {#expansion}

Before registering a new work item, compare the person's verbatim new request with `Outcome`, `Scope`, `Acceptance` and `Specs` of the current active WI.

| Situation | Solution |
|---|---|
| The same atomic outcome is preserved, but the request adds a small volume: states, errors, adaptability or checks of one flow | Expand the current active WI |
| A separate outcome appears, a separate acceptance, release or rollback, a different owner or blocker, or a real independent parallel operation | Create a linked new WI |
| Current WI completed | Create linked follow-up WI |

When expanding, outcome is preserved. Combine the full scope and spec links, then add the new acceptances to the full previous list. Removal or weakening of the previous acceptance is allowed only by the explicit decision of a person; the solution and reason remain in the existing comment/audit/history loop.

In `prist-managed`, before expanding, pass a verbatim new request to `resolve_change`, receive a fresh `work_context`, and call `update_work` with the current `expectedVersion`, `runClaim`, and the full merged contents. The coordinator remains the author of the operational mutation. Readiness and completion after expansion are checked against the full updated volume.

<a name="changes"></a>

## 8. Corrections and changes to canon {#changes}

If the code contradicts the clear active spec:
- `Kind: fix`;
- `Canon action: none`;
- link leads to the exact governing anchor;
- acceptance includes playback and regression test;
- spec changes only when a real gap in the canon is detected.

If the desired behavior has changed within the previous area of responsibility:
- `Kind: change`;
- `Canon action: direct-edit`;
- spec is updated before or along with the implementation;
- changelog specs records the change.

If the result creates a new independent responsibility:
- `Canon action: new-spec`;
- WorkItem is created and run before authoring and may include a subsequent implementation of the same atomic outcome;
- governing links and acceptance are specified after the new active spec is ready and before the code;
- separate implementation WorkItems are created only when there are independent results, a separate acceptance, or an explicit authoring task.

If an area of responsibility is replaced, divided, or removed from the product:
- `Canon action: supersede`;
- work item connects the old and new canon;
- lifecycle and reciprocal links are updated by `SPEC-PROTOCOL.md#lifecycle`.

The disputed area is processed according to `SPEC-PROTOCOL.md#conflict`.

<a name="operations"></a>

## 9. Communication with BOARD and WAL {#operations}

`BOARD.md` is the only source of status, owner and priority.

The work item file stores outcome, specs, scope, acceptance, dependencies and result. These fields are not repeated in long text on the board.

WAL-checkpoint is created only for unfinished work:
- session ends before WI closes;
- needs handoff;
- performer switches to another WI;
- a significant destructive step is ahead;
- It is important to save the next step or decision.

Starting and finishing a work item in the same session does not require WAL.

<a name="traceability"></a>

## 10. Trace {#traceability}

- Code and tests contain long-lasting `@spec`.
- Commits, PRs and reports indicate `WI-NNN`.
- Work item associates operational work with one or more specs.
- The short-lived `WI-NNN` is not added to the production code as an ownership marker.

<a name="done"></a>

## 11. Completion {#done}

Work item is ready for `Done` when:
- outcome achieved;
- acceptance passed;
- checks are listed in `Result`;
- code, tests and current specs are consistent;
- changelog updated if canon changed;
- `REVIEW` and `TECHDEBT` are fixed if they appear;
- active WAL-checkpoint deleted;
- `BOARD.md` reflects completion.

Once completed, the file is transferred to `specs/work/archive/YYYY/`. `BOARD.md` stores only recently completed items, the full history remains in the WI and Git archive.
