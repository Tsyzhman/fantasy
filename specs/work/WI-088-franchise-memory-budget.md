# WI-088: Restore bounded franchise refresh on the shared host

- Kind: `fix`
- Canon action: `direct-edit`

## Outcome

Franchise refresh completes with verified output within a measured safe memory budget on the current host.

## Specs

- Governing: `spec://common/INFRA-006-continuous-deployment#heavy-jobs`
- Affected: `spec://modules/franchises/FEAT-005-franchise-analytics#data`
- Governing: `spec://modules/franchises/FEAT-005-franchise-analytics#data`
- Constraint: `spec://modules/franchises/FEAT-005-franchise-analytics#freezes`
- Constraint: `spec://common/INFRA-006-continuous-deployment#root`

## Scope

- In: Read-only profiling, source/computation working-set optimization, safe job limits and freshness verification.
- Out: unrelated work, interface capability removal, unreviewed production mutations.

## Acceptance

- [ ] No guard removal without measurement; bounded memory and preserved host headroom; identical domain results; controlled successful refresh and new snapshot; no duplicate collectors.
- [x] Applicable tests pass and before/after evidence is recorded.

## Dependencies

- Related: WI-084

## Result

Implementation and local verification are ready in the audit worktree. Root retains integration, full CI, immutable release and the controlled real refresh. No production collector, import, data mutation, commit or deployment was performed by this implementation chat.

Before: aggregate retained one wide Python dictionary per selected player, converted the whole list into a DataFrame, then created additional full copies for detailed JSON. Downstream stages loaded all decision feature columns. The launcher required 6 GiB host available memory for a 5 GiB no-swap job. Conflicting repeated board states silently selected the last row.

After: column buffers release one at a time during DataFrame conversion; detail JSON streams one record at a time with atomic replacement. The projected `decisions.pkl` retains every selected player and all enrichment/check/xFO columns; full purchase features and histories remain in `purchases.pkl`. No domain observations, formulas, public fields or UI capabilities were removed. The launcher has a 3.5 GiB hard/no-swap cap with the same 1 GiB host reserve (4.5 GiB preflight), two CPUs, 128 PIDs, immutable worker image, shared source volume and kernel lock. Each Linux stage logs its peak RSS and cgroup counters. Conflicting `active/frozen` for the same board-state key now abort aggregation before outputs/import; agreeing flags with different scores/boards retain all duel history.

Measured locally with Python 3.11.9, numpy 2.2.6, pandas 2.3.3 and scipy 1.15.3 on Windows: 12,000 synthetic observations plus 70,340 feature rows used 1,219,149,824 bytes (1,162.67 MiB) before and 557,649,920 bytes (531.82 MiB) after, a 54.3% reduction. Elapsed time was 14.718 vs 18.672 seconds. The after-only 61,000-observation/905,850-decision aggregate used 1,444,593,664 bytes (1,377.67 MiB = 1.345 GiB) in 84.813 seconds. That larger profile is aggregate only, with four synthetic groups/eight rounds; it is not a full 75-group production calculation or Linux cgroup measurement. Node parent/native allocations, actual import and charged file cache must be verified during root's real run. The 3.5 GiB budget is a conservative proposed production cap with headroom above this fixture and the prior WI-079 import samples, not proof that the full current production workload fits.

The complete small fixture has 192 canonical source squads / 200 membership observations, two leagues, eight rounds, shared/personal memberships, missing lineups and pre-deadline histories. Before/after features, aggregate, enrich, hypotheses and export produced six identical canonical JSON byte hashes after excluding only the top-level generated timestamp. This comparison preserves integer/float/boolean encodings. The fixture was rerun after the board-conflict guard. All 34 focused Python tests passed; `git diff --check` passed. CI must install the existing exact Python requirements because the new contract tests import pandas/numpy/scipy; root/WI-087 owns that workflow change.

Read-only production aggregates confirm mixed failed-run artifacts: forms modified October 27, calendar/board states/failed report October 24, published snapshot October 21. The failed report has 60,738 squads, 907,005 decisions, zero duplicate selections/future history, and 411 missing active states, all Championship round 11. There are 1,529 excess repeated board-state keys: 1,363 with agreeing active/frozen flags and 166 with conflicting flags across distinct H2H duels sharing a football round. No duplicate was deleted or relabelled. REVIEW: fresh acquisition must be validated; if the conflict persists, the new fail-closed guard preserves the previous snapshot and the repeated-duel rule requires explicit canonical review. Old cached calculation outputs must not be imported as recovery.

