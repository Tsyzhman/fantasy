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
- [ ] Run applicable automated and visual checks and record limitations.
- [ ] Verify exact production release, uninterrupted traffic, rollback and resource/duplicate/cleanup outcomes.

## Result

In progress. Starting production is 0.3.147 / e765ab45f9d82540c19d66b6d3a3d0888a739706. origin/main bebd3aa has the same tree. The original C:/Users/Nik/Documents/fantasy_export checkout is stale and dirty; implementation uses a separate checkout based on origin/main.

Audit evidence and prioritized plan are in `evidence/WI-084/PLAN.md` and `report.ru.md`. Four requested Sol 6.1 Max implementation chats delivered WI-085–088 and concrete review findings were corrected. PR #53 contains the first integrated 0.3.149 candidate. The user added mobile column sorting as WI-089 during CI; deployment 41809561461 was cancelled before packaging/promotion. Production remains 0.3.148 until the revised candidate passes exact-SHA validation. Actual production acceptance and project cleanup remain open.

