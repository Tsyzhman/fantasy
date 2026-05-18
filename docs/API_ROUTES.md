# Internal API Routes

Use Next.js route handlers.

## Admin routes

### `GET /api/admin/leagues`

Returns leagues with team/import progress.

### `POST /api/admin/leagues`

Creates a league.

### `GET /api/admin/leagues/:leagueId/teams`

Returns team cards with current import status.

Response shape:

```ts
type TeamCardDto = {
  id: string;
  name: string;
  slug: string;
  logoUrl?: string;
  status: ImportStatus | 'EMPTY';
  playersCount: number;
  lastUploadAt?: string;
  publishedAt?: string;
  latestImportId?: string;
  errors?: unknown[];
  warnings?: unknown[];
};
```

### `POST /api/admin/teams/:teamId/upload`

Receives a single Wyscout Excel file dropped on a team card.

Request:

- multipart form data;
- file field: `file`;
- optional fields: `leagueId`, `seasonId`, `periodFrom`, `periodTo`.

Behavior:

```text
store source file
create TeamImport
parse/validate/import
return import result
```

### `POST /api/admin/imports/:importId/publish`

Publishes a ready import.

### `POST /api/admin/imports/:importId/unpublish`

Unpublishes current import.

### `GET /api/admin/imports/:importId`

Returns import details, logs, player preview.

### `POST /api/admin/bulk-upload`

Future route for many files at once.

## User routes

### `GET /api/players`

Returns published player snapshots only.

Query params:

```text
leagueId
seasonId
teamId
positionGroup
minAge
maxAge
minMinutes
maxMarketValue
minFantasyScore
minValueScore
starterOnly
sort
page
pageSize
```

### `GET /api/players/:snapshotId`

Returns a player snapshot with raw metrics.

### `PATCH /api/players/:snapshotId`

Updates player snapshot UI flags.

```ts
{
  isStarter: boolean;
}
```

### `GET /api/leagues`

Returns public leagues with published datasets.

### `GET /api/leagues/:leagueId/teams`

Returns public teams in a league with published data.

## Error format

Use consistent errors:

```ts
type ApiError = {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
};
```

Examples:

```text
MISSING_REQUIRED_COLUMNS
TEAM_MISMATCH
INVALID_FILE_TYPE
IMPORT_NOT_READY
UNAUTHORIZED
```
