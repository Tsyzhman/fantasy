# SPEC-AUTHORING-PROTOCOL

<a name="purpose"></a>

## 1. Purpose {#purpose}

This protocol is used to create a new specification or deeply rework an existing one.

The specification describes a durable canon. The plan for a specific implementation and its acceptance live in one or more `WI-NNN`.

<a name="research"></a>

## 2. Minimum study {#research}

Before drafting, read:
- `specs/common/main.md`;
- `specs/SPEC-MAP.md`;
- `specs/common/structure.md`;
- relevant `common PROP` and neighboring specs;
- existing WI, if authoring is included in the tracked work;
- code and tests when the document describes existing behavior.

Stop searching when ownership, current canon and affected contracts are clear.

<a name="type"></a>

## 3. Type selection {#type}

Use:
- `PROP` for long-lived invariants, terms, models, general contracts and module boundaries;
- `FEAT` for an independent product opportunity or behavior area;
- `INFRA` for runtime, environments, deployment, storage, queues, observability and recovery.

If a document connects several independent responsibilities, divide them into separate specs and link them with exact `spec://` addresses.

<a name="before-draft"></a>

## 4. Solution to draft {#before-draft}

Define:
- change format: `direct-edit`, `new-spec` or `supersede`;
- type and the next free `TYPE-NNN`;
- module and `spec://` namespace;
- lifecycle: `draft` or `active`;
- control and neighboring specs;
- canon boundaries;
- questions that require `REVIEW`.

Apply the change and lifecycle rules from `SPEC-PROTOCOL.md`.

The new number is selected after searching for `specs/common/**/*.md`, `specs/modules/**/*.md` and `SPEC-MAP.md`. Consider the `active`, `draft`, `superseded` and `retired` documents. Numbers are not reused.

Letter series `.A`, `.B`, `.C` are saved in legacy projects. The new self-canon gets a new `TYPE-NNN` if the person has not explicitly chosen a compatible letter ID.

<a name="lifecycle"></a>

## 5. Lifecycle with authoring {#lifecycle}

Use `status: draft` while ownership, scripts or contracts remain undefined.

Translate a document to `status: active` when:
- purpose and boundaries are unambiguous;
- canonical scripts and contracts are sufficient for use;
- material issues resolved or marked `REVIEW` with acceptable risk;
- the person instructed to accept this document as canon or explicitly instructed the implementation of it.

This transition requires editing the spec itself and one line in `SPEC-MAP.md`.

<a name="registration"></a>

## 6. Registration {#registration}

After creating or changing lifecycle:
1. update one spec line in `SPEC-MAP.md`;
2. update `common/structure.md` only when the module, namespace, folder ownership or spec-space association with the code changes;
3. add a link to `common/main.md` if a new top-level general `PROP` has appeared;
4. for an already running `new-spec` WorkItem, update the exact governing/affected links, scope and acceptance after the spec is ready; do not duplicate the new WI here.

One-step creation of a spec does not itself create a line in `BOARD.md` and a checkpoint in `WAL.md`. The tracked authoring or the single result of “spec + implementation” is received by WorkItem before the first edit according to the general protocol.

Training files from `specs/examples/` are registered after copying to the working module and assigning a new free ID.

<a name="work-items"></a>

## 7. Implementation split {#work-items}

After the canon is ready, clarify the already selected working circuit:
- tracked `new-spec` WorkItem can continue to implement a small spec in the same WI if authoring and code give one atomic outcome;
- before the code, the new governing spec has the status `active`, and WorkItem contains its exact anchor and current scope and acceptance;
- , before implementation, the volumetric spec is divided into several related WIs according to completed user or runtime results;
- one WI can refer to several specs if they have a common atomic outcome;
- one-step authoring or implementation in the current session can proceed without WI only if the criteria for one-step work are met.

WI stores the scope of the current pass, acceptance and result. Speck preserves scripts, contracts and criteria for canonical behavior without session progress.

<a name="readiness.prop"></a>

## 8. Ready PROP {#readiness.prop}

`PROP` contains:
- block in simple words;
- purpose and boundaries;
- invariants, terms or general rules;
- adjacent or subordinate documents;
- checklist filling;
- change history;
- `REVIEW` for controversial areas.

`PROP-000` can be a root document without a control spec.

<a name="readiness.feat"></a>

## 9. Ready FEAT {#readiness.feat}

`FEAT` contains:
- block in simple words and purpose;
- control specs;
- canon boundaries;
- participants and start event;
- scripts;
- data and states;
- UI, API, events or other external contracts;
- errors and validation;
- expected points `@spec`;
- canonical readiness criteria;
- connections and history of changes.

<a name="readiness.infra"></a>

## 10. Readiness INFRA {#readiness.infra}

`INFRA` contains:
- block in simple words and purpose;
- control specs;
- canon boundaries;
- environments and dependencies;
- canonical runtime solutions;
- data, status and migrations;
- entry points and operational scenarios;
- rollout, rollback and recovery;
- observability;
- expected points `@spec`;
- canonical readiness criteria;
- connections and history of changes.

<a name="feat-template"></a>

## 11. Minimum structure FEAT {#feat-template}

```md
---
status: draft
---

# FEAT-<NNN>: <title> {#root}

## In simple words {#plain-language}
...

## 1. Target {#goal}
...

## 2. Control specs {#governing-specs}
- `spec://...#...`

## 3. Boundaries {#scope}
### 3.1. Included {#scope.in}
...
### 3.2. Abroad {#scope.out}
...

## 4. Participants and launch event {#actors}
...

## 5. Scenarios {#scenarios}
...

## 6. Data and status {#data}
...

## 7. Contracts {#contracts}
...

## 8. Errors and validation {#errors}
...

## 9. Implementation trace {#traceability}
...

## 10. Readiness criteria {#acceptance}
...

## 11. Communications {#relationships}
...

## 12. Change history {#changelog}
- [YYYY-MM-DD] created.
```

<a name="infra-template"></a>

## 12. Minimum structure INFRA {#infra-template}

```md
---
status: draft
---

# INFRA-<NNN>: <title> {#root}

## In simple words {#plain-language}
...

## 1. Target {#goal}
...

## 2. Control specs {#governing-specs}
- `spec://...#...`

## 3. Boundaries {#scope}
...

## 4. Environments and dependencies {#environments}
...

## 5. Canonical solutions {#decisions}
...

## 6. Runtime and operations {#runtime}
...

## 7. Data, status and migrations {#data}
...

## 8. Contracts and entry points {#contracts}
...

## 9. Rollout, rollback and recovery {#recovery}
...

## 10. Observability {#observability}
...

## 11. Implementation trace {#traceability}
...

## 12. Readiness criteria {#acceptance}
...

## 13. Communications {#relationships}
...

## 14. Change history {#changelog}
- [YYYY-MM-DD] created.
```

<a name="style"></a>

## 13. Style {#style}

- Write in the project language.
- Formulate who performs the action, when it is launched, what changes and what result is considered correct.
- Keep stable anchors.
- Mark the disputed place `REVIEW`.
- Record a conscious engineering compromise in `TECHDEBT.md`.

<a name="done"></a>

## 14. Completion of authoring {#done}

Check:
- type, ID and lifecycle are consistent;
- ownership does not duplicate the neighboring spec;
- document registered in `SPEC-MAP.md`;
- `structure.md` was updated only when the technical map was changed;
- all `spec://` links and anchors exist;
- the implementation is decomposed into WI only to the required extent;
- in the spec there is no owner, priority, session status and implementation progress.
