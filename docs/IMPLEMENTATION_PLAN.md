# Implementation Plan

## Phase 0 — Project setup

- Create Next.js app with TypeScript.
- Add Tailwind and shadcn/ui.
- Add Prisma + PostgreSQL.
- Add auth with roles ADMIN/USER.
- Seed one league, one season, teams, and a default fantasy model.

## Phase 1 — League/team admin UI

Build:

```text
/admin/leagues
/admin/leagues/[leagueId]
```

The league detail page must show:

- league header;
- progress bar;
- team card grid;
- status badges;
- drag & drop area per team.

Use mock data first if needed, then connect to database.

## Phase 2 — Single-team Wyscout upload

Build:

```text
POST /api/admin/teams/:teamId/upload
```

Implement:

- file upload;
- local file storage;
- source file record;
- import job record;
- Excel parser;
- column validation;
- team validation;
- player snapshot insertion;
- scoring calculation;
- import status result.

## Phase 3 — Publish flow

Build:

```text
POST /api/admin/imports/:importId/publish
```

Behavior:

- only READY imports can be published;
- previous current import for team becomes not current;
- new import becomes PUBLISHED/current;
- users see only published snapshots.

## Phase 4 — Player explorer

Build:

```text
/app/players or /players
GET /api/players
```

Include:

- league/team filters;
- position filter;
- min minutes filter;
- age filter;
- fantasy score sorting;
- value score sorting;
- table pagination;
- CSV export.

## Phase 5 — Better admin details

Build:

```text
/admin/leagues/[leagueId]/teams/[teamId]
```

Show:

- import history;
- player preview;
- errors/warnings;
- publish/unpublish controls.

## Phase 6 — Bulk upload

Optional but valuable.

Build a modal allowing multiple files to be dropped and automatically matched to teams.

## Do first

The first Codex task should implement the foundation and the key admin screen:

```text
/admin/leagues/[leagueId]
```

with seeded teams and dropzones, then add the upload route/parser.
