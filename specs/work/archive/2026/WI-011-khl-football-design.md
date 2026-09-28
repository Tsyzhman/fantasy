# WI-011 – Football assembly design for the KHL

Kind: change
Canon action: direct-edit

## Outcome
KHL Collector uses contact cards and a football Squad layout tailored to 17 hockey players.

## Specs
- Governing: spec://modules/khl/FEAT-002-khl-squad#layout
- Governing: spec://modules/betting/FEAT-001-virtual-league#opportunities
- Constraint: spec://modules/machete/FEAT-003-squad-player-card#contracts

## Scope
In: squad, cards, adaptability, existing actions, checks and careful publishing.
In also: integration of ready-made WI-009 Betting and production FDR at the direct request of the user.
Out: new calculations, data sources and squad rules.

## Acceptance
- [x] Contact sheet, theme colors and catalog nearby on desktop; readable cards on mobile phones.
- [x] Saved 17 places, keep, permutations, filters, compare, save and scripts.
- [x] Five widths, light/dark themes, duplicates, memory and cache have been tested.
- [x] Checks and production deployment completed with evidence.

## Result
It was: large text blocks of the KHL, a catalog under the entire squad, saving at the bottom. New: general football contact-sheet styles, initials in the absence of a photo, name strip, FP/EP/TOI, direct keep/delete, disclosed details and permutations. Catalog next to 1280px; phones use two columns. Save and select buttons above the squad. Empty space focuses the search by position. Rules 17 of active G2/D6/F9 are saved.

Together, at the direct request of the user, local outcomes/EV from WI-009 and the already published FDR fix cd1ccda are included. The original local work was saved as a separate commit d4c7c92 and merged without losing any files. Runtime 0d059869b4cff0349ace6fc6d443e611c44b3878, release 20260907T194659Z-v0.3.62-0d05986; deploy 34156552775 success. Subsequent commits change tests, history and evidence.

Checks: 1081 unit pass / 1 skip; lint 0 errors / 105 warnings; typecheck/build pass. PostgreSQL tested pre-pagination sorting, deprecation and parameterization; the test transaction was completely rolled back. KHL browser 14 pass (5 sizes, both themes, actions, 50 navigations/filters, worker); football 3 pass / 1 intended mobile skip. Production smoke 34157185770: auth 1 pass, UI 10 pass / 20 intended skips local fixtures and desktop-only scenarios.

Resources: retained JS +592 bytes after 50 transitions; DOM 916→916, listeners 413→413. Filters ~3.3%, selection ~2.5%; maximum 1 worker, canceling terminates it. CacheStorage 0, duplicate IDs 0. The local QA session has been revoked and the servers have been stopped. Production web 368.8 MiB, worker 783.5 MiB; healthy, restarts 0. Catalog 694 of unique players, receipts 9014→9014 between checks; ledger mismatches 0. The new Betting summaries replace the current quote data and do not create an in-memory history. Historical ignored caches were not removed.

Evidence: specs/work/evidence/WI-011/{release.json,production-data.txt,post-smoke.txt,spec-snapshot-summary.json}; local screenshots output/playwright-khl/design-*.png. Full local logs .cache/khl-test/wi011-{integrated-check,browser,football}.log. KHL source restrictions have not changed; if there is no photo/forecast, the initials/“—” are displayed.
