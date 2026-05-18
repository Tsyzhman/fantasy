# Acceptance Criteria

## Admin league page

- Admin can open a league detail page.
- Page shows a grid of team cards.
- Each team card shows logo/name/status/players count/last upload.
- Each team card has a visible drag & drop zone.
- Dropping a non-xlsx file shows an error.
- Dropping an xlsx file calls the upload API.
- Upload state is visible on the card.

## Wyscout import

- Parser reads the first worksheet.
- Parser detects header row.
- Import fails if required columns are missing.
- Import validates `Team` column against target team.
- Import stores source file metadata.
- Import stores a `TeamImport` record.
- Import creates `PlayerSnapshot` rows.
- Import stores original normalized metrics in `rawMetrics`.
- Import calculates `fantasyScore` and `valueScore`.
- Successful import ends with status `READY`.

## Publishing

- Admin can publish a READY import.
- Published import becomes visible to users.
- Previous published import for the same team is no longer current.
- Normal users cannot see unpublished imports.

## Player explorer

- User can select league.
- User can filter by team.
- User can filter by position group.
- User can filter by minimum minutes.
- User can sort by fantasy score.
- User can sort by value score.
- Table displays player, team, position, age, minutes, goals, xG, assists, xA, fantasy score, value score.

## Non-goals for MVP

- No API-Football import.
- No Wyscout API import.
- No payment system.
- No complex ML prediction.
- No real-time data.
