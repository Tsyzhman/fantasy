# WI-080: Restore production lineup updates

- Kind: `fix`
- Canon action: `direct-edit`

## Outcome

Production starting-lineup refreshes consume the current authorized source safely and publish verified teams again; deployment preserves the working runtime and bounded configuration.

## Specs

- Governing: `spec://modules/machete/INFRA-004-sorareinside-starters#source`
- Governing: `spec://modules/machete/INFRA-004-sorareinside-starters#errors`
- Governing: `spec://common/INFRA-006-continuous-deployment#runtime`
- Constraint: `spec://modules/machete/FEAT-001-global-ranking-strategy#contracts`

## Scope

- In: reproduce the production source/schema failure, repair its demonstrated cause, preserve forecast metadata through ordinary roster imports, inspect related source/runtime failures, prevent repeated deployment environment duplication, update the runtime dependency rejected by the mandatory audit, validate and deploy the exact immutable correction, refresh and verify source-backed starting flags and published player pools.
- Out: invented lineups/identities, saved user-squad changes, unrelated design or press-conference work, changes to other hosted applications.

## Acceptance

- [x] Capture the failing production revision, source response discrepancy, affected data freshness and resource baseline.
- [x] Reproduce the defect in a focused regression and preserve invalid/incomplete-source safeguards.
- [x] Correct the confirmed source/deployment defects and pass applicable checks.
- [x] A real database regression confirms repeated roster imports preserve the applied XI and its protection metadata while refreshing club display metadata.
- [x] The required dependency audit and full CI checks pass on the patched Next.js runtime; original action identities and old static assets remain available after promotion.
- [x] Promote an exact checked release with the canonical continuous deployment; preserve availability and verify web/worker/public revision agreement.
- [x] Run a real lineup refresh and verify applied/unchanged/skipped counts honestly, including current published pool readers.
- [x] Verify bounded cache/configuration, duplicate rows/processes, memory/OOM/restarts and temporary cleanup after recovery.

## Result

Completed 2026-10-23 on production 0.3.145, exact commit `32fcc3d109cac657f48f7834c892abd04e42c4ae`, tree `d3f7c6eb3e01fa9d24b00da7236f2358ed3e6970`. The scheduled-lineups projection omitted four club-country fields and aborted every global import before team processing. Exact same-cycle UUID/name/slug/type hydration restores parsing without weakening schedule or XI safeguards. Ordinary roster imports now atomically merge metadata and cannot replace forecast provenance. Inherited environment entries decrease from 314/469 to 86/89 for web/worker, with zero duplicate keys. The mandatory audit exposed an unpatched Next.js runtime; 16.4.2 and a Linux-complete frozen lockfile pass the audit.

The first live cycle applied 135 team/competition XIs and confirmed 92 unchanged. The following :05 cycle confirmed all 227 unchanged, with no duplicate updates. Both cycles honestly remain PARTIAL: 24 scopes have no next-match/team mapping, nine have unresolved/conflicting player identities, and two source XIs fail the eleven-player/goalkeeper contract. These teams retain prior flags. The real authenticated reader confirms all 12 Sports scopes, 8,458 published players, 7,374 comparable roster flags, matching source revisions and zero provenance/pool/API discrepancies. The refresh queue is empty. All 149 saved squads and 2,222 selections retain their exact before/after hashes.

Full Check `39939922888` passed 1,332 unit and 32 database tests, dependency audit, migration drift, lint/typecheck/build, 14 rollout tests and ancillary runtime checks. The PostgreSQL regression verifies roster/XI preservation; an additional bounded server transaction verified the same method and rolled back to the identical original row. All ten existing action IDs remain in the actual artifact, and the prior CSS asset retains its hash. Sixty-seven public observations across promotion and 600 preparation observations contain no failures. Caddy PID remains 754; web, worker, public health and the current-release manifest agree, with zero restarts/OOM and one scheduler worker.

Deploy workflow `39939918757` built and published the verified immutable image artifact, then was cancelled during an exceptionally slow SCP transfer before promoter startup. The identical GitHub artifact was downloaded with digest verification, transported over the configured local SSH connection, and promoted using the exact committed `scripts/deploy-production-docker.sh` with all ten verified arguments. Its exit status is zero; no image was built on production. Two releases and three READY revisions per scope remain. Price/pool/orphan duplicates and failed migrations are zero. Temporary transport files/containers are absent; 1,769,324,901 bytes of task-local artifacts were removed without traversing the shared dependency junction. Settled web/worker memory is about 145 MiB/1.72 GiB; this short window establishes no leak claim.

REVIEW: the 35 explicit source/identity coverage gaps and existing price/data-quality health failures remain visible; they are not converted into complete coverage or guessed identities. Evidence: [report](../../evidence/WI-080/report.ru.md), [verification](../../evidence/WI-080/verification.json), [release receipt](../../evidence/WI-080/release-receipt.json), [real readers](../../evidence/WI-080/published-readers.json).
