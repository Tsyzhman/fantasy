# Product Brief

## Product Name

Fantasy Scout

## One-Liner

A fantasy football scouting workspace for FotMob-backed projections, Sports.ru
prices, squad planning, and shot-map analysis.

## Current Product Reality

Fantasy Scout's football scouting workflows are available in Machete and MiXerr.

- **Machete** includes shared FotMob data, player forecasts, league strength,
  and squad planning with Sports.ru and official FPL contest data where available.
- **MiXerr** includes shot maps, xG overlays, and passing networks built from a
  completed StatsBomb match event file in the browser.

Other product areas cover the [KHL fantasy beta](../guides/KHL_IMPLEMENTATION_STATUS.md),
[Franchises analytics](../../specs/modules/franchises/FEAT-005-franchise-analytics.md),
[Telegram deadline reports](../../specs/modules/telegram/FEAT-007-deadline-assistant.md),
and [Fantasy Arena](../guides/BETTING_ARENA.md), a virtual-coin league.
The [project history](CHANGE_HISTORY.md) records how these areas developed.

## Problem

Fantasy users need to turn scattered football data into decisions: which players
to buy, who is underpriced, who has useful upcoming fixtures, and which shot
profiles are real. Admins also need controlled data pipelines because provider
data, price sheets, and Excel exports do not arrive in one clean format.

## Solution

The app combines managed ingestion with decision-oriented views:

- fetch and normalize FotMob fixtures, rosters, player stats, shots, and events;
- import Sports.ru fantasy prices and map them to FotMob players;
- calculate fantasy projections and value scores;
- let users build, validate, optimize, save, and export squads;
- expose MiXerr shot-map analysis on top of normalized match shots.

## Primary Personas

### Admin

Owns data quality and operations.

Needs to:

- configure leagues, teams, seasons, users, and fantasy models;
- run initial backfills and incremental ingestion jobs;
- inspect ingestion status and failures;
- upload Sports.ru price workbooks and fix player mappings;
- trigger league/team sync jobs;
- keep production secrets and migrations safe.

### Fantasy User

Uses prepared data to make squad decisions.

Needs to:

- browse players by league, season, team, position, price, minutes, and score;
- compare projections, value, recent form, and upcoming fixtures;
- save watchlists and reusable views;
- build a legal squad under budget and team limits;
- lock players, select captain/vice-captain, and evaluate transfers;
- export squad or player data.

### Analyst

Uses shot and match data to inspect team/player profiles.

Needs to:

- inspect attacking and conceded shot maps;
- filter by match window and context;
- compare teams or players with consistent normalized coordinates;
- rely on deduplicated shot source fingerprints.

## In Scope

- Custom cookie/session auth with admin and user roles.
- Prisma/PostgreSQL schema with versioned migrations.
- Machete FotMob ingestion and shared normalized core tables.
- Sports.ru fantasy price imports and player mapping.
- Machete player explorer and squad planner.
- MiXerr shot maps, comparison APIs, and browser-local passing networks.
- Isolated KHL fantasy beta, franchise reports, opt-in Telegram deadline
  messages, and virtual-coin Arena.
- Saved views, watchlists, and squad export.
- Continuous Docker deployment and CI checks.

## Out Of Scope For Now

- Payments and subscriptions.
- Multi-tenant organization management.
- Real-time live-match updates.
- Public anonymous fantasy league hosting.
- A generic manual column-mapping UI for arbitrary spreadsheets.
- Replacing provider-specific import logic with a fully generic ETL builder.

## Positioning

Not "spreadsheet hosting" and not a generic BI dashboard.

Position it as:

> Fantasy football decision software that combines provider ingestion, price
> sheets, squad constraints, and shot-map analysis in one operational workspace.
