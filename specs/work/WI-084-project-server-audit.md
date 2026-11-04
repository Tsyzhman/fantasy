# WI-084: Audit current production and coordinate verified remediation

- Kind: `research`
- Canon action: `none`

## Outcome

An evidence-based audit of the current production revision, a prioritized remediation plan, supervised Sol 6.1 Max implementation chats, and a verified continuous release with bounded cleanup.

## Specs

- Governing: `spec://common/INFRA-006-continuous-deployment#root`
- Constraint: `spec://common/main#root`
- Constraint: `spec://common/PROP-002-editorial-sport-design#root`
- Constraint: `spec://common/structure#release-transport`

## Scope

- In: current source, production runtime/database/resource aggregates, security, data freshness, representative UI/layout/accessibility, dependency and test checks; separate tracked fixes; release supervision and project-scoped cleanup.
- Out: unrelated dirty working trees, destructive data repair, removal of user capabilities, external messaging, unconfigured paid services, other hosted applications.

## Acceptance

- [x] Record verified production/source provenance and initial resources.
- [x] Revalidate previous audit findings against the actual running source.
- [x] Publish prioritized findings and a concrete implementation/verification plan.
- [x] Supervise requested Sol 6.1 Max chats and review their changes.
- [x] Run applicable automated and visual checks and record limitations.
- [x] Verify exact production release, uninterrupted traffic, rollback and resource/duplicate/cleanup outcomes.

## Result

Starting production was 0.3.147 / e765ab45f9d82540c19d66b6d3a3d0888a739706. The separately authorized 0.3.148/Sorare release was incorporated. The original C:/Users/Nik/Documents/fantasy_export checkout is stale and dirty and remains untouched; implementation uses the isolated codex/project-audit-20261104 checkout.

Audit evidence and the prioritized before/after plan are in [PLAN.md](evidence/WI-084/PLAN.md) and [report.ru.md](evidence/WI-084/report.ru.md). Four requested Sol 6.1 Max chats implemented Telegram correctness, keyboard/dialog fixes, runtime/release hardening and bounded franchise computation; root reviewed and returned concrete regressions for correction. The user's mobile sorting addition was completed as WI-089; failed artifact delivery was repaired as WI-090. WI-085/086/087/089/090 have verified production acceptance. WI-088 remains open because fresh acquisition failed a source identity guard before computation/publication; the audit does not label that refresh successful.

0.3.149 / 269980b7bbc8d16c850aad89229423f5a2383346 is deployed through canonical Deploy 41819445507. Exact release/image identity and Node 24.22.2 are verified. Full Linux validation passed (1,374 main tests, database/migration checks, 48 fixture-browser scenarios, Python/transport/release checks, build/types); live Browser Smoke passed authorization plus 28 scenarios. 611 release probes had zero errors; old CSS remained available after promotion. Live mobile sorting works by price/FP in both directions at 320/390px without document overflow or squad mutation. One worker, retained rollback, zero OOM/restarts, project-scoped cleanup and preserved verified backup are recorded in evidence. Original checkout and other hosted applications remain unchanged.

Unresolved findings are explicit: root/password SSH access, shared-host maintenance/reboot, 18 affected development dependency entries (three advisories), Sports identity/forecast gaps, 236 lint warnings, UI terminology consistency and bounded runtime/SQL investigations. No new daily/offsite backup schedule was configured. Local synthetic fixture/PostgreSQL directory removal was rejected by automatic policy and remains incomplete; the task's 882,612,288-byte transport ZIP was removed. Server release cleanup passed; franchise cache cleanup and exact source-conflict diagnosis are recorded separately under WI-088.

