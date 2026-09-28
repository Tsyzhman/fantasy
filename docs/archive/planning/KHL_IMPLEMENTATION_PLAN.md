# Implementation plan for a separate Fantasy KHL

> The package below retains the original plan. The actual status of the new implementation task is: [KHL_IMPLEMENTATION_STATUS.md](../../guides/KHL_IMPLEMENTATION_STATUS.md). The full module has not yet been completed.

Date: 2026-09-07. **Specifications prepared; application, migrations, import and deployment are not implemented.** The user requested this package of documents. The actual start of development and any release is a subsequent task.

Packet entry: [map](../../../specs/SPEC-MAP.md), [code boundaries](../../../specs/common/structure.md), [check sources](../../research/KHL_SOURCE_EVIDENCE_2026-09-07.md).

## How it was → how it should be

| Was in the tested code | Will be according to these specifications |
|---|---|
| FPL - separate URL and mode of the general football Squad | KHL - separate item, screen, DTO, rules/scoring/projection/optimizer |
| 15 players, starting 11, bench, captain, GK/DEF/MID/FWD | 17 active, G/D/F=2/6/9, without bench/captain, new site, cards, tables and comparison |
| Football Core* ID/FK, minutes/per90 | Isolated Khl* ID/FK, exact TOI/PP/PK in seconds, hockey status and matches |
| Fonbet odds - football pairs and the latest snapshot | Hockey market dictionary, regulation/OT/SO scopes, history of changes and withdrawals of lines |
| xG is in the study as a metric available in the KHL | Ready xG supplier - a separate mandatory access and coverage gate; own model is not being developed |
| Football rounds/pictures and transfers | Official weeks/exceptions, instant scenarios, individual locks and balance check 5 transfers |

## Stages and dependencies

Order defines logical dependencies. Work on the UI on fixtures can be done after fixing the DTO, but this does not close the gates of real sources. Calendar dates are not promised until access to xG/protocols is verified.

| Stage | Specific result | Depends on | Gate output |
|---|---|---|---|
| 0. Check the database and sources | Comparison of the current integration head with d25913c; season/contest/week mapping; allowed source of statistics; agreement/verification of finished xG; hockey Fonbet dictionary; official score fixture set | No | DEP-BASE, DEP-WEEK, DEP-SCORE, DEP-ODDS verified; XG-01 and DEP-STATS have a real proven delivery path, not a publication. No supply - these parts remain blocked |
| 1. Isolation of schema and contracts | Khl* models, validators/DTO, flags off, migrations and test fixtures | 0: schema of sources/IDs | DB-01/02, MIG-01; football before/after is identical, application rollback is safe |
| 2. Catalog and calendar | Sports.ru hockey adapter; mobile fixtures pagination; provider maps; explicit weeks revisions/quality/health/jobs | 1 and verified sources | ING-01/02/04, RULE-01/02/03; all selected players mapped, no ID/sport mixing |
| 3. Detailed statistics and FP | Protocol/licensed adapter, TOI/PP/PK, goalie SV/GA, injuries, official FP; scoring reconciliation | 2, DEP-STATS/SCORE | ING-03/05, RULE-04; threshold uncertainties are allowed or feature is explicitly provisional |
| 4. Ready xG and Fonbet | xG adapter, definitions/coverage/version/history, hockey markets/matching/snapshots/status | 2–3, DEP-XG/ODDS | XG-01, ODD-00…05; allowed regular access is confirmed, withdrawals are not lost |
| 5. Forecast and solver | Hockey EP, goalie probabilities, TOI/PP, remaining-fixtures horizon, constrained 17-player/transfer solve | 3–4 | MOD-01/02/03, OPT-01/02/03; checking small sets by brute force, bounded runtime |
| 6. New Squad and API | Platform/lists 17, G/D/F cards, table/filter/compare, preferences, local drafts, external baseline read-only, preview/CAS/idempotency | DTO after 1; data 2–5; DEP-TEAM for verified baseline | UI-01…06, API-01…03, RULE-05; invalid and stale operations rejected by server |
| 7. Model check and pilot | Rolling-origin + ablation, 2 weeks shadow, 14 days ingestion soak, load/regression measurements | 2–6 | MOD-04, ING-06, memory/queue/cache limits and football without regressions |
| 8. Subsequent inclusion | Separate release task: backup, migration, limited backfill, flags for the pilot, observation and rollback plan | All mandatory gates, release decision | The module is declared available only after verification; here this step is not performed |

## Checking rules and sources at stage 0

Collect impersonal allowed fixtures: regular match, OT, SO, dry match, goalie substitution, empty net, odd SV, exactly 10:00/40:00 if there is a sample, player in the squad without TOI, missing PP, transfer, early week 1 with the end of 14 September. For the impossible to find edge-case, do not invent fixture as an official fact: it remains an open question of local scoring.

The catalog and base calendar are confirmed, but do not equal the readiness of the entire pipeline. Future start_fives, full links and stable xG uploads are missing from verified sources. For the latter, you need a provider gate, not a UI promise. Calls/emails to suppliers are not sent in the current task.

## Migration sequence

