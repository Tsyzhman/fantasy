# SPEC-PROTOCOL

<a name="priority"></a>

## 1. Hierarchy of priorities {#priority}

**man → spec → tests → code**

A person sets an intention and approves a canon. The specification fixes the canon. The tests check the canon. The code implements canon.

Work item defines the boundaries of the current pass. It does not change the priority of canonical sources.

If the task is to create a new spec or deeply rework an existing one, open `SPEC-AUTHORING-PROTOCOL.md`.

<a name="role"></a>

## 2. Role of specification {#role}

A specification describes a durable current behavior, contract, or invariant.

The specifications include:
- area of responsibility;
- scenarios and rules;
- data and states;
- external contracts;
- errors;
- canonical readiness criteria;
- stable connections with neighboring documents;
- history of canon changes.

Owner, priority, current implementation status, session checkpoint and checkboxes for a specific pass live in `BOARD`, WI and `WAL`.

<a name="types"></a>

## 3. Document types {#types}

- `PROP` is a long-lived canon of a project or module.
- `FEAT` is a product opportunity or an independent area of ​​product behavior.
- `INFRA` - life contour of the service: environments, deployment, storage, queues, observability, recovery.

Work item has a separate ID `WI-NNN` and is described by `WORK-ITEM-PROTOCOL.md`.

<a name="required"></a>

## 4. Required properties {#required}

Any `PROP`, `FEAT` or `INFRA` must:
- have `#root`;
- be addressable via `spec://...#anchor`;
- start with a block in simple words;
- contain specificity sufficient to be used as a canon;
- have a change history or document notes;
- be registered in `SPEC-MAP.md`.

For `FEAT` and `INFRA` the following are additionally required:
- control specs;
- current canon boundaries;
- state and data, if the document changes them;
- contracts for external behavior or runtime points;
- erroneous scripts;
- readiness criteria;
- connections with neighboring documents.

For `PROP` the following are required:
- canon boundaries;
- links to adjacent or subordinate documents;
- checklist filling;
- history of changes.

`PROP-000` can be the root document of the project and not have a control spec.

<a name="lifecycle"></a>

## 5. Lifecycle specifications {#lifecycle}

Valid states:
- `draft` - proposal or unfinished canon;
- `active` - current governing canon;
- `superseded` - the document has been replaced by another canon;
- `retired` - The area has been removed from the product without being directly replaced.

For new and significantly changed documents, the state is indicated in YAML:

```yaml
---
status: active
---
```

Legacy document in `specs/common/` or `specs/modules/` without `status` is considered `active`. The training documents in `specs/examples/` are outside the lifecycle working canon.

Rules:
- production code refers through `@spec` to `active` specs;
- `draft` can be used for authoring and planning, implementation begins after the governing spec is translated into `active`;
- file `superseded` or `retired` saves the original path and `spec://` address;
- active directory `SPEC-MAP.md` transfers the replaced document to `Superseded and retired`;
- `common/structure.md` preserves the technical connection of the historical namespace with the code, if it is still needed;
- The ID of the displayed spec is not reused.

For supersession, the old spec contains:

```md
## Superseded by {#superseded-by}

- `spec://modules/core/FEAT-070-new-canon#root`
```

The new spec contains a mutual connection:

```md
## Supersedes {#supersedes}

- `spec://modules/core/FEAT-041-old-canon#root`
```

If one document is split into several, `Superseded by` lists all new owning specs. During partial selection, the previous spec remains `active`, its scope is updated by direct edit and indicates the new document as a neighboring canon.

<a name="naming"></a>

## 6. Naming and addressing {#naming}

The spec file is named as follows:
- `PROP-000-short-slug.md`;
- `FEAT-041-billing-ledger.md`;
- `INFRA-007-production-env.md`.

Legacy change specs of the form `FEAT-041.A-...md` retain validity.

For new documents:
- type prefix is required: `PROP`, `FEAT`, `INFRA`;
- number is unique throughout the spec-space for its type;
- slug is short, stable and reflects the responsibility of the document;
- new independent circuit receives new `TYPE-NNN`;
- letter suffix is ​​created only by explicit human decision for compatibility with an existing document series.

Before creating a spec:
- scan `specs/common/**/*.md` and `specs/modules/**/*.md`;
- check `SPEC-MAP.md`;
- take into account `superseded` and `retired` documents;
- do not reuse the number of a deleted, archived or renamed document; When copying
- , assign a new free number to training files in the `900-999` range.

Canonical address:
- `spec://common/PROP-005-RUNTIME#processes`;
- `spec://modules/core/FEAT-010-account-lifecycle#api.create`;
- `spec://modules/core/INFRA-020-data-baseline#migrations`.

