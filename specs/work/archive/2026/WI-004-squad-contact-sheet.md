# WI-004 — “Contact sheet” squad card

Kind: change
Canon action: new-spec

## Outcome
Cards on the Squad board use the selected Contact Sheet layout and docs/archive/design/NEW_DESIGN.md colors.

## Specs
- Governing: spec://modules/machete/FEAT-003-squad-player-card#root
- Constraints: specs/common/main.md; docs/archive/design/NEW_DESIGN.md; selected concept 6 in docs/design/drafts/squad-player-card-concepts.html.

## Scope
In: field and bench cards, photos, thematic styles, direct C/delete, checks.
Out: mobile lineup list, forecast calculations, API, publication.

## Acceptance
- [x] The layout of the selected concept maintains the width and standard height of the card.
- [x] Light and dark themes use existing tokens.
- [x] Five predictions, price, club, position, role, three matches and tips saved.
- [x] C and delete work directly; The VC and action menu are missing from the field card; external replacement retained.
- [x] Target tests, static verification and browser verification pass; duplicates, cache and resources were checked.

## Result
Implemented a contact sheet for the field and bench. There was a round avatar, a corner delete, a C/VC and a menu at the coarse pointer; steel large monochrome portrait, name strip, five forecasts and straight C/×. Colors and states use Cloudline; the mobile list remains a separate view.

Checks:
- `npm run check` failed with code 0: 1035 tests pass, 1 skipped; lint 0 errors (5 warnings in existing places), typecheck and production build are successful.
- The browser checked the actual component from the source with test data and design CSS/fonts, without authorization and database. Before/after: same height 137.5625px, same width at viewport 600/1280/1440/1600/1920; The bench was checked separately.
- Light/dark themes without overlays and metrics overflow; Mouse/keyboard changes the multiplier, direct removal works, external replacement selects the player and blocks bottom actions; coarse footer 44px.
- No new cache/localStorage/sessionStorage entries and duplicate IDs. Heap browser fixture ~11.2 MB. The test browser/server was stopped, copies of the source and the collected fixture assets were deleted. The project's shared cache was not cleared.
- Spec snapshot current, diagnostics empty, source working_tree; fingerprint fd6a07bdda22697d47141262e7210ed214611e5d4d3693c7da6b18d0a9d965a0.
- Evidence: output/playwright/squad-contact-sheet/{light.png,dark.png,browser-report.txt,tests.txt,project-check.txt,spec-snapshot.json}.

Publishing failed. Live checking of the page from the database is not included in the result of the browser fixture.
