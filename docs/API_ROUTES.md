# Internal API Routes

The app uses Next.js route handlers under `src/app/api`.

## Health

### `GET /api/health`

Returns database configuration and connectivity status for deployment checks.
When `DATABASE_URL` is missing it returns `503 DATABASE_NOT_CONFIGURED`.

### `POST /api/client-errors`

Public, write-only collection endpoint for critical browser failures. It accepts
only `{ "kind": "WINDOW_ERROR|UNHANDLED_REJECTION|REACT_ERROR_BOUNDARY",
"routeGroup": "root|login|setup|machete|admin|beta-test|other" }` and returns
`202` without an event identifier. Unknown or additional fields are rejected;
the 256-byte request limit and 100-event global minute limit bound ingestion.
The request deliberately contains no error message, stack, query string, user,
session, IP or user-agent field. The server does not persist request headers.
Each accepted write removes minute buckets older than 30 days, so the anonymous
aggregate does not become an indefinite activity history.

### `GET /api/health/client-errors`

Public aggregate over the recent critical-client-error window (60 minutes by
default, configurable from 5 to 1,440 with
`CLIENT_CRITICAL_ERROR_WINDOW_MINUTES`). It returns `200` only when the window
contains zero events, and otherwise returns `503`. The response exposes only the
total, counts by coarse kind and minute-coarsened latest occurrence; it never
returns a message, stack, detailed URL or browser/user identity.

### `GET /api/health/fantasy-prices`

Public freshness/completeness monitor for configured Sports.ru fantasy price
scopes. It returns `200` only when every scope has a recent snapshot, at least
the configured minimum player count, and the configured player-mapping
percentage. Missing, stale, sparse, weakly mapped, invalidly configured, or
unqueryable data returns `503`. Defaults are 7 hours, 100 players, and 98%.

## Auth

### `POST /api/auth/logout`

Clears the current session cookie. This route is public so it can run even when
`DATABASE_URL` is not configured.

## Moderated Beta Telemetry

### `POST /api/beta/telemetry`

Accepts opt-in telemetry only for a signed-in user after `/beta-test` starts a
run. The bounded JSON body is a `start` command with a client UUID, device class,
viewport width and permanent `synthetic` flag, one allowlisted `observe`
command, or an idempotent `finish` command. `finish` records server time in
`submittedAt`; the endpoint rejects all later observations for a submitted or
reviewed run. Observations are limited to journey milestones, pathname-only
page views, named Web Vitals and coarse client-error categories. Arbitrary event
names, query strings, fragments, text values, invalid JSON, and bodies over
4 KiB are rejected.

The endpoint permits at most 20 runs per account per rolling 24 hours and 250
unique observations per run. Finish and observation mutations are serialized
per run so a racing late observation cannot change a finalized result. A user
can write only to their own run. Responses
are `Cache-Control: private, no-store`. There is no public report endpoint;
moderator review and aggregate reporting use the server-side
`npm run beta:user-test` command so account identifiers never enter report JSON.

## Admin

All admin routes require a signed-in admin user.

### `POST /api/admin/teams/:teamId/upload`

Imports one Wyscout player workbook for a Baltika team.

Request:

- multipart form data;
- `file`: `.xlsx` workbook;
- `seasonId`: target Baltika season id.

Invalid or non-form request bodies return `400 BAD_REQUEST`. Oversized workbook
requests are rejected before workbook bytes are parsed.

### `POST /api/admin/imports/:importId/publish`

Publishes a ready Wyscout team import.

### Ingestion

- `GET /api/admin/ingestion/status`
- `POST /api/admin/ingestion/initial-backfill/start`
- `POST /api/admin/ingestion/incremental-update/start`
- `POST /api/admin/ingestion/cancel`

The initial-backfill start body is optional JSON:

```ts
{
  mode?: "full" | "current_league_47";
}
```

## Baltika

All Baltika write routes require a signed-in admin user.

### `POST /api/baltika/fixtures`

Creates a manual fixture.

JSON body:

```ts
{
  leagueId: string;
  seasonId: string;
  homeTeamId?: string | null;
  awayTeamId?: string | null;
  homeTeamName?: string;
  awayTeamName?: string;
  roundNumber?: number | string | null;
  kickoffAt?: string | null;
}
```

### `PATCH /api/baltika/fixtures/:fixtureId`

Updates a manual fixture. The body must be a JSON object; invalid JSON or
non-object JSON returns `400 INVALID_PAYLOAD`.