Anchor rules:
- the document has `#root`;
- anchors are stable and human readable;
- nesting uses point segments: `scope.in`, `api.create`, `data.workspace`.

<a name="references"></a>

## 7. Connections between specs {#references}

For real communication, the following are used:
- `Related`;
- `Depends on`;
- `Supersedes`;
- `Superseded by`;
- `See also`.

Links lead to the exact `spec://...#anchor`.

<a name="change-model"></a>

## 8. Canon change model {#change-model}

### Direct edit

Use direct edit when the current area of responsibility remains:
- the wording, term, anchor, scope or acceptance is specified;
- missing part added;
- the agreed upon new behavior becomes the current canon of the same area;
- The old behavior stops working.

Update the text and `Историю изменений`. If a traceable implementation is required, create `WI-NNN` with `Canon action: direct-edit`.

### New independent speck

Create a new `TYPE-NNN` when:
- new product opportunity;
- new process;
- new runtime circuit;
- is a separate responsibility that you can use and change yourself.

To track the result, use this order:
1. before the first edit, determine the type, namespace, planned full spec-address with the `#root` anchor, the existing superior canon and restrictions;
2. create and run a WorkItem with `Canon action: new-spec`, placing the planned address in `Affected`; the first spec-space may not have an existing `Governing` link;
3. create and register a spec, keeping `draft` while its ownership, scripts or contracts are ambiguous;
4. before the dependent implementation, transfer the spec to `active`, add its exact anchor to `Governing` and update the scope and acceptance WorkItem;
5. continue the implementation in the same WorkItem with one atomic result or create related WIs for independent results before the code.

### Supersession

Use supersession when the previous document loses its entire role as governing canon due to replacement, division or consolidation of responsibilities.

Create a new spec with a new ID, update the lifecycle and mutual links, then make the transition via WI from `Canon action: supersede`.

### Coexistence and migration

If old and new behavior temporarily coexist, both owning specs remain `active` and explicitly describe the conditions of applicability.

Execution of migration is registered as a work item. A long-lived migration/rollout/rollback contract receives an independent `FEAT` or `INFRA` with a new ID.

### Historical sections

Release and audit snapshots are saved via Git tag, release or other accepted immutable artifact of the project.

A new task, wave, or repeat implementation pass does not in itself create a new spec. For them, `WI-NNN` is used.

<a name="conflict"></a>

## 9. Conflict between code and spec {#conflict}

If the code contradicts the clear active spec:
1. reproduce the discrepancy;
2. follow the current canon;
3. fix the code and tests;
4. save the specification text if it is specific enough;
5. For monitored work use `Kind: fix` and `Canon action: none`.

If the spec does not contain the parts necessary for an unambiguous correction:
- perform direct edit with confirmed intent;
- add changelog;
- implement the clarification in the same WI.

If the desired behavior has changed, first update the canon under section `8`.

If the implementation can be done using the current text and a question remains, add:

```md
<!-- REVIEW: кратко опиши вопрос и почему он важен -->
```

The high risk of loss of data, security, money or the main user scenario moves the work into planning before human decision.

<a name="code-traceability"></a>

## 10. `@spec` in code {#code-traceability}

New or significantly changed spec-owned code receives the marker:

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
- large component;
- worker;
- migration;
- materializer or importer;
- test that directly checks the spec-owned contract.

During supersession, update `@spec` to the current governing canon at the affected points. A legacy marker is only valid for code that continues to serve an explicitly described legacy path.

<a name="done"></a>

## 11. Consistency check {#done}

Before finishing work with the speck, check:
- type and lifecycle are selected correctly;
- `spec://` addresses and anchors exist;
- `SPEC-MAP.md` shows current responsibility and lifecycle;
- `common/structure.md` reflects the namespace and connection to the code if the technical map has changed;
- direct edit received changelog;
- supersession has reciprocal links;
- ID is not repeated or reused;
- controversial places are marked `REVIEW`;
- code points of responsibility are current `@spec`;
- the monitored implementation is framed as separate `WI-NNN`;
- specification does not store owner, session status and progress of a specific WI.
