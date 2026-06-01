# Machete Ingestion Optimization Tasks

This document captures the agreed optimization work and the remaining manual
production checks.

## Goals

- Reduce full FotMob backfill size and disk pressure.
- Keep the useful European football scope plus selected national tournaments.
- Stop long-term storage of raw provider payloads.
- Show one league in the UI, with seasons selectable inside that league.

## League Scope

Automatic ingestion should include only the agreed working set.

Keep:

- UEFA club tournaments: Champions League, Europa League, Conference League, UEFA Super Cup.
- National tournaments: World Cup 2026, EURO, Copa America.
- Top European domestic leagues currently in the catalog.
- Top-five second divisions: England Championship, LaLiga2, 2. Bundesliga, Serie B, Ligue 2.
- England League One.
- Domestic cups for the kept European countries, unless explicitly removed later.

Remove from automatic ingestion:

- All non-European domestic leagues and cups.
- South American club tournaments: Copa Libertadores, Copa Sudamericana, Recopa Sudamericana.
- National-team tournaments except World Cup, EURO, and Copa America.
- Ukraine completely.
- Lower European divisions outside the explicit keep list above.

Current expected scale after this cut:

- Enabled leagues: about 43.
- Initial backfill scope policy: latest 2 seasons for domestic leagues; current season only for UEFA club tournaments.
- Initial backfill scopes: about 79 at the May 2026 season boundary.
- Rough disk expectation without raw payload retention: lower than the previous 35-60 GB estimate, depending on actual parsed match volume.

## Raw Payload Retention

Desired behavior:

- Fetch FotMob payload.
- Parse it immediately into normalized tables.
- Calculate derived data and fantasy points.
- Do not persist raw payloads in `raw_match_payloads`.
- Do not persist legacy `MacheteRawPayload` rows for league, team, fixture, or aggregate sync data.

Required follow-up changes:

- Replace current "already processed" checks that depend on final raw payload presence.
- Determine completed matches from normalized rows instead:
  - `matches`
  - `match_team_stats`
  - `match_player_stats`
  - `match_shots`
  - `fantasy_points`
- Keep `reparse-raw` either disabled, documented as unavailable, or replaced with a re-fetch-and-reparse command.
- Add a safe production cleanup command for existing raw payload data.

Suggested cleanup commands after code support exists:

```bash
docker compose --profile setup run --rm db-setup npm run payloads:prune-finalized -- --yes
docker compose --profile setup run --rm db-setup npm run payloads:prune-machete -- --yes
```

## Eurocups Seasons

Desired behavior:

- UEFA club tournaments should ingest only the current season.
- Domestic leagues should ingest only the latest 2 seasons.
- Domestic cups can follow the same policy as their country unless we decide to reduce them too.

UEFA club tournaments in scope:

- Champions League
- Europa League
- Conference League
- UEFA Super Cup

Acceptance criteria:

- In May 2026, UEFA club tournament backfill should target `2025/2026`, not old fixed seasons.
- After summer rollover, it should target the new season automatically.
- World Cup, EURO, and Copa America keep their explicit tournament seasons.

## Season UX

Current problem:

- A league may appear as multiple league-season entries in UI and selectors.
- This makes the app feel like it has duplicate leagues.

Desired model:

- Show one league entity.
- Inside each league, show a season selector.
- Default season should be:
  - current season if marked current;
  - otherwise latest available season.

Affected surfaces:

- `/machete/leagues`
- `/machete/leagues/[leagueId]`
- `/machete/leagues/[leagueId]/teams/[teamId]`
- `/machete/players`
- `/machete/squad`
- `/mixerr`
- Any league/team/competition selectors that currently show `League - Season` as separate options.

Acceptance criteria:

- League cards are unique by league id, not by league-season.
- League detail page supports `?season=YYYY/YYYY`.
- Team detail links preserve selected season.
- Player explorer has separate league and season controls.
- Squad planner has separate league and season controls.
- Mixerr has separate league and season controls.
- Competition checkboxes can still combine multiple competitions when intentionally selected.

## Suggested Task Order

1. Done in code: lock the ingestion league allowlist and add tests.
2. Done in code: add current-season-only policy for UEFA club tournaments.
3. Done in code: stop long-term raw payload retention and use normalized rows for processed-match checks.
4. Done in code: add raw payload cleanup commands and runbook.
5. Done in code: refactor shared read model to expose grouped league options with seasons.
6. Done in code: update UI selectors and links to pass `season` explicitly.

## Manual User Checks After Deploy

These checks require the real server, a fresh deploy, and a full FotMob run, so they are not AI-agent tasks:

1. Verify full backfill status after one production run.
2. Verify production disk usage after that backfill and cleanup.