Production acceptance remains open: root must deploy, run exactly one normal fresh sync under whole-cgroup/host monitoring, verify the new database/UI snapshot and histories, and record zero OOM/restarts/duplicate collectors with preserved host reserve. The executable boundary and exact stop/success conditions are in [RUNBOOK.md](evidence/WI-088/RUNBOOK.md); [monitor-readonly.py](evidence/WI-088/monitor-readonly.py) performs no mutation.

Production trial, 2026-11-04: exact 0.3.149/269980b was deployed and the canonical entry ran once from 11:42 to 12:27 UTC. It completed 68,368 indexed source squads and current database exports, then acquisition failed in `freezes.py -> fixture_round` with `Conflicting board fixture identity`. Features/aggregate/enrich/hypotheses/export/import did not run. Acquisition Linux peak RSS was 333,357,056 bytes; the five-second sampled cgroup maximum was 1,445,416,960 bytes (kernel memory.peak is unavailable), minimum sampled host available memory 5,465,972,736 bytes, OOM/max events and protected-container restarts zero. This is acquisition evidence only, not proof that full production aggregation fits. The 12:10 UTC timer overlap produced no second collector.

The previous October 21 database snapshot remains byte-identical: SHA a59ecee27820d092cf769c8ebd07fc5a71b2486b234715926210730552e096ab, 54,639 observations. Job/environment file/collection markers are gone; the kernel lock inode remains. Source audit: no duplicate index/squad/active-player/round keys or stale mutable squads; 15,825 sources fetched during this run and 307 explicit missing lineups. Twelve Sports fixture IDs occur across multiple calendar rounds and require source diagnosis. Four old intermediate pickles and 8,551 HTTP cache entries older than 30 days remain because successful-run cleanup did not execute. The old validation.json is not evidence of this failed run. Evidence: production-run-summary.json, failed-run-preservation.json, source-audit-after-failure.json, overlap-timer.json. Publication acceptance stays open; root is diagnosing the exact cached board/fixture conflict without changing guards or importing old artifacts.

Root integrated the reviewed 3.5 GiB / 4.5 GiB budget into INFRA-006, FEAT-005 and the deployment guide, keeping the 1 GiB host reserve and common lock. Structure ownership was also reconciled.

Follow-up diagnosis: source identity conflict is reproducible from fresh cached responses for La Liga board team_match_data/520404, franchise 563. Eleven Sports IDs belong to both round 9 and round 10 in the source schedules; a single-value map overwrites round 9, although title date uniquely selects it. The implementation chat is correcting candidate-set resolution with strict ambiguity rejection and per-source board isolation. No failed snapshot was imported. This correction is not part of serving 0.3.149 and requires separate validation/promotion.

Root cleanup at 12:38 UTC, after preserving source evidence, removed exactly the five inventoried October 24 reproducible intermediates (1,043,442,744 bytes) and 8,551 expired HTTP cache entries (72,361,490 bytes) under the common exclusive lock. Follow-up verification found zero intermediates/expired/temp cache entries, 68,368 unchanged unique source keys and unchanged published-file SHA. The kernel lock inode was retained. See cache-cleanup-inventory.json, cleanup-reproducible-cache.py, cache-cleanup-result.json and cache-cleanup-verification.json. This supersedes the earlier post-failure inventory; it does not make the refresh successful.

Cache/process control: no profile process remains, no global dependency/build cache was changed, and no production data/cache was deleted. Recursive removal of the task-only `.tmp/wi088-fixture-run1` directory (1,158,012,946 bytes of synthetic data) was rejected twice by automatic execution policy with `blocked by policy`; cleanup stopped. Temporary fixture environments are inventoried in the evidence and remain local/ignored. No TECHDEBT file was changed.

Evidence: [profile and strict hashes](evidence/WI-088/fixture-profile.json), [final full small-fixture rerun](evidence/WI-088/fixture-profile-final.json), [tests](evidence/WI-088/python-tests.txt), [production baseline aggregates](evidence/WI-088/production-aggregates-before.json), [gap/duplicate classification](evidence/WI-088/missing-state-before.json), [public board identity aggregates](evidence/WI-088/board-identities-before.json).

