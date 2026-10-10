---
status: active
---

# PROP-002: Football Data / Editorial Sport {#root}

## In simple words {#plain-language}

Fantasy Scout presents football data in two equally functional themes: Midnight Scout and Pressbox. The user-supplied [design instruction](../../docs/design/DESIGN.md) is the canonical visual reference, replacing Isty Cloudline.

## Goal {#goal}

Present comparable statistics with low visual noise and equal light/dark functionality.

## Scope {#scope}

Shared product presentation and browser preferences. Domain calculations and provider data retain their existing ownership.

## Boundaries and invariants {#contracts}

- Apply the supplied semantic colors, Onest typography, 6–12px component corners, opaque surfaces and restrained hierarchy across existing product routes. Preserve every real workflow, metric, filter and action; illustrative screens and values do not create new product capabilities.
- Theme changes only presentation, never geometry, data or sorting. Team/series and FDR semantics remain distinct from the brand accent. Charts retain labels and existing statistical scales.
- Tables remain horizontally scrollable where needed, with visible sorting/focus and tabular numbers. Comfortable rows are 48px and compact rows 40px; coarse-pointer interactive targets remain at least 44px.
- Shared navigation keeps 5–7 primary destinations; secondary tools remain accessible in a labeled disclosure. No decorative glass, cloud gradients, floating card shadows or oversized dashboard hero.

## Preferences {#preferences}

Persist `fantasy-theme` as `light`, `dark` or `system`; absent/invalid values follow the OS. Explicit system mode follows OS changes. Persist `fantasy-density` independently as `comfortable` or `compact`. Initialize both before paint. Storage unavailable must not prevent interaction. Cross-tab updates and listener cleanup are required.

## Related contracts {#relationships}

- `spec://common/main#root`
- `spec://modules/machete/FEAT-003-squad-player-card#root` preserves the selected contact-sheet layout and direct actions.
- `spec://common/INFRA-006-continuous-deployment#root` governs publication.

## Readiness checklist {#checklist}

Verify palette and theme geometry, saved/system preferences, density, responsive widths from 320 to 1920px, keyboard controls, reduced motion and representative existing analytical routes. No fake data or dead controls.

## Change history {#changelog}

- 2026-10-10: Adopted the attached Midnight Scout / Pressbox instruction at the user's request.
