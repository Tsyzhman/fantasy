# Codex Start Prompt

You are building the first MVP of **Fantasy Scout**, an Excel-first fantasy football scouting web app.

Read the repository docs first, especially:

- `docs/development/AGENT_GUIDE.md`
- `docs/product/PRODUCT_BRIEF.md`
- `docs/product/ADMIN_UX.md`
- `docs/reference/ARCHITECTURE.md`
- `docs/reference/DATA_MODEL.md`
- `docs/integrations/WYSCOUT_EXCEL_IMPORT.md`
- `docs/reference/FANTASY_SCORING.md`
- `docs/archive/planning/FIRST_SCREEN_SPEC.md`

## Product summary

The app lets an admin maintain fantasy datasets by league/team. The admin opens a league, sees a grid of team cards with logo/name/status, and drags a Wyscout-format Excel file onto a team card. The app parses the Excel file, validates that it belongs to the team, imports player rows, calculates fantasy scores, and lets the admin publish the dataset. Normal users later filter published players by league/team/position/metrics/fantasy score.

## Important direction

This MVP is **Excel-first**, not API-first.

Do not implement API-Football or Wyscout API integrations now. Keep provider abstractions if useful, but the first working source is uploaded Wyscout `.xlsx` files.

Files are assumed to be Wyscout-format tables like the sample `CHA Wrexham.xlsx`:

- first worksheet;
- header row at the top;
- one row per player;
- includes `Player`, `Team`, `Position`, `Age`, `Market value`, `Contract expires`, `Matches played`, `Minutes played`, `Goals`, `xG`, `Assists`, `xA`;
- many additional metric columns should be stored in `rawMetrics` JSON.

## First implementation goal

Create the foundation and the key admin screen:

```text
/admin/leagues/[leagueId]
```

This page should show a league header and a responsive grid of team cards. Each team card should display:

- logo or placeholder initials;
- team name;
- import status badge;
- players count;
- last upload/publish info;
- drag & drop area for Wyscout `.xlsx`.

## Suggested stack

Use:

- Next.js App Router;
- TypeScript;
- Tailwind CSS;
- shadcn/ui if available;
- Prisma + PostgreSQL;
- local filesystem upload storage for development;
- a Node-compatible Excel parser such as `xlsx`.

## Build tasks

1. Create or update the project structure for a Next.js TypeScript app.
2. Add Prisma schema based on `docs/reference/DATA_MODEL.md`.
3. Add seed data:
   - one league: Championship;
   - one season: 2025/26;
   - Wrexham and several placeholder teams.
4. Build `/admin/leagues` list page.
5. Build `/admin/leagues/[leagueId]` team-card grid page.
6. Implement `POST /api/admin/teams/:teamId/upload`:
   - accept multipart `.xlsx` file;
   - store file locally;
   - create `SourceFile` and `TeamImport` records;
   - parse first worksheet;
   - validate required Wyscout columns;
   - validate `Team` column against target team name/aliases;
   - normalize rows into `PlayerSnapshot` records;
   - store all metrics in `rawMetrics` JSON;
   - calculate fantasy score and value score using a seed model;
   - return import result and errors/warnings.
7. Implement publish endpoint:
   - `POST /api/admin/imports/:importId/publish`;
   - mark import as current published;
   - unpublish previous current import for same team/season.
8. Add a basic `/players` page that reads only current published snapshots and displays a filterable/sortable table.

## Constraints

- Keep code clean and typed.
- Use server actions or route handlers consistently.
- Do not store unpublished data in user-facing queries.
- Do not require manual column mapping in MVP.
- Make import validation errors visible in the admin UI.
- Preserve unknown metrics in `rawMetrics`; do not discard extra columns.
- Normalize metric keys consistently using header normalization.
- Keep the design clean and visual: league → team cards → drag/drop.

## Definition of done for first pass

The first pass is done when:

- the app runs locally;
- database schema and seed work;
- admin can open a league and see team cards;
- admin can upload a Wyscout `.xlsx` file to a team card;
- import creates player snapshots and a READY import;
- admin can publish the import;
- `/players` shows published players with fantasy score and core metrics.

Please implement this in small, well-structured commits or patches. If you need to simplify, prioritize the admin league page, upload route, parser, and database model over secondary UI polish.
