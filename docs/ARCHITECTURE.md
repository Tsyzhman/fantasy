# Architecture

## Design principle

Build the first version around uploaded Wyscout Excel files, not external APIs.

External data providers can be added later using a provider abstraction, but the MVP source of truth is:

```text
Wyscout-format `.xlsx` uploaded by admin
```

## Suggested stack

- Next.js App Router
- TypeScript
- PostgreSQL
- Prisma
- Tailwind CSS
- shadcn/ui
- Node Excel parser, e.g. `xlsx`
- Local file storage in development
- S3-compatible file storage in production

## High-level modules

```text
src/app/admin/leagues
src/app/admin/leagues/[leagueId]
src/app/admin/leagues/[leagueId]/teams/[teamId]
src/app/admin/models
src/app/players

src/lib/importers/wyscout-excel
src/lib/scoring
src/lib/storage
src/lib/db
src/lib/auth
src/components/team-card
src/components/upload-dropzone
src/components/player-table
src/components/filter-sidebar
```

## Data flow

```text
Admin drops Excel file on a team card
→ API route receives file
→ file stored in storage
→ import job created
→ parser reads workbook
→ validator checks required columns
→ normalizer maps Wyscout headers to internal metric keys
→ team name is validated against target team
→ previous current import is archived
→ new team import is saved as READY
→ player snapshots are inserted
→ fantasy scores are calculated
→ admin publishes import
→ user player explorer reads published snapshots
```

## Import versioning

Every upload creates a new `team_import` record.

Only one import per team should be `is_current_published = true`.

Recommended MVP behavior:

- keep all historical imports;
- show only current published import to users;
- allow admin to publish a new import after validation;
- publishing a new import automatically unpublishes the previous one for the same league/team/season/period/model context.

## Provider abstraction for future

Keep these source types even if only one is implemented now:

```ts
export type DataSourceType =
  | 'WYSCOUT_EXCEL'
  | 'API_FOOTBALL'
  | 'WYSCOUT_API'
  | 'MANUAL';
```

This keeps the product Excel-first while allowing API-based importers later.

## Security and roles

Roles:

```text
ADMIN
USER
```

Admin can upload/import/publish.

User can view/filter published datasets.

Never expose unpublished imports to normal users.

## Storage

In development:

```text
storage/uploads/{sourceFileId}/{originalFilename}
```

In production:

```text
s3://bucket/uploads/{sourceFileId}/{originalFilename}
```

Store file metadata and checksum in `source_files`.
