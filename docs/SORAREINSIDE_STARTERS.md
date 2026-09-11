# SorareInside starting XI

Contract: `spec://modules/machete/INFRA-004-sorareinside-starters#root`.

The worker runs at :05 every hour and once on startup. It reads gameweeks and
the full fixture schedule first, chooses the nearest future match per club
across all competitions, then reads only that match's published prediction.
If the nearest fixture has no lineup, a later fixture is never substituted.

Only the eleven `starting_players` count; alternates and confidence percentages
do not add extra starters. All eleven must map uniquely into the active roster.
The same club forecast applies to that club's current fantasy league pools,
including its Champions League pool. National-team contests are excluded.

## Operation

```sh
npm run starters:sync-sorareinside -- --json
npm run starters:sync-sorareinside -- --apply --json
# Immutable production image contains the equivalent bundled CLI:
docker exec fantasy-scout-worker node scripts/sync-sorareinside.cjs --json
```

Dry-run is the default. `--apply` writes persistent maps and team flags. A shared
PostgreSQL advisory lock excludes overlapping CLI/scheduler cycles. Current-XI
snapshot refresh requests are committed with flag changes, and deduplicated by
league/season/team. Unchanged flags only refresh source metadata.

Environment: `SORAREINSIDE_SYNC_ENABLED=true`, `SORAREINSIDE_EMAIL`,
`SORAREINSIDE_PASSWORD`. On this production host deploy reads the three keys
from `/home/deploy/.config/fantasy-scout/sorareinside.env` (directory 0700, file
0600), and adds them to the worker only. This config must be in place before
deployment. Setting enabled=false there takes effect with the next worker
deployment. No credential is committed, returned in reports, or copied to web.

## Identity and incomplete coverage

`ProviderEntityMap` stores provider `SORAREINSIDE`, season `GLOBAL`, entity types
`TEAM` and `PLAYER`, source UUID and canonical FotMob ID. This reuses the existing
unique external-identity key; there are no new player rows or database columns.

First binding uses exact club identity (including reviewed explicit aliases),
then exact normalized player name or full slug inside that club. Birth dates
are checked when available from FotMob or mapped fantasy prices. A unique
birthday plus a meaningful matching name token can resolve abbreviated names;
birthday alone never approves a binding. A stored ID
is authoritative and cannot silently fall back to another same-name player.
Unknown or ambiguous players are reported for review, preserving the entire XI.

To resolve a reported UUID, verify the player using club and date of birth,
then insert a MATCHED PLAYER map to the verified FotMob ID (matchedBy=MANUAL).
Never bulk approve fuzzy matches or overwrite an existing mapping to work around
a transfer. The target must belong to the active roster for each affected pool.

Status reports list league, season, team, selected kickoff/match/lineup, unresolved
player UUIDs and reasons. SOURCE_ERROR/APPLY_ERROR/MAPPING_CONFLICT cause the CLI
to exit nonzero; missing coverage is reported as PARTIAL. Provider failures never
mean an empty XI. Worker logs use existing Docker retention. Schedule/lineup
bodies are per-run memory only; the worker reuses only its bounded cookie jar.

Before initial apply, retain a private snapshot of affected `team_player_seasons`
flags and `league_season_teams` source metadata. Disabling sync stops future
writes; rolling back the image does not undo imported flags or ID mappings.
