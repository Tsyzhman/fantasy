# Fantasy Scout — Excel-first MVP for Codex

This project is an **Excel-first fantasy scouting platform**.

The first version does **not** depend on API-Football or Wyscout API. The admin uploads Wyscout-format Excel tables by league/team. The app parses the tables, validates the file, stores versioned team datasets, calculates fantasy scores, and exposes a filterable player table to end users.

## Core product idea

Admin workflow:

```text
Admin opens league
→ sees team cards with logo/name/status
→ drags a Wyscout Excel file onto a team card
→ app validates fixed Wyscout format
→ app imports player rows
→ app calculates fantasy score
→ admin publishes the team dataset
```

User workflow:

```text
User opens player explorer
→ selects league/team/position
→ filters by metrics and fantasy score
→ sorts players and saves shortlists
```

## MVP source data

- Source files: `.xlsx`
- Format: Wyscout-style player table
- Sample file: `CHA Wrexham.xlsx`
- Detected columns in sample: **113**
- Mapping: fixed Wyscout parser, not manual user mapping
- API providers: optional later, not part of first implementation

## Recommended stack

- Next.js App Router
- TypeScript
- PostgreSQL
- Prisma
- NextAuth/Auth.js or simple role-based auth for MVP
- Tailwind CSS
- shadcn/ui
- Upload storage: local filesystem in dev, S3-compatible storage later
- Excel parsing library in app code: `xlsx` or equivalent Node-compatible parser

## Files in this package

```text
product/PRODUCT_BRIEF.md
product/ADMIN_UX.md
docs/ARCHITECTURE.md
docs/DATA_MODEL.md
docs/WYSCOUT_EXCEL_IMPORT.md
docs/SOURCE_TABLE_COLUMNS.md
docs/FANTASY_SCORING.md
docs/API_ROUTES.md
docs/IMPLEMENTATION_PLAN.md
docs/ACCEPTANCE_CRITERIA.md
implementation-notes/FIRST_SCREEN_SPEC.md
prompts/CODEX_START_PROMPT.md
.env.example
```

Start with `prompts/CODEX_START_PROMPT.md`.