### `DELETE /api/baltika/fixtures/:fixtureId`

Deletes a fixture and recalculates affected team snapshots.

### `POST /api/baltika/leagues/:leagueId/bulk-upload`

Imports multiple Wyscout player or team-stat workbooks. Files can be supplied in
`files` or `file` multipart fields. Invalid or non-form request bodies return
`400 BAD_REQUEST`. Oversized files are rejected individually with structured
per-file errors.

### `POST /api/baltika/leagues/:leagueId/sync-sports-schedule`

Syncs fixtures from the Sports.ru calendar for the current Baltika season.

### `POST /api/baltika/teams/:teamId/team-stats/upload`

Imports one Wyscout Team Stats workbook for a team.

Request:

- multipart form data;
- `file`: `.xlsx` workbook;
- `seasonId`: target Baltika season id.

Oversized workbook requests are rejected before workbook bytes are parsed.

## Machete

### `POST /api/machete/leagues`

Creates a Machete league shell. Admin only.

Optional JSON body:

```ts
{
  providerLeagueId?: string;
  name?: string;
  country?: string;
  season?: string;
}
```

### League jobs

Admin-only job endpoints:

- `POST /api/machete/leagues/:leagueId/calculate-scores`
- `POST /api/machete/leagues/:leagueId/run-entity-matching`
- `POST /api/machete/leagues/:leagueId/sync-fixtures`
- `POST /api/machete/leagues/:leagueId/sync-full`
- `POST /api/machete/leagues/:leagueId/sync-metadata`
- `POST /api/machete/leagues/:leagueId/sync-player-stats`
- `POST /api/machete/leagues/:leagueId/sync-teams`
- `POST /api/machete/teams/:teamId/sync`
- `POST /api/machete/sync-all`

### `GET /api/machete/sync-status`

Returns the latest ingestion status. Requires a signed-in user.

### `GET /api/machete/sync-jobs`

Returns recent sync jobs. Requires a signed-in user.

### `POST /api/machete/fantasy-prices/import-sheet`

Imports a Sports.ru fantasy price workbook. Admin only.

Request:

- multipart form data;
- `file`: `.xlsx` workbook;
- `leagueId`: numeric league id;
- `season`: season label;
- optional `sheetName`;
- optional `replace`, defaults to true unless set to `"false"`.

Oversized workbook requests are rejected before workbook bytes are parsed.

### `PATCH /api/machete/sports-ru-player-mappings`

Creates, updates, or clears a Sports.ru price-to-player mapping. Admin only.

JSON body:

```ts
{
  priceId: string;
  playerId: string | number | bigint | null;
}
```

### `GET /api/machete/squads`

Returns the authenticated user's authoritative player pool for one league and
season after the initial saved-squad HTML has loaded. Required query params are
`leagueId` and `season`; optional `squadId` must belong to the current user and
match the same league season.

The response contains `players` in the squad-planner row shape. Optional
`squadId` ownership is checked by a separate lightweight database query before
the shared pool is returned. User squads and ownership are never stored in the
pool cache.

With `progressive=1`, the first request (without `cursor`) returns a lightweight
64-player `SEED`: active-squad players first, then mapped players ordered by the
Sports.ru ownership percentage stored with their current price. Its
`pageInfo.totalPlayers` is `null` because the expensive canonical pool has not
been built yet. The browser follows `nextCursor=0`; canonical `POOL` pages then
contain 64 players each and report the exact loaded and total counts. The first
canonical page replaces the seed as the enrichment source, so the final list
contains every canonical player exactly once. Calls without `progressive=1`
retain the legacy all-at-once response for old deployed JavaScript chunks.

The league/season player features and personal scoring overlays are coalesced
and cached separately inside one web process for five minutes. Feature entries
are bounded to 20 keys/96 MiB and overlay entries to 60 keys/32 MiB; rejected
loads are removed. Their revisioned keys include the contest, roster, forecast,
history and scoring inputs. HTTP remains `Cache-Control: private, no-store`, so
browsers and intermediaries must not cache responses. The server-rendered page
still embeds only saved player IDs while the browser progressively fetches the
pool.

### `POST /api/machete/squads`

Creates a named squad variant or updates the selected variant for the current
user and league season.

JSON body:

```ts
{
  leagueId: string | number | bigint;
  season: string;
  squadId?: string | null; // update when present; create when absent
  name?: string;
  horizonRounds?: number;
  selections?: Array<{
    playerId: string;
    isStarter?: boolean;
    isLocked?: boolean;
    isCaptain?: boolean;
    isViceCaptain?: boolean;
    slotIndex?: number;
    purchasePrice?: number | null;
  }>;
}
```

