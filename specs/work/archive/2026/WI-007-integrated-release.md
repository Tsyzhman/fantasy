# WI-007: Consolidated release of local changes 7 September

- Kind: `migration`
- Canon action: `direct-edit`

## Outcome
An overall clean Git release keeps today's local changes and current production running safely on the server.

## Specs
- Governing: `spec://modules/betting/FEAT-001-virtual-league#root`.
- Governing: `spec://modules/khl/INFRA-002-khl-storage-and-api#root`.
- Constraint: docs/operations/DEPLOYMENT.md, docs/operations/PRODUCTION_RELEASES.md; existing FEAT Machete 001–004.

## Scope
- In: Git consolidation, conflicts, migration compatibility, checks, immutable release, backup/rehearsal/canary, health and resources.
- Out: purchasing feeds, including unconfirmed KHL sources, changing product rules.

## Acceptance
- [x] All local original changes saved; temporary credentials are not included.
- [x] Release contains origin/main and a valid production commit.
- [x] Joint scheme, tests/lint/typecheck/build pass.
- [x] Backup, rehearsal and production revision/health confirmed.
- [x] User routes, duplicates, caches and memory have been checked.

## Result
Completed. Initial production d9abf51 (0.3.57); local changes are saved in codex/local-september7-snapshot, KHL in codex/khl-local-complete-20260907. Integration codex/integrated-release-20260907.

Predeploy: npm run check — 1069 pass/1 skip, 0 fail; lint 0 errors/101 warnings; typecheck and production build pass. 46 migrations on the new local database, there is no schema drift; KHL storage/data-layer and betting wallet DB checks pass. KHL browser 9 pass/16 scoped skips, retained JS data +260 bytes, DOM/listeners stable; the full JIT-inclusive heap +10.89% is written separately. Checked the absence of credential in the original diff and saved all new football runtime files from the local snapshot.


Production has been successfully updated to 0.3.58, a23d3a00b413c5e3020435c0193f79e1c9bfb2d0, release 20260907T102720Z-v0.3.58-a23d3a0. Workflow 34111055172 success; manifest, external health and OCI labels web/worker are the same. Backup /var/backups/fantasy-scout/pre-20260907T102720Z-v0.3.58-a23d3a0-migration.dump, 61 645 350 bytes, SHA-256 347dbea30661464594c415b8f5e27e08c01320f13568ae0e524178766c095ef8. Restore/rehearsal, 46 migrations and canary have passed. During the migration stage, the web/worker was stopped by the full-time promoter; Continuous measurement of precise downtime was not performed.

Final local check and Linux check: 1069 pass, 1 skip; lint 0 errors/101 warnings, typecheck/build pass. Football browser after saving the stable accessible button name Import Sports squad: 3 pass/1 skip; its detailed title is saved. Production browser workflow 34112100695: authentication 1 pass, UI 4 pass/17 provided skips (including disabled production KHL tests).

Users/squads/accounts after migrations: 30/140/33, coincide with predeploy. Ledger mismatch, initial grants duplicates and ticket duplicates: 0. KHL production contests: 0, flags remain disabled, XG-01 and the former WI-001 are not declared completed by this release.

Server after smoke: web 665.8 MiB, worker 2.147 GiB, PostgreSQL 1.372 GiB; healthy/restarts=0 for web and worker. Build cache after regular cleaning 351.1 MB; the old extra release was deleted, the current one and one rollback were saved. Canary, setup image and rehearsal DB have been removed. In the local test circuit raw=52 bytes, read cache=0, duplicate groups=0, all 4 jobs DONE, deleted 2 expired previews; synthetic browser session revoked, Next/PostgreSQL stopped. Historical ignored heap/cache files, the deletion of which was previously blocked by automatic checking, are saved; no bypass was performed.

Git: full local snapshot b56901e, KHL snapshot 68ee522, shared source a23d3a0. The main folder Documents/fantasy_export was switched to main after accurately checking the correspondence of the source files with the saved snapshot; no user changes are reset. Dependencies were installed via npm ci, Prisma Client was rebuilt. The follow-up commit contains only this result and evidence; runtime source remains a23d3a0.
