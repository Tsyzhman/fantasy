# WI-048: Put small franchise names next to chart points

- Kind: `change`
- Canon action: `direct-edit`

## Outcome

Franchises are identifiable directly on compact charts using small, abbreviated labels, as requested in review of PR #37.

## Specs

- Governing: `spec://modules/franchises/FEAT-005-franchise-analytics#ui`
- Constraint: `spec://modules/franchises/FEAT-005-franchise-analytics#contracts`

## Scope

- In: compact display names, label placement, responsive plot and visual verification in PR #37.
- Out: data, formulas, API caching and deployment.

## Acceptance

- [x] Both charts show every available franchise as a small label near its unchanged point.
- [x] Abbreviations preserve distinguishability; full names remain available in tooltips, selection and the directory.
- [x] Labels do not enlarge with desktop width; light/dark and mobile layouts are inspected.
- [x] Relevant checks pass; layout work is bounded and does not introduce requests or caches.

## Dependencies

- Related: `WI-047`.

## Result

Completed in PR #37 on 2026-10-04. [Verification](../../evidence/WI-048/verification.json), [light preview](../../evidence/WI-048/chart-0-1440-light.png), [dark preview](../../evidence/WI-048/chart-1-1440-dark.png).

- Before: points required a separate directory for identification. After: all 75 available points on each chart have adjacent 10 px abbreviated names; articles/filler words are removed and selected long names use recognizable aliases. Canonical names, tooltips, exact values, CSV and profile selection remain intact.
- The plot uses the full card width and fixed 390 px height. The directory is expandable below it. Mobile scrolls only the plot horizontally at a minimum width of 720 px, keeping 10 px text instead of shrinking it with the whole SVG.
- Browser checks cover both charts at 1440/760/390/320 px in light/dark themes: 75 labels each, zero measured text overlaps, exact 10 px font size and no page overflow. Search/selection/resize causes zero API reads. Twenty-five interactions change collected heap from 34,884,200 to 34,355,764 bytes in development; this is a bounded sample, not a long-term leak claim.
- Eighteen relevant tests pass, including abbreviation ambiguity and bounded label placement; focused lint has zero errors/70 untranslated-copy warnings. Typecheck and production build pass. Server/API/aggregation/cache code is unchanged, no dependency added. Specification snapshot is current with no diagnostics.
- QA user/session removed, app/browser/database stopped, copied snapshot/private state removed. Removed 82,894,819 bytes of obsolete webpack index backups after successful build; current cache and source data preserved. No new REVIEW or TECHDEBT.
