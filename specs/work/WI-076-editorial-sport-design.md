# WI-076: Adopt Midnight Scout and Pressbox

- Kind: `change`
- Canon action: `new-spec`

## Outcome

The existing product uses the attached Football Data / Editorial Sport design system, with both themes, persisted density and unchanged analytical workflows, deployed through the continuous production promoter.

## Specs

- Governing: `spec://common/main#root`
- Governing: `spec://common/PROP-002-editorial-sport-design#root`
- Affected: `spec://common/PROP-002-editorial-sport-design#root`
- Constraint: `spec://common/INFRA-006-continuous-deployment#root`
- Constraint: `spec://modules/machete/FEAT-003-squad-player-card#root`

## Scope

- In: replace the prior design reference, semantic tokens, shared surfaces/navigation/tables, theme and density preferences, compact overview, responsive and accessibility verification, immutable release and resource checks.
- Out: invented data/features, scoring changes, data ingestion, unrelated existing working-tree edits.

## Acceptance

- [x] Attached design is the current linked instruction; former Cloudline instructions no longer govern code.
- [x] Both themes use the specified colors and identical geometry; decorative gradients/glass and oversized overview spacing are removed.
- [x] System/light/dark and comfortable/compact preferences persist independently and initialize before paint.
- [ ] Existing routes, filters, planner actions and statistical information remain available.
- [ ] Verify responsive layouts, preference behavior, build, typecheck, lint and tests.
- [ ] Publish an immutable descendant of production, verify exact public revision and retained rollback.
- [ ] Inspect memory, caches and duplicate processes during work and after rollout.

## Result

Implementation and local checks complete; production verification pending. The user attachment is preserved byte-for-byte in docs/design/DESIGN.md. Local full check: 1317 passed, 2 skipped, zero failures; three additional preference behavior tests passed. Lint has existing warnings but no errors; typecheck and build pass. Browser preview verifies actual shared components with synthetic data at eight viewport widths. Production before/during snapshots retain one web/worker and zero Docker build cache.
