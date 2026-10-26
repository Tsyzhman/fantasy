# WI-066: Audit production deployment and project quality

- Kind: `research`
- Canon action: `none`

## Outcome

An evidence-based audit of the running production deployment, resource use, application code and user experience, with prioritized corrections and measurable acceptance targets.

## Specs

- Governing: `spec://common/INFRA-006-continuous-deployment#root`
- Constraint: `spec://common/structure#runtime`
- Constraint: `spec://common/structure#release-transport`
- Constraint: `spec://common/main#root`

## Scope

- In: read-only production inspection through the configured deploy host, release provenance, deploy scripts, database and resource aggregates, cache/duplicate retention, code and UI inspection, bounded checks, and a detailed report.
- Out: application or infrastructure changes, deployment, production data changes, destructive cleanup, messaging users, and production load testing.

## Acceptance

- [x] Record the local and production revisions and distinguish their evidence.
- [x] Inspect the actual runtime, deployment, database, memory, cache, and duplicate processes.
- [x] Review representative API/domain/UI paths and confirm actionable findings against code or observations.
- [x] Consult forum precedents and authoritative technical documentation.
- [x] Deliver a prioritized report with evidence, present behavior, proposed behavior, concrete benefit, verification target, and limitations.
- [x] Recheck production health/resources and account for local audit artifacts at completion.

## Result

Completed 2026-10-10. The Russian user-facing [audit report](../../evidence/WI-066/report.ru.md) contains 24 prioritized findings, remediation proposals, estimated effort, measurable acceptance targets, limitations, and source references.

- Verified live release 0.3.131 / 74a5f00 and normalized source hashes against the existing local working tree; source differences were limited to package metadata/lockfile in the compared set.
- Saved read-only runtime, database, retention, duplicate-job, EXPLAIN, log, monitoring, backup and resource evidence. Production remained on the same revision with basic health 200 and zero restarts; three domain health checks remained 503.
- Reviewed authenticated Home, Sports Squad, FPL, KHL and Franchises, including mobile 390x844. Did not save/import/autopick squads or trigger source updates. Restored viewport and closed the temporary login tab.
- Passed 16 focused existing tests. Reproduced redirect validation and concurrent rate-limit defects locally. Benchmarked the existing quadratic ranking function on synthetic local data; did not load-test production.
- Production dependency audit reported zero known vulnerabilities in the inspected local lockfile. Workflow validation passed.
- Rechecked memory/cache/duplicate processes. No leak was established by the short snapshots. No production mutation, restart, cleanup, deployment, or unrelated working-tree change was performed.
- REVIEW: report and evidence complete; implementation needs targeted contract/regression checks. TECHDEBT: F01-F24 are proposals in this report, not changes to accepted canonical contracts or duplicate entries in TECHDEBT.md.

Evidence directory: `specs/work/evidence/WI-066/`. No canon changes, so no specification changelog or WAL checkpoint was required.
