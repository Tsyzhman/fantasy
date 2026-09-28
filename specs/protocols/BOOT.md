<!-- Generated from spec-driven-work/SKILL.md. Edit the canonical skill source. -->
# BOOT

This file is read at the beginning of each AI session.

Use it as your main skill router. First, select a route and load only the references listed below. Don't read all the references in advance.

<a name="managed-preflight"></a>

## 0. Mandatory managed preflight {#managed-preflight}

In `prist-managed`, before the first repository write, complete the entire order:

1. flush pending spec sync;
2. get `project_context` and then `work_context` for an explicit WI or `resolve_change` for a plain language query;
3. select route and `canonAction`;
4. read the focused references of this route;
5. for `new-spec` and the first spec-space list the planned PROP/FEAT/INFRA types and call `get_spec_example` for each type before authoring;
6. for tracked work, create a full WorkItem and call `start_work`;
7. tell the person in one line: `Route: <...> · References: <...> · Examples: <...|not needed> · structure.md: <create|update|unchanged>`.

Do not change specs, code or tests until applicable items have been completed. `references/prist-managed.md` specifies precise semantic operations.

For tracked `new-spec` the absence of a new spec file does not delay WorkItem. Before `create_work`, define the type, namespace and planned full spec address with the anchor `#root`, indicate the existing higher canon and restrictions, if any, and the planned address in affected links. After registering and transferring the new spec to `active`, update its governing anchor, scope and acceptance WorkItem and only then start the dependent implementation.

<a name="entry"></a>

## 1. Session entry {#entry}

First resolve the explicit workflow mode from `.prist/workflow.json` or repository entrypoint. Do this before searching for the task and any operational mutations:

- `standalone`: WI, BOARD, WAL and TECHDEBT are maintained in the repository; `specs/.me` specifies agent identity;
- `prist-managed`: operational state is maintained only through Prist. Read `references/prist-managed.md` right away, execute it Start a turn and do not create repository copies of WI/BOARD/WAL/TECHDEBT.

If mode is missing or inconsistent, stop operational mutation and read `references/repository-bootstrap.md`. Availability Prist does not define or change mode. Specs, code, tests and Git remain repository canon in both modes.

First, resolve the working context with a minimum number of reads.

### If the request specifies `WI-NNN`

TO `standalone`:

1. Open its file in `specs/work/` or `specs/work/archive/`.
2. Find one WI line in `specs/BOARD.md`.
3. Look for the checkpoint of this WI in `specs/WAL.md`. Open the entire WAL only if there is a relevant section or general solution.
4. Open the governing specs listed in WI and only the necessary constraint/affected specs.

- In `prist-managed` get `project_context`, then `work_context` for this ID and open the listed governing/constraint/affected specs from the repository. Don't look for repository WI/BOARD/WAL.

### If WI is not specified

In `standalone`, look for the context in this order. Look for the context in this order:
1. active lines `BOARD.md`;
2. human-readable map `SPEC-MAP.md`;
3. technical map `common/structure.md`;
4. file names, headers and anchors in `specs/**`;
5. `@spec` in code and tests;
6. names of modules, screens, processes, components and files.

In `prist-managed`, first obtain `project_context` and call `resolve_change` to request the change. Then read the found specs, connections and the minimum set of code/tests from the repository. For status questions, use the focused operations `readiness_context`, `list_ideas`, `list_work` and `work_context`.

The search is lazy. Don't load the entire spec-space and all the code if the problem has already been resolved by a smaller context.

In `standalone` the following rule applies: `specs/.me` is needed before claim work item or change of ownership, `BOARD.md` and `WAL.md`. For read-only analysis and one-step work without operational accounting, the absence of `.me` does not block reading. If an operational change is needed and the file is not there, ask the person to create one from `specs/.me.template`. Do not commit `specs/.me`.

In `prist-managed` owner specifies an authenticated connection identity; `specs/.me` is not used.

<a name="scope"></a>

## 2. Workflow selection {#scope}

Choose one of four routes.

### A. One-step operation

Use this route when the task:
- ends in the current session;
- has an obvious owning spec;
- does not require a separate owner/status, handoff, coordination or blocker.

