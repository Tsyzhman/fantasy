# WI-021 - Statistics, squad and import of the KHL

Kind: fix
Canon action: direct-edit

## Outcome
The KHL catalog and card show known time/PP/PK/attack with partial coverage and image update, without false zeros.

## Specs
- Governing: spec://modules/khl/FEAT-002-khl-squad#cards
- Governing: spec://modules/khl/INFRA-002-khl-storage-and-api#protocol-aggregates
- Constraint: spec://modules/khl/FEAT-002-khl-squad#quality

## Scope
In: replay production tables/API, partial averages and coverage, fresh snapshot without loss of squad/filters, local checks and safe release.
Out: xG and KHL direct source blocking (WI-017), football data and external transfers.

## Acceptance
- [x] Partial coverage maintains a known average; no data differs from observed zero.
- [x] The table and card show data after changing the window and updating; the current squad and filters are saved.
- [x] Production UI/API tested on desktop/mobile; Git, runtime, duplicates, cache and memory are checked.
- [x] TOI, PP, PK and attack are separated, each column is sorted in both directions.
- [x] Desktop uses the compact platform of the football Squad, mobile uses a separate list with touch actions.
- [x] Importing the current Sports lineup via a linked profile works, errors do not clear the current version; the result is published on the server.

## Result
Published by 0.3.70, runtime commit 8deba825cfa351bff4362fea34ad080291a92f79; deploy workflow 34773231429 success. Production browser 34777451494: desktop/tablet/mobile 3 pass; separate sorting in both directions, updating without losing selection, compact desktop cards and a wide touch list. The previous check of 34777297927 revealed a harness error: the coverage counter was stuck to the seconds, fixed in 3f017d1; Application sorting is correct.

It was: the partial match reset the known averages to zero; legacy React snapshot; the first screen of players without statistics; four times in one cell; identical desktop/mobile cards; no live Sports import. Now: known averages with coverage, snapshot update, separate sortable TOI/PP/PK/attack, adaptation of the corresponding football Squad layout, import of 17 players and bank from a linked public profile with ownership/CAS/idempotency and saving the option in case of errors.

Local full check: 1110 pass / 1 skip, lint 0 errors / 115 warnings, typecheck/build pass. Real PostgreSQL import regression pass without skip; after the final capital fix, DB/typecheck was repeated, CI performed full checks on the release commit. In the local browser, the real Sports import saved 17 players, reload saved the roster, the missing binding error did not clear it. On the read-only server, the source matched all 17 IDs/positions, cost 20448, bank 0.

Production audit: web/worker healthy, restarts 0, 48 migrations/pending 0, stats/raw/jobs duplicates 0; raw 29 / 99987 bytes; web 222.1 MiB, worker 1.211 GiB, PostgreSQL 1.012 GiB. The local verification account, its squad, snapshot, sessions and request counter have been deleted; browser is closed. The next user query about indicators, formula and last season is in WI-022.
