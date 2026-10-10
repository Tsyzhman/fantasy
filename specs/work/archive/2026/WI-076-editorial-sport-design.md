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
- [x] Existing routes, filters, planner actions and statistical information remain available.
- [x] Verify responsive layouts, preference behavior, build, typecheck, lint and tests.
- [x] Publish an immutable descendant of production, verify exact public revision and retained rollback.
- [x] Inspect memory, caches and duplicate processes during work and after rollout.

## Result

Published version 0.3.138, commit `72b8c78c209611ff20c50160ba6182adac514516`, through successful GitHub run 38064290551 and the canonical continuous promoter. Public health, immutable release manifest and image revision agree. All 133 observed health probes succeeded across the switch. The preceding 0.3.137 release and its browser assets remain available for rollback/old tabs.

The user attachment is preserved byte-for-byte in `docs/design/DESIGN.md`; the former Cloudline instruction points to it. Shared tokens, navigation, preferences, overview, Arena, Franchises and KHL presentation adopt Midnight Scout / Pressbox while preserving domain behavior.

Local full check: 1317 passed, 2 skipped, zero failures; three additional preference behavior tests passed. Final lint has existing warnings but no errors; typecheck and production build pass. Linux release CI and continuous deployment/rollback verification also pass with no test failures or skips (the exact CI total is masked in the GitHub log). Workflow validation passes and the spec snapshot is current with no diagnostics.

Authenticated production browser verification covered home, Sports squad, player league filtering (540 rows), FPL, KHL, Franchises and Arena. All 12 previous navigation routes remain. Home has no horizontal page overflow at eight widths from 320 to 1920px; KHL/FPL also pass at 390px. Both themes and independent density persist on reload/navigation; keyboard Escape from mobile navigation restores Menu focus. Comfortable player rows measure 48px; compact tables use a 40px minimum and retain multiline content. No browser errors were recorded. No domain write actions were submitted.

Resource checks found one running web and one worker, no new-runtime restarts/OOM, zero host Docker build cache and two retained releases. During the pre-existing scheduled franchise collection on 0.3.137, Python exceeded the shared worker memory limit; the prior published snapshot was preserved. This separate unresolved issue is recorded as TD-010, with evidence in `specs/work/evidence/WI-076/production-verification.json`. Temporary local preview/monitor processes finished. Automatic approval policy rejected removal of the verified local `.next` and `.tmp` directories (including an exact-path retry); these generated files remain on disk. No alternative deletion mechanism was used.
