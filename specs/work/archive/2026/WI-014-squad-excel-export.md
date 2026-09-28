# WI-014 - Export full Squad pool to Excel

Kind: fix
Canon action: none

## Outcome
The Squad pool with more than 1000 players is uploaded entirely to the correct XLSX.

## Specs
- Governing (registered legacy): docs/reference/API_ROUTES.md
- Constraint: spec://modules/machete/FEAT-003-squad-player-card#root

## Scope
In: Squad export line limit, XLSX verification via real authenticated API, regression and production.
Out: Change table format, player lineup, prices, filters, or permissions.

## Acceptance
- [x] The failure of the current endpoint for 1005 lines has been reproduced.
- [x] Export1005 rows preserves each row and numeric cell type; the 5000 limit remains limited.
- [x] Production fixed, browser check passed; cache/memory checked, Git synchronized.

## Result
Diagnostics: squads/export-table limited to 1000 lines, current UCLpool1005; players/export-table already supports 5000. The client sends the full filtered pool, the server responds with 400; The UI hides the technical reason with a generic message.

Before fix: production smoke34218629349, desktop request1005rows received 400 BAD_REQUEST / rows must contain at most1000 player rows twice. The run was stopped after playback so as not to repeat the deliberate failure in all viewports. In the UI test, the waiting race for responsive controls was separately eliminated: desktop waits for a button, tablet/mobile opens “More filters and uploading”.

Edit runtimeaf35df1: limit 5000 as in players/export-table, without cutting rows or changing columns. Local npmruncheck:1086pass/1skip, lint0errors/105warnings, typecheck/buildpass. After fixing the test: typecheckpass. Spec snapshotcurrent. Deploy34218839176 success; release20260908T111059Z-v0.3.65-af35df1, health0.3.65/af35df1c29877ddc9b68c7aedcdc441bb1ea9564.

Production34219660334: all 3 API tests passed - 1005 rows read by ExcelJS, each row and numeric price matched, 5001 rejected 400. UI test erroneously included hidden translations in the button's accessible name; fixed includeHidden without editing UI. Final34220217615 success: API and real download button passed to desktop/tablet/mobile, the number of lines of the downloaded file coincides with the full uploaded pool. After downloading web379.4MiB/worker457.3MiB/Postgres946.2MiB. Exporting does not create server files or cache; local QA artifacts are limited to the current run.
