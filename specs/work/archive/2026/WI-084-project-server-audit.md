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

The audit, prioritized plan and supervised remediation are complete. Starting production was 0.3.147/e765ab4; the separately authorized Sorare 0.3.148 release was incorporated. Four requested Sol 6.1 Max chats implemented reviewed fixes; root integrated, returned concrete regressions, independently verified, and supervised canonical releases. The original dirty Documents/fantasy_export checkout remains untouched. [Audit report](../../evidence/WI-084/report.ru.md) and [prioritized plan](../../evidence/WI-084/PLAN.md) distinguish completed work from remaining findings.

Production 0.3.152/3e58a9f3 passed Deploy 41855866227 and Check 41855846586: 1,379 main tests, 48 browser scenarios with 32 intentional viewport skips, 50 Python tests, 23 transport regressions, database/migrations, lint/types/build and production dependency audit. Lint retains 237 warnings, zero errors. Exact public/source/image identity and Node 24.22.2 are verified. Mobile sorting by column/direction, native keyboard controls, focus-safe dialog, Telegram current consent/live cutoff/fenced recovery and durable polling are deployed. No real Telegram messages were sent by tests.

The complete 36m37s franchise run now publishes November 4 data, independently verified against file/database/reader and live desktop/mobile UI. One XI per football round is eligible when active in any duel; per-duel freezes and all personal histories remain. There are 68,973 unique historical observations, including explicitly missing lineups, and 42,572 eligible franchise observations. 434 full-cycle HTTP probes succeeded, zero OOM/restarts/duplicate collectors. The release window separately contains one pre-promotion client URLError among 312 probes; zero-error continuous availability is not claimed for that entire window. Export reached the memory boundary and reclaimed memory (max=1313), so TD-010 remains open for growth headroom.

Server cleanup retains current 152 and one rollback 151, one verified database dump and all persistent source/user data. Old project releases/images/containers, 1,115,804,234 bytes of stale franchise intermediates/expired cache, and successful-run intermediates were cleared. Final expired/temporary cache and private job/artifact files are absent; one active worker, healthy web/worker/PostgreSQL, approximately 5.62 GiB available RAM and 42.71 decimal GB disk used. Other host applications were preserved. No daily/offsite backup schedule was added.

Remaining findings: root/password SSH access, shared-host updates/reboot, 18 affected development dependency entries across three advisories, source mapping/forecast gaps, 237 lint warnings, UI terminology/design consistency, runtime/SQL investigations and export growth headroom. These have concrete follow-up acceptance in the plan. Automatic policy rejected local synthetic fixture/test-PostgreSQL directory cleanup and the exact 0.3.150 delivery ZIP deletion; those items remain. Local 151/152 ZIPs are retained without attempted deletion. Server cleanup is independently verified.
