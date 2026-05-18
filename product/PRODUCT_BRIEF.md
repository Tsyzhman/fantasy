# Product Brief

## Product name

Fantasy Scout

## One-liner

A fantasy football player discovery tool powered by uploaded Wyscout-format team spreadsheets.

## Problem

Fantasy users need a fast way to compare players across a league using structured football metrics, but raw scouting tables are difficult to use manually. Admins may have team-by-team Wyscout spreadsheets, but users need a clean searchable interface with calculated fantasy scores.

## Solution

Create a web app where an admin maintains league datasets visually:

```text
League → team cards → drag & drop Wyscout Excel file → publish dataset
```

The app parses each team spreadsheet, calculates fantasy and value scores, and exposes a player explorer for normal users.

## Primary personas

### Admin

Owns data preparation and publishing.

Needs to:

- create/manage leagues and teams;
- upload Wyscout Excel files team by team;
- see which teams are missing/outdated;
- validate imported rows;
- publish/unpublish datasets;
- configure fantasy scoring models.

### User

Uses the prepared data to make fantasy decisions.

Needs to:

- browse one league at a time;
- filter by team, position, age, minutes, value, xG/xA, goals, assists, score;
- sort by fantasy score and value score;
- compare players quickly;
- optionally save shortlists later.

## MVP scope

Included:

- admin login;
- league list;
- league detail page with team cards;
- drag & drop Excel upload on a team card;
- fixed Wyscout-format parser;
- validation and import status;
- versioned team imports;
- fantasy model with configurable weights;
- player explorer for published data;
- CSV export from player explorer.

Excluded from first MVP:

- live API-Football integration;
- Wyscout API integration;
- payments;
- multi-tenant organizations;
- real-time live match updates;
- complex ML predictions;
- manual column mapping UI.

## Product positioning

Not “spreadsheet hosting”.

Position it as:

> Excel-first fantasy scouting platform with league/team upload dashboard and fantasy scoring models.
