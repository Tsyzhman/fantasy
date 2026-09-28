# WI-018: Basis from the nearest match SorareInside

- Kind: `change`
- Canon action: `new-spec`

## Outcome

In production, the basic checkboxes are automatically updated based on the team’s nearest match in SorareInside every hour in 05 minutes, with stable ID mapping.

## Specs

- Governing: `spec://modules/machete/INFRA-004-sorareinside-starters#root`.
- Affected: `spec://modules/machete/INFRA-004-sorareinside-starters#root`.
- Constraint: product boundaries in `specs/common/main.md`, active deploy in `docs/operations/DEPLOYMENT.md`.

## Scope

- In: API research, constant ID mapping, selection of the nearest match, secure update of the base and cache, CLI, scheduling, checks and production rollout.
- Out: changes to the interface, custom saved squads, publication of account data.

## Acceptance

- [x] The format of the real API and stable identifiers has been confirmed.
- [x] Only the closest future match of each team is selected; the absence of his forecast does not lead to the use of the next match.
- [x] Ambiguous/incomplete mapping does not change the command checkboxes; repeated import does not create duplicates.
- [x] The update is atomic and uses the existing cache update mechanism.
- [x] Tests, necessary project verifications and production dry-run have been completed.
- [x] Running in :05, import result, absence of competing records, memory and artifact limitations were checked on the server.

## Result

Released 0.3.68, commit `ec5d6f20bdf4b26831ebec30d3b6e98053e2c62d`. [Production workflow 34600220468](https://github.com/Tsyzhman/fantasy/actions/runs/34600220468) completed successfully, health and release marker match the commit. `npm run check`: 1107 passed, 1 skipped; lint, typecheck, production build passed. Spec snapshot current, diagnostics are empty.

Server dry-run: 150 READY, 61 UNCHANGED, 8 PLAYERS_UNMAPPED, 5 NO_MATCH_OR_TEAM_MAPPING, 2 incomplete forecast for 5 players. Memory CLI 136 MiB. The second process received locked=false during the first. Snapshot before application: 226 commands / 10036 flags, closed server file.

Startup: 150 APPLIED, 60 UNCHANGED. Verified hourly launch: 2026-09-11 13:05:00.005 UTC (16:05 Moscow time), completed 13:08:21 UTC; 3 APPLIED, 207 UNCHANGED, 9 PLAYERS_UNMAPPED, 5 NO_MATCH_OR_TEAM_MAPPING, 2 SOURCE_ERROR. The next launch is scheduled for 14:05 UTC. Between dry-run and application, Lokomotiv's forecast changed, adding another unmatched player. Incomplete commands are saved.

Checking the production database: 210 lineups with provenance SORAREINSIDE, each with exactly 11 active players and an exact match of checkboxes with the ID from the forecast; 2027 permanent PLAYER maps and 184 TEAM maps, no reverse duplicates. The pool update queue is empty, 33 CURRENT_XI snapshots READY. Web/worker healthy, credential only in worker and private config 0600. Temporary 18 local and 3 server files have been deleted; private rollback snapshot saved. Worker 1.293 GiB (including other background tasks), Docker build cache 661.6 MB; The standard rollback pair is left, there are no temporary audit containers.

Evidence: [dry-run](../../evidence/WI-018/dry-run.json), [real cycles and skips](../../evidence/WI-018/production-runs.json), [database check](../../evidence/WI-018/production-db.json), [release summary](../../evidence/WI-018/production.md), [spec snapshot](../../evidence/WI-018/spec-snapshot.json). Data with a missing/inactive player requires a correction to the original roster or a verified manual ID link; automatic guessing is prohibited by canon.