1. Get the current schema baseline and staging copy. Check new FPL/provider models added after the current worktree. When integrating, add KHL lines to the existing SPEC-MAP/structure without replacing their entire contents.
2. Only additive Khl* schema, your own PK/FK/indexes and settings. Check migration to an empty and populated database. No changes to Core* PK, old squad defaults, football enum/allowlist and existing provider ID mapping.
3. Idempotent seed competition/season/rules; current/history backfill limited batches. Source and nullability are preserved, users do not receive artificial compounds.
4. Publish only complete read-model revision. After switching to a new version of parser/model, the old one remains for comparison and rollback, within the framework of retention.
5. Remove control football counts/aggregates on one snapshot before and after. Fixed user records must match byte/hash-wise on the selected fields. Do not compare the live database at different times and consider natural updates a regression.
6. Rollback: turn off KHL flags, stop new jobs, complete/cancel current ones, return the application. Tables/history is not DROP. Football workers continue the same regime; KHL resource quotas do not displace them.

## Through acceptance

| Area | Mandatory examples | Contract reference |
|---|---|---|
| Rules | 2/6/9, cap 3, 20 000 initial and revalued capital, 5/6 transfer, week 1, goalie scoring | [FEAT-001](../../../specs/modules/khl/FEAT-001-khl-module-and-rules.md) |
| Data | Reimport/retry/correction, collision ID, incomplete page, null PP/SV, all clubs, ready xG gate | [INFRA-001](../../../specs/modules/khl/INFRA-001-khl-data-ingestion.md) |
| Storage/API | CAS race, idempotency retry, A→B→A value history, alien squad, stale quote, sport mismatch, app rollback | [INFRA-002](../../../specs/modules/khl/INFRA-002-khl-storage-and-api.md) |
| Odds | Regulation vs OT/SO, line/period uniqueness, aliases/transfer, tombstone vs timeout, no leakage | [INFRA-003](../../../specs/modules/khl/INFRA-003-khl-fonbet-odds.md) |
| Squad | 17 without bench, responsive/keyboarding, G/D/F presets, keep vs lock, remaining games, compare/null | [FEAT-002](../../../specs/modules/khl/FEAT-002-khl-squad.md) |
| Projection/solve | Conditional goalie, E[floor(SV/2)], PP exposure, deterministic result, brute-force oracle, cancellation, leakage audit | [FEAT-003](../../../specs/modules/khl/FEAT-003-khl-projections-and-optimizer.md) |

A full xG release is not considered ready in the absence of XG-01. Read-only catalog or beta baseline can be separately accepted only with a strictly specified limited volume; this does not cover the original requirement of a ready-made xG and complete hockey module.

## No football regressions

When implementing, run existing checks rather than rewrite expected values for new code:

- `src/server/fpl-provider-contract.test.ts`, `src/lib/providers/fpl.test.ts`, `fpl-scoring.test.ts`, `src/app/machete/fpl/squad/page.contract.test.ts` - FPL rules/route/sources.
- `src/machete/squad_logic.test.ts`, `squad_planner.test.ts`, `squad-table-columns.test.ts`, history/filter tests, `src/components/machete/fantasy-squad-worker-handler.test.ts` - football 15/11/4, captain/bench, saved squads and settings.
- `src/providers/fonbet/odds.test.ts`, `src/machete/fixture-odds-sync.test.ts`, `src/server/fixture-odds-scheduler.test.ts` — football odds are unchanged.
- `src/core_data/ingestion.test.ts`, `ingestion-jobs.test.ts`, `src/machete/sports_ru_squad_import.test.ts`, `sports_ru_squad_snapshots.test.ts` — football import/read-only profile.
- `e2e/squad-journey.spec.ts`, `e2e/squad-responsive.spec.ts` - previous routes and responsive. Add separate KHL e2e, do not change football journey to hockey.

At the code stage, the final commands after the last edit are: `npm run test`, relevant `npm run test:db` with staging/test database, `npm run lint`, `npm run typecheck`, `npm run build`, `npm run test:e2e`; drift check via `npm run prisma:migrate:diff` in a safe environment. Next typegen/build execute sequentially due to `.next`. Add KHL tests by acceptance ID, running schema migrations, read-model/API contracts and resource scripts. In the current document task, these application commands are not required and were not executed.

## Resources, cache and duplicates at each stage

After 1–2: uniqueness/FK, duplicate job lease, counts after repeated batch. After 3–4: raw size, retention, unambiguous provider mappings, sequence history A→B→A, no doubling of DOM events. After 5–6: solver timeout/abort, one worker, bounded pool, separate cache keys for sport and user. After 7: 14 days soak, queue depth, 50 UI transitions/rebounds, heap/RSS plateau, football latency before/after under comparable load.

Starting numerical budgets are specified in INFRA-001 and FEAT-002. Any excess is recorded as a failed acceptance and is not hidden by clearing user/football data. In this document task, the source cache was not created, dependencies were not installed, and application processes were not started.

## Result of the current task

Prepared 6 FEAT/INFRA subject specifications, map and technical boundaries, source verification and this plan. All new specs have `status: draft`: this is a well-developed proposal with implementation criteria, and not a mark of a ready-made working module. Real unclosed dependencies are listed in evidence; subsequent development and release depend on them.
