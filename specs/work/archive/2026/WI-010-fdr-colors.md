# WI-010: Restore FDR on the server

- Kind: fix
- Canon action: none

## Outcome
On the server, opponent tiles in cards and tables are again using the FDR colors 1–5.

## Specs
- Governing: spec://modules/machete/FEAT-003-squad-player-card#contracts
- Constraints: docs/archive/design/NEW_DESIGN.md; docs/operations/DEPLOYMENT.md; docs/operations/PRODUCTION_RELEASES.md.

## Scope
- In: CSS cascade, regression check, isolated patch release, live CSS/browser verification.
- Out: difficulty calculation, data, Arena changes from WI-009.

## Acceptance
- [x] The cause is confirmed to be in the current production CSS.
- [x] FDR 1–5, unknown difficulty and home/away match are correct in both topics and table/card contexts.
- [x] Release checks and regular deploy are successful; a new commit has been confirmed on the server.
- [x] Cache, duplicates and memory checked; temporary resources are freed.

## Result
Was: generic .fixture-pill overlapped FDR colors with equal specificity. Now: :where(.fixture-pill) sets a neutral fallback, FDR levels 1–5 retain the color. The home/guest accent and unknown complexity are retained.

The cd1ccda fix was published by the regular deploy 34128583204 as 0.3.61 and saved in the merged 0.3.62 / 0d05986 (WI-011). Tested production CSS, contract test and original browser evidence light/dark from output/playwright/fdr-fix/browser-report.txt mainly checkout: colors match tokens, cache/storage/duplicate IDs 0. For joint review and release resources, see WI-011; production smoke 34157185770 success.
