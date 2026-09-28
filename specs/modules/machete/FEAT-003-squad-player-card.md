---
status: active
---

<a name="root"></a>

# FEAT-003: Player card on the Squad {#root} field

<a name="plain-language"></a>

## Plain language {#plain-language}

The card uses the contact-sheet concept selected by the user: a large monochrome portrait, the player name over the photograph, forecasts, fixtures, and two direct actions. Colors come from the Cloudline reference in `docs/archive/design/NEW_DESIGN.md`.

<a name="goal"></a>

## Goal {#goal}
Update the visual without changing the data, calculations, field grid, or external replacement script. Parent documents: specs/common/main.md and docs/archive/design/NEW_DESIGN.md. Visual source: docs/design/drafts/squad-player-card-concepts.html, concept 6.

<a name="scope"></a>

## Scope {#scope}
Base and bench cards in SquadPitch. SquadTouchRoster's standalone mobile roster remains a standalone representation.

<a name="governing-specs"></a>

## Governing specifications {#governing-specs}
Independent UI contract. Restrictions are set by specs/common/main.md and the design system docs/archive/design/NEW_DESIGN.md; FEAT-001/002 controls the strategy, but not the visuals of the card.

<a name="actors"></a>

## Participants and triggers {#actors}
Authorized user editing the base or bench of their lineup.

<a name="scenarios"></a>

## Scenarios {#scenarios}
The user reads the club, position, name, price (with an approximate sign), assigned C/VC role, five forecasts and three upcoming matches. C appoints or removes a captain, × removes a player. There are no VC assignment or menu buttons. VC can appear as a passive role. The replacement is included outside the card; in this mode the card selects the player and the captain/remove buttons are not available. The existing drag-and-drop is retained.

<a name="data"></a>

## Data and state {#data}
Existing FantasyPlannerPlayer and FantasySquadSelection: player details, photo, price, predictions, matches and role in the squad. There are no new storage fields or API requests.

<a name="contracts"></a>

## Contracts {#contracts}
FO1/FO3, FFO, ALT1/ALT3, captain's multiplier, sources and detailed tips are saved; matches retain FDR and home/away designation. A player without data shows “not in the database”. The widths in rem and the standard height of the filled card are preserved; colors for surfaces, text, borders, and actions are specified by semantic CSS tokens in both themes. At the coarse pointer, the bottom actions receive the height of the touch control.

<a name="errors"></a>

## Errors and validation {#errors}
A missing or unloaded photo is replaced with an initial without shifting the grid. The portrait uses an existing URL and lazy loading. The card does not create a new cache, timer, global listener, or portal.

<a name="traceability"></a>

## Implementation traceability {#traceability}
SquadPlayerTile and SquadPlayerPhoto in src/components/machete/FantasySquadPlanner.tsx; styles src/app/globals.css; direct contracts src/components/machete/fantasy-squad-ui.test.ts.

<a name="acceptance"></a>

## Acceptance criteria {#acceptance}
Check the dimensions of the base/bench, both themes, captain, VC, long name, lack of photo and placeholder. Check out direct action, outside replacement, predictions and three matches. Perform targeted tests and static checks; check the browser for overflows, duplicates and lack of new storage/listeners.

<a name="relationships"></a>

## Related specifications {#relationships}
Changing the presentation does not change FEAT-001/002 or the lineup strategy.

<a name="changelog"></a>

## Changelog {#changelog}

- 2026-09-28: English documentation, repaired document references, and GitHub navigation anchors (WI-039).
- 2026-09-07: Accepted user selected "Contact Sheet" with Cloudline Colors, Direct C/Delete and External Replace.
