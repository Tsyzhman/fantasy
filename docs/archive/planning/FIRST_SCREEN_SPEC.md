# First Screen Spec: `/admin/leagues/[leagueId]`

This should be the first screen implemented.

## Purpose

Let the admin maintain one league by uploading one Wyscout Excel file per team.

## Page sections

### Header

Show:

- league name;
- country/season;
- target period if configured;
- import progress, e.g. `12/24 teams published`;
- bulk upload button;
- link to fantasy model settings.

### Team card grid

Use responsive grid:

```text
Desktop: 4 columns
Tablet: 2 columns
Mobile: 1 column
```

Team card contents:

```text
logo
team name
status badge
players count
last upload date
published date
Drop Wyscout .xlsx here
```

## Status badge colors

Use any consistent design tokens, for example:

```text
EMPTY: gray
UPLOADING/PARSING: blue
READY: amber
PUBLISHED: green
ERROR: red
OUTDATED: orange
```

## Card interactions

- clicking card opens team detail page;
- dropping file uploads to `/api/admin/teams/:teamId/upload`;
- status updates after upload;
- successful upload shows `Ready to publish` action;
- error shows concise message and link to details.

## Empty state

If no teams exist, show:

```text
No teams yet. Add teams to this league before uploading Wyscout files.
```

## Mock seed data for development

Seed at least:

- Championship league;
- season 2025/26;
- Wrexham team;
- a few other placeholder teams.

Do not block on real logos. Use initials or placeholder logos if needed.
