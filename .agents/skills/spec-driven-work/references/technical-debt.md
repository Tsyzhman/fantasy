# TECHDEBT-PROTOCOL

<a name="purpose"></a>

## 1. Purpose {#purpose}

`TECHDEBT.md` stores understood engineering trade-offs and risks that remain relevant after the completion of the current work.

<a name="when"></a>

## 2. When to create record {#when}

Create a record if:
- implementation leaves a temporary bridge or constraint;
- known risk remains beyond the scope of the current WI;
- canon is made with an agreed upon technical compromise;
- It is important to save information for longer than one work session.

The product idea is included in the product backlog. The current checkpoint is in `WAL.md`. The work being tracked is registered as `WI-NNN`.

<a name="canon"></a>

## 3. Link to canon {#canon}

- Changing the canonical behavior is done by `SPEC-PROTOCOL.md#change-model`.
- The question to the canon text is marked `REVIEW` in the owning spec.
- Technical debt describes the state of implementation, risk and condition of manifestation.
- One risk has one canonical entry in `TECHDEBT.md`.

<a name="format"></a>

## 4. Format {#format}

```md
### TD-001: Short name
- Area: `module` / subsystem
- Related specs: `spec://...#...`
- Introduced by: `WI-024` or commit/release
- Current state: what is left in the implementation
- Risk: what this can lead to
- Trigger: when the risk manifests itself
- Mitigation: how to close or reduce the risk
- Work: —
```

Required fields: `Area`, `Related specs`, `Current state`, `Risk`, `Trigger`, `Mitigation`.

<a name="lifecycle"></a>

## 5. Life cycle {#lifecycle}

- The current entry lives in `Open`.
- When closing becomes a standalone job, create a WI file and one line in `BOARD.md`, then specify `Work: WI-NNN`.
- Until the first checkpoint `WAL.md` does not change.
- After eliminating the risk, transfer the entry to `Resolved` with the date and link to WI or evidence.

`TECHDEBT.md` holds a long-lived risk. The WI file stores the scope and acceptance of a specific pass to eliminate it.