Perform changes and checks. `WI`, `BOARD` and `WAL` are not created. If the canon changes, update the existing direct edit + changelog spec. In `prist-managed`, after the material change, also synchronize the spec-space.

### B. Existing work item

Read `references/work-items.md`, `references/board.md` and only with handoff/blocker/stop - `references/checkpoints.md`.

- In `standalone`, work using the found WI file and the BOARD line.
- In `prist-managed` work according to `work_context`; if status is `backlog`, call `start_work` before changing specs/code/tests. Don't use checkpoint to start.

To `standalone`: Work according to the found `WI-NNN`. `BOARD.md` remains the source of status and owner. Create or update `WAL.md` only if there is a real need for a checkpoint.

### C. New tracked work

If the work requires separate accounting:

Read `references/work-items.md` and `references/board.md` first.

TO `standalone`:

1. create `specs/work/WI-NNN-short-slug.md` by `WORK-ITEM-PROTOCOL.md`;
2. add one compact line to `BOARD.md`;
3. if work starts now, place the line immediately in `In Progress`;
4. do not create WAL at the beginning of the session;
5. create a WAL-checkpoint, only if the work remains unfinished, a handoff or context switch will be required.

- In `prist-managed`, call `create_work` with all protocol fields and then `start_work` before changing the implementation.
- In both modes, do not create a checkpoint at the beginning; it is only needed for an incomplete stop, handoff or blocker.

Separate accounting is needed for independent scope/acceptance, several steps, risk, blocker, dependency, coordination, continuation between sessions or an explicit request of a person.

### D. New or changed canon

Read `references/specification-authoring.md` and `references/specification-lifecycle.md`.

In `prist-managed` when tracked `new-spec` also read `references/work-items.md` and get a service-owned example for each planned spec type before the first repository write.

If there is no suitable spec, before the first repository write, determine the format of the new canon. For tracked work, first create and run one `new-spec` WorkItem, then:
1. create and register a spec in `SPEC-MAP.md`;
2. update `common/structure.md` if the module, namespace or connection to the code changes;
3. bring the governing spec to `active` and update the links, scope and acceptance of the existing WorkItem to implementation;
4. implement the same atomic result in this WorkItem or create related implementation WorkItems before the code if the finished canon has identified several independent results.

One-step authoring without a separate result, status or continuation does not create a WorkItem and a row in `BOARD.md`.

If several equally probable owning specs are found and the choice affects the decision, check with the person.

<a name="routing"></a>

## 3. Routing by task type {#routing}

- Creating or substantially revising a specification: `SPEC-AUTHORING-PROTOCOL.md`.
- Change of canon, lifecycle, direct edit, supersession or conflict with spec: `SPEC-PROTOCOL.md`.
- Create, split, fix or terminate `WI-NNN`: `WORK-ITEM-PROTOCOL.md`.
- Status, owner, priority or blocker work item: `BOARD-PROTOCOL.md`.
- Checkpoint, handoff or resume: `WAL-PROTOCOL.md`.
- Conscious compromise outside the current scope: `TECHDEBT-PROTOCOL.md`.
- Implementation of workflow into an existing project: `.human/adopt-existing-project-agent.md`.

Inside the skill, these compatibility names correspond to the focused references from the previous section. In `prist-managed`, the focused reference preserves the meaning and criteria of the protocol, and `references/prist-managed.md` specifies a semantic operation instead of a repository operational file. To implement or update workflow, use `references/repository-bootstrap.md`.

<a name="fix"></a>

## 4. Code correction for the current spec {#fix}

If the code contradicts the clear active spec:
1. consider the governing canon;
2. reproduce the discrepancy by test or inspection;
3. fix the code;
4. save `Canon action: none` if WI is created;
5. update the spec only when a missing part is detected.

If a person requests a new behavior, first select direct edit or supersession by `SPEC-PROTOCOL.md#change-model`.

The complete procedure is in `references/specification-lifecycle.md#change-model`.

<a name="traceability"></a>

## 5. Rule `@spec` {#traceability}

New or significantly changed spec-owned code receives the full address of the responsible spec:

```ts
/**
 * @spec spec://modules/core/FEAT-010-account-lifecycle#api.create
 * @spec spec://common/PROP-006-API#errors
 */
```