The route resolves authoritative server prices and validates budget, squad
shape, captain/vice-captain roles, team limits, ownership, and transfer limits
for the selected forecast horizon. New variants receive a unique name.

### `DELETE /api/machete/squads?squadId=...`

Deletes one squad variant owned by the current user. Players are removed by the
database cascade.

### `GET /api/machete/squads/export`

Exports the current user's saved Machete squad for a league season. Requires a
signed-in user. Supported query params:

```text
leagueId
season
squadId (optional; defaults to the most recently updated variant)
format=csv|xlsx
```

### `PATCH /api/machete/team-player-seasons/starter`

Updates a team-player-season starter flag. Admin only.

JSON body:

```ts
{
  leagueId: string | number | bigint;
  season: string;
  teamId: string | number | bigint;
  playerId: string | number | bigint;
  isStarter: boolean;
}
```

## Players

### `GET /api/players`

Returns published Baltika player snapshots. Requires a signed-in user.

Supported query params:

```text
leagueId
teamId
positionGroup
starterFilter=starter|bench
starterOnly=1
minMinutes
sort=<column>:asc|desc
```

When `minMinutes` is absent or blank, no minutes filter is applied. Explicit
`minMinutes=0` is treated as a real filter.

### `PATCH /api/players/:snapshotId`

Updates a player snapshot UI flag. Admin only.

```ts
{
  isStarter: boolean;
}
```

## User Preferences

### `GET /api/user/saved-views`
### `POST /api/user/saved-views`
### `DELETE /api/user/saved-views`

Stores up to eight saved player explorer views per user and source.

Supported `source` values: `machete`, `baltika`.

### `GET /api/user/watchlist`
### `POST /api/user/watchlist`
### `DELETE /api/user/watchlist`

Stores up to 32 watched players per user and source.

Supported `source` values: `machete`, `baltika`.

## Shot Maps

Shot-map read routes are used by MiXerr and player/team shot-map views:

- `GET /api/players/:snapshotId/shot-map`
- `GET /api/teams/:teamId/shot-map/for`
- `GET /api/teams/:teamId/shot-map/against`
- `GET /api/shot-map/compare`

Match-window params accept the same values as the MiXerr UI.

### `POST /api/mixerr/leagues/:leagueId/sync-shots`

Syncs MiXerr shots for a league. Admin only.

## Cron

Cron endpoints are not cookie-authenticated by middleware. They validate their
own `Authorization: Bearer <CRON_SECRET>` header and return `403 FORBIDDEN`
when it is missing or invalid. After cron auth succeeds, they return
`503 DATABASE_NOT_CONFIGURED` when `DATABASE_URL` is empty.

- `GET /api/cron/ingestion/daily`
- `GET /api/cron/data-quality`
- `GET /api/cron/retention/league-seasons`

`GET /api/cron/data-quality` audits every scope in
`DATA_QUALITY_AUDIT_SCOPES`. It persists each result, returns `409` when any
quality gate fails, `503` when scopes/thresholds are not configured correctly,
and `500` when execution crashes. A scheduler or uptime monitor must alert on
all non-2xx responses.

### `GET /api/health/data-quality`

Public operational monitor for the latest persisted audit in each configured
scope. Returns `200` only when every latest run is completed, passes its gate,
and is no older than `DATA_QUALITY_AUDIT_MAXIMUM_RUN_AGE_HOURS` (26 by default).
Returns `503` for missing/stale/failed runs, invalid configuration, database
failure, or an unconfigured database.

## Error Format

Most JSON API errors use:

```ts
type ApiError = {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
};
```

Common codes:

```text
BAD_REQUEST
DATABASE_NOT_CONFIGURED
FORBIDDEN
IMPORT_FAILED
INVALID_PAYLOAD
MISSING_FILE
NOT_FOUND
PAYLOAD_TOO_LARGE
RATE_LIMITED
UNAUTHORIZED
```

Common status codes:

- `400 BAD_REQUEST` or `400 INVALID_PAYLOAD` for invalid request data.
- `401 UNAUTHORIZED` when the session is missing or expired.
- `403 FORBIDDEN` when the signed-in user is not an admin or cron auth fails.
- `404 NOT_FOUND` when the targeted row is missing.
- `503 DATABASE_NOT_CONFIGURED` when `DATABASE_URL` is empty.
