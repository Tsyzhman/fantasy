# Internal API Routes

The app uses Next.js route handlers under `src/app/api`.

## Auth

### `POST /api/auth/logout`

Clears the current session cookie. This route is public so it can run even when
`DATABASE_URL` is not configured.

## Admin

All admin routes require a signed-in admin user.

### `POST /api/admin/teams/:teamId/upload`

Imports one Wyscout player workbook for a Baltika team.

Request:

- multipart form data;
- `file`: `.xlsx` workbook;
- `seasonId`: target Baltika season id.

Invalid or non-form request bodies return `400 BAD_REQUEST`.

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
`400 BAD_REQUEST`.

### `POST /api/baltika/leagues/:leagueId/sync-sports-schedule`

Syncs fixtures from the Sports.ru calendar for the current Baltika season.

### `POST /api/baltika/teams/:teamId/team-stats/upload`

Imports one Wyscout Team Stats workbook for a team.

Request:

- multipart form data;
- `file`: `.xlsx` workbook;
- `seasonId`: target Baltika season id.

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

### `PATCH /api/machete/sports-ru-player-mappings`

Creates, updates, or clears a Sports.ru price-to-player mapping. Admin only.

JSON body:

```ts
{
  priceId: string;
  playerId: string | number | bigint | null;
}
```

### `POST /api/machete/squads`

Saves the current user's fantasy squad for a league season.

JSON body:

```ts
{
  leagueId: string | number | bigint;
  season: string;
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

The route validates squad shape, captain/vice-captain rules, team limits, and
transfer limits for the selected forecast horizon.

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
- `GET /api/cron/retention/league-seasons`

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
UNAUTHORIZED
```

Common status codes:

- `400 BAD_REQUEST` or `400 INVALID_PAYLOAD` for invalid request data.
- `401 UNAUTHORIZED` when the session is missing or expired.
- `403 FORBIDDEN` when the signed-in user is not an admin or cron auth fails.
- `404 NOT_FOUND` when the targeted row is missing.
- `503 DATABASE_NOT_CONFIGURED` when `DATABASE_URL` is empty.