Markers are placed on points of responsibility:
- file;
- handler;
- service or class;
- large UI component;
- worker or job processor;
- migration;
- materializer, read-model builder or importer.
- direct contract test, which confirms the owning contract.

For small helper functions, ownership is inherited from the nearest marked block.

<a name="review"></a>

## 6. Working with controversial areas {#review}

If the implementation can be honestly performed according to the current canon:
1. do the job;
2. add `REVIEW` next to the disputed place;
3. indicate the question in the final report.

If an open question poses a high risk to data, security, money, or a core user scenario, stop planning and ask for a human solution.

<a name="sync"></a>

## 7. Spec-space synchronization {#sync}

In `prist-managed` receive live tools via project-local remote MCP, materialized connection component in `.codex/config.toml` and `.mcp.json`. Credential is stored only in locally ignored connection/config files with limited permissions. If the current agent session was opened before installing config, the connection component completes setup and `connection_ready` itself, and MCP discovery appears after an explicit trust and a new session.

Material change is a change in the active/draft `PROP`, `FEAT` or `INFRA`, `specs/SPEC-MAP.md`, `specs/common/structure.md` or the addition, deletion or transfer of `@spec` in code, tests, tools, agent artifacts or migrations.

After material change and before completion:

1. run `node .agents/skills/spec-driven-work/scripts/sync-spec-space.mjs snapshot --root .` and check `status`, diagnostics, Git/working-tree provenance and fingerprint;
2. to `prist-managed` take the current `canon.snapshotVersion` from `project_context`, then do `sync --project-id <id> --expected-version <version>`;
3. before a new managed context always execute `flush --root .` if `.prist/outbox/spec-sync.json` exists;
4. for `partial`, pending or version conflict, do not declare current completion: eliminate diagnostics or rebuild the snapshot using a fresh context and repeat;
5. pass an explicit `specChange` to `complete_work`: `{ "kind": "material", "fingerprint": "<receipt>", "snapshotVersion": <receipt> }`. If the material sources have not changed, pass `{ "kind": "none" }`.

Snapshot and outbox do not contain credential. The script reads `.prist/connection.json` only when sending, saves the receipt separately and edits transport errors before writing the pending state.

<a name="finish"></a>

## 8. Ending session {#finish}

The following repository writes apply to `standalone`. In `prist-managed`, perform the equivalent status, checkpoint, result and evidence operations in `references/prist-managed.md`; Do not change WI/BOARD/WAL/TECHDEBT files.

### Work item completed

- go through acceptance WI;
- list as completed only acceptance for which the named check was actually performed or evidence was saved;
- if a person has banned a specific tool or deploy, continue with the remaining available checks; if a mandatory check is not possible, leave the WI incomplete and save the checkpoint;
- fill in `Result` with the completed checks and the total;
- update the changelog only for those specs whose canon has changed;
- move WI to `specs/work/archive/YYYY/`;
- translate the string `BOARD.md` to `Done`;
- delete the WAL-checkpoint of this WI, if it existed;
- indicate `REVIEW` and `TECHDEBT` in the report.

### Work item remains active

- save status `In Progress` or `Blocked` to `BOARD.md`;
- create or update one short WAL-checkpoint with the current state and the next step;
- do not copy the WAL scope and acceptance from the WI file.

### One-step operation

- indicate changed files and checks;
- workflow operational files remain unchanged.

<a name="write-matrix"></a>

## 9. Minimum set of changes {#write-matrix}

| Event | Which workflow files are changing |
|---|---|
| One-step implementation of | spec only when changing the canon |
| Creating or changing a spec | spec + `SPEC-MAP.md`; `structure.md` when changing the technical map |
| Start of monitored work | WI file + one line `BOARD.md` |
| Change status, owner, priority or blocker | `BOARD.md` |
| Stopping an unfinished session | `WAL.md`; `BOARD.md` when status changes or blocker |
| Completion of WI | Result and archive WI + `BOARD.md` + deleting existing WAL-checkpoint |

Code, tests and product artifacts change according to the scope of the task. The table records only the operational workflow.

In `prist-managed` the same matrix is ​​executed through semantic operations: `create_work` + `start_work`, `update_work`, `checkpoint_work` and `complete_work`. Creating or changing a spec still changes the repository canon and requires spec sync; Prist doesn't write specs or code.
