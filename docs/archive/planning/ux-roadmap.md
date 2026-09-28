# UX Roadmap — what's left after the polish pass

The single-session polish covered:

- Brand design tokens (indigo `brand-*`, `--brand-*` CSS vars, dark-aware), Inter as default font, `num-tabular` for number columns, em-dash null glyph.
- Sticky first column in Machete + Baltika player tables.
- Heat-map score cells with per-tone gradients (xFP/FP/vFP).
- Player hover-card on names (Machete + Baltika).
- Active filter chip-row with one-click removal + reset.
- SVG `LeagueFlag` component (replaces emoji on Windows for top-level league cards).
- Mobile tabs in Squad Planner (Squad/Pool/Tips).
- Captain & vice-captain with `×2` projection on next-round metric.
- Captain & vice-captain are persisted in backend squad selections (`user_fantasy_squad_players`) and old browser-stored choices migrate on next save.
- Drag-and-drop between Squad Planner starting XI lines and bench, using the existing `isStarter` save shape.
- Diff against saved squad (`xFP` delta, player changes, starter changes) with baseline refresh after Save.
- Auto-pick optimal starting XI from the current squad for the selected horizon, respecting locked players.
- Transfer counter in Squad Planner scales with the selected forecast horizon and caps saved squad moves.
- FDR pills on planner tiles and pool fixtures, backed by opponent/side difficulty from existing xG strength profiles.
- MiXerr markers smarter: shape ↔ body part / set-piece, color ↔ outcome (goal/on-target/off/blocked).
- MiXerr real SVG pitch with goal/box markings.
- MiXerr xG-weighted heatmap overlay behind shot markers.
- MiXerr inline top-shooters table under the pitch.
- MiXerr sequence playback controls highlight shots chronologically.
- MiXerr side-by-side mode compares Team A attack and Team B conceded panels.
- Prominent brand-coloured "Swap teams" CTA + window-mismatch warning.
- Russian-only placeholders moved to `LocalizedNumberInput`.
- Terminology unified: xFP / FP / vFP (column headers, hover-card, planner button).
- Aria-labels on planner controls; `aria-live` toast on planner message; skip-link helper class.
- Sortable table headers expose button semantics and keyboard shortcuts; auto-submit exposes an `aria-live` status.
- Auto-submit pending indicator is a real DOM status/toast, not a CSS pseudo-element.
- `LocalizedOption` language store is guarded against non-browser snapshots before mount.
- Dark-theme audit pass for new heat cells, chips, hover-card, FDR pills, and auto-submit toast.
- Semantic `title=` tooltips on shell, compare, and planner actions replaced with ARIA labels, keyboard access, and a mobile squad-action legend.
- Removed dup "Back to" CTA on player explorer headers (breadcrumbs already cover it).
- Player compare mode for Machete/Baltika explorers (2-4 players, dock, side-by-side comparison, winner highlights).
- Single `/players` switchboard with source forwarding to Machete/Baltika explorers.
- Baltika player explorer pagination + row-size controls; both player explorers now keep rendered rows bounded.
- Command-K palette in the shared app header with localized search across core, mode, and admin pages.
- Account-backed saved views and watchlists for Machete/Baltika player explorers, with local fallback/migration for guests and existing browser-stored lists.
- Inner league/team pages use `LeagueFlag` instead of emoji `leagueFlag`.
- Local ESLint warning rule for missed visible JSX translations, plus cleanup of the surfaced planner/mapping/player explorer strings.
- Cross-mode Wyscout xG surfaced in the Machete squad planner pool and tiles when a unique current Baltika player snapshot matches by normalized name.
- Machete player explorer form sparkline is visible on mobile, tablet, and desktop tables.
- Machete player explorer league filter is unique by league id with a separate season selector and season-aware team options.
- Machete league/team pages preserve explicit `?season=` links; league detail has a season selector and team links keep the selected season.
- Machete Squad Planner has separate league/season controls; imports, planner data, and Player Explorer links stay on the selected season.
- MiXerr has separate league/season controls; team rosters and default shot scopes use the selected season while competition checkboxes can still expand scope.
- MiXerr filter state has active chips for explicitly selected league/season/teams/competitions/player/windows, with one-click removal.
- MiXerr and Player Compare have a reusable "Copy link" action for sharing the current URL/query state.
- Logged-in home dashboard shows the latest saved squad, next fixtures, fresh Sports.ru prices, saved-view/watchlist counts, and data freshness using existing tables only.
- Render coverage for new UI primitives (`ScoreHeatCell`, `LeagueFlag`, `PlayerHoverCard`, `ActiveFilterChips`, `FdrPill`/`FdrRow`).

## Backlog — biggest wins still untouched

### Home / shell
- **News / injury-aware dashboard widgets** — team press conferences, lineup leaks, injured starters.

### Cross-cutting
- **FotMob press / injury feed** integration for the hover-card.
