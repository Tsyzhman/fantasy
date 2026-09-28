# WI-009: Sorting events and several suitable outcomes

- Kind: change
- Canon action: direct-edit

## Outcome
Arena highlights events with up-to-date recommendations and shows several unique outcomes of a single match based on estimated EV.

## Specs
- Governing: spec://modules/betting/FEAT-001-virtual-league#opportunities

## Scope
- In: summary in model snapshot, line sorting before pagination, UI and tests.
- Out: changing the bot formula and limits, express bets, automatic user bets, deploy.

## Acceptance
- [x] Sorting by EV and time works before pagination; The counter counts unique outcomes.
- [x] Several outcomes are visible and open the corresponding coupon; five tips saved.
- [x] Expired/closed line and old versions of bulletins are not highlighted.
- [x] Tests, types, UI, memory/cache and duplicates have been checked.

## Result
Added value/time sorting, highlighting and summary of unique outcomes in the event list; general list of several outcomes with EV/odds/supporting algorithms in the selected match. Before: only kickoff and one best advice per algorithm. After: the entire filtered line is sorted to LIMIT/OFFSET; each unique outcome occupies one line of the general list, five personal tips are saved. The acceptance and limits of bots have not changed.

- `npm run check` exit 0: 1080 pass, 1 skipped; lint 0 errors / 99 warnings; typecheck and production build pass.
- 14 target pass tests: multiple outcomes, deduplication, ranking/equalities, excluded markets, freshness boundaries, versions, new price and limited summary size, parameterized SQL from ORDER BY to LIMIT/OFFSET.
- Real React component tested in a browser with a spoofed API: switching sorting, desired coupon, 5 algorithm cards, independence from search, disappearance of highlighting and active options after quotes expire, light/dark 1440/390px without horizontal overflow. Live PostgreSQL query and production API did not run; local database is unavailable.
- Summary <300 bytes per event, replaced with a quote; The frontend only receives 30 short events. After GC browser heap 4,008,004 bytes; cache/localStorage 0, duplicate IDs 0. QA browser/server is stopped, temporary bundles and input files are deleted.
- Spec snapshot current, source working_tree, diagnostics empty; fingerprint c02d4a50275fb8e11076df652c7a2ad1c1a134f6a249d93a51f8f81e8f7c0c0e.
- Evidence: output/playwright/betting-opportunities/{tests.txt,project-check.txt,browser-report.txt,spec-snapshot.json,light-1440.png,dark-1440.png,light-390.png,dark-390.png}.

No database migration and no deploy. Old entries receive a summary at the next refreshEvent (worker or match opening); before this they are not passed off as assessed.

Integration 2026-09-07: at a separate user request, published jointly with the KHL in WI-011, 0.3.62 / 0d05986. Added real PostgreSQL sorting/pagination checking; production API and value/time sortings are tested by smoke 34157185770.
