# Product Brief

## Product Name

Fantasy Scout

## One-Liner

A fantasy football scouting workspace for FotMob-backed projections, Sports.ru
prices, squad planning, Wyscout-style team imports, and shot-map analysis.

## Current Product Reality

Fantasy Scout is no longer only a Wyscout spreadsheet MVP. It has three active
workspaces:

- Machete: shared FotMob data, player projections, Sports.ru prices, squad
  planning, and sync operations.
- Baltika: Wyscout-style Excel imports, scouting tables, manual schedules,
  team-stat workbooks, and configurable models.
- MiXerr: shot maps, xG overlays, and team/player shot comparisons.

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
- keep Baltika's Wyscout-style import workflow for uploaded scouting workbooks;
- expose MiXerr shot-map analysis on top of normalized match shots.

## Primary Personas

### Admin

Owns data quality and operations.

Needs to:

- configure leagues, teams, seasons, users, and fantasy models;
- run initial backfills and incremental ingestion jobs;
- inspect ingestion status and failures;
- upload Wyscout-style player/team-stat workbooks;
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
- Baltika Wyscout-style workbook imports and model settings.
- MiXerr shot maps and comparison APIs.
- Saved views, watchlists, and squad export.
- Production Docker/PM2 runbooks and CI checks.

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
