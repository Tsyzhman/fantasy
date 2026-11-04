# WI-086: Preserve table controls and modal keyboard focus

- Kind: `fix`
- Canon action: `none`

## Outcome

Keyboard users can activate native table controls and operate touch-action dialogs without losing focus.

## Specs

- Governing: `spec://common/PROP-002-editorial-sport-design#root`
- Constraint: `spec://common/INFRA-006-continuous-deployment#root`

## Scope

- In: SortableTable event handling, planner touch action dialog and CommandPalette focus lifecycle; primary/alternative forecast tooltip round labels and selected horizon. Preserve current layouts and all analytical controls.
- Out: unrelated work, interface capability removal, unreviewed production mutations.

## Acceptance

- [x] Enter/Space activate body buttons/inputs; sortable headers and keyboard resize still work; dialog traps Tab, closes Escape and restores focus; responsive visual checks.
- [x] Both dialogs wrap Tab/Shift+Tab, handle Escape from every child and restore focus; planner replacement moves focus to the next step.
- [x] EN/RU forecast tooltips preserve round indices with leading/interior missing values, retain zero, reject nonfinite values and label the selected 3/5-round horizon.
- [x] Applicable tests pass and before/after evidence is recorded.

## Dependencies

- Related: WI-084

## Result

Implementation and addressed verification are ready for root integration (2026-11-04). BOARD, WAL, archive and release changes remain with the coordinator.

- Before → after: table-level Enter/Space cancellation blocked native controls; cancellation now occurs only after a genuine sortable-header action. Nested controls, resize handles and body cells retain their native behavior. DOM, managed and server sorting plus keyboard resize were verified in Edge.
- Before → after: touch actions lacked containment/return and CommandPalette handled Escape only in its input; shared `useModalFocus` now owns initial focus, topmost-dialog Tab/Shift+Tab containment, Escape, listener/scroll cleanup and focus return. Removed triggers have a roster fallback; pool and XI/bench replacement move focus to their next step. Name-search selection excludes the hidden Fits checkbox and provides a visible loading fallback.
- Before → after: filtering missing primary values renumbered later rounds and the Russian alternative label always said five; round positions, unavailable entries and zero are preserved, and EN/RU labels use the selected 3/5 horizon.
- CommandPalette is currently dormant (no production mount found). Its component and nested Ctrl+K behavior are covered without mounting new product UI. Its overlay remains above touch actions when both are used in the fixture.
- Checks: 82/82 targeted unit/contract tests; 42 passed and 18 intentional skips across five Edge widths (320/390/1024/1440/1920); 5/5 final responsive screenshot checks; targeted ESLint 0 errors, one unchanged `setSelections` dependency warning. The fixture mock includes the installed Next 16.4.2 `bfcacheId` requirement. On 2026-11-04 the coordinator reported successful full typecheck/build and visually checked the mobile-390 light screenshot.
- Isolated fixture tests use their own Playwright config, no auth setup or database, and are excluded from the default production-smoke projects (verified listing: 49 ordinary tests, zero isolated-suite matches).
- After 30 palette cycles: no retained dialog keydown/focusin listeners; post-GC heap delta 967,088 bytes. Fixture servers/browser processes exit after checks. Duplicate intermediate logs were removed; final screenshots are captured at CSS-pixel scale.
- Evidence, reproducible baseline and commands: [WI-086 evidence](evidence/WI-086/README.md). Visual checks use actual repository CSS and its sans fallback; the isolated fixture does not embed Next's Onest font or validate database-backed page delivery.

