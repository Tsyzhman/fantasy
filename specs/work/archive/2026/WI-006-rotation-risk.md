# WI-006: RR — риск ротации игрока

- Kind: `implement`
- Canon action: `new-spec`

## Outcome
Планировщик показывает объяснимый RR и использует его в режиме «Надёжная».

## Specs
- Governing: `spec://modules/machete/FEAT-004-rotation-risk#root`
- Affected: `spec://modules/machete/FEAT-004-rotation-risk#root`
- Constraint: `spec://modules/machete/FEAT-001-global-ranking-strategy#contracts`

## Scope
- In: pure baseline, bounded history reader, player DTO, reliable scoring, table/explanation, snapshot refresh, regression tests.
- Out: weight calibration, injury prediction, EP engine replacement, global K changes, deployment.

## Acceptance
- [x] Exact weighted formula, rest boundaries, sparse/unknown history and chronology verified.
- [x] RR reaches the player pool and Worker; reliable uses it without changing EP or other modes.
- [x] UI exposes percentage and reasons; saved column preferences accept RR.
- [x] Bounded/deduplicated reads and snapshot upgrade tested; relevant repository checks pass.

## Result
Before: no standalone RR; reliable used minutes/appearance/confidence and generic risk notes. After: RR_V1 uses the requested 50/20/10/5 windows plus normalized rest, with explicit unavailable/short-history states. The reliable branch applies RR once, leaving original EP and the other strategy branches unchanged. A default/optional RR % table column exposes counts and rest in a tooltip. Existing saved column selections are preserved; their user can enable RR in the column chooser.

History is read from normalized match_player_stats in deduplicated batches of at most 250 players, at most 50 known lineup rows/player plus the last played date. No new tables, migration, HTTP calls or permanent cache. Snapshots record RR version/expiry, and existing sequential refresh upgrades legacy/expired pools. The lightweight un-enriched pool remains readable with unknown RR.

Validation: 146 targeted tests passed. Final `npm run check` exited 0: 1,051 total / 1,050 passed / 1 skipped / 0 failed; lint 0 errors and 58 warnings in the shared working tree (outside RR changes); typecheck, production build and standalone sanitization passed. `git diff --check` passed. Spec snapshot current, diagnostics empty.

Memory evidence: [WI-006-memory.json](../../evidence/WI-006-memory.json) — six passes × 5,000 synthetic calculations; post-GC heap 8,285,896 → 8,260,240 bytes and stable for the last three passes. One compact result: 393 bytes. Reader tests repeat 601 players three times, exactly three batched queries/pass, stable map sizes and no retained global cache. This is synthetic evidence, not a production leak guarantee. The one temporary measurement script was removed; unrelated data/processes were preserved.

Limitation: localhost:5433 remained unreachable. The live SQL query, actual historical completeness, full authenticated browser scenario and materialized RR values have not been verified against the real database. No deployment or manual snapshot rebuild was performed. On a running instance the existing scheduled snapshot refresh populates RR; missing observations remain visibly unknown.
