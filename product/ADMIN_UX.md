# Admin UX

## Main navigation

```text
/admin/leagues
/admin/leagues/[leagueId]
/admin/leagues/[leagueId]/teams/[teamId]
/admin/models
```

## `/admin/leagues`

Purpose: show all maintained leagues.

Each league card shows:

- league name;
- country;
- season;
- number of teams;
- import progress, e.g. `18/24 teams published`;
- last update date.

Actions:

- create league;
- open league;
- archive league.

## `/admin/leagues/[leagueId]`

This is the key MVP screen.

Layout:

```text
Header:
  League name, season, period, progress bar, bulk upload button

Body:
  grid of team cards
```

Team card fields:

- logo;
- team name;
- status badge;
- last upload date;
- players count;
- current published version;
- detected file period if available;
- dropzone area.

Statuses:

```text
EMPTY       No file uploaded yet
UPLOADING   File is being uploaded
PARSING     File is being parsed
VALIDATED   Structure is correct
READY       Imported but not published
PUBLISHED   Users can see it
ERROR       Import failed
OUTDATED    Published data is older than target period/version
```

Drag & drop behavior:

```text
Drop file on team card
→ show upload progress
→ parse first worksheet
→ validate required columns
→ detect team name from Team column
→ compare detected team with target card
→ create team import version
→ calculate fantasy scores
→ mark import READY
→ admin can Publish
```

Mismatch behavior:

```text
Expected team: Wrexham
Detected team: Birmingham City
Result: block import by default and show warning
```

## Bulk upload

Admin can drag many files into a bulk upload modal.

The system tries to match each file to a team by:

1. exact `Team` column value;
2. normalized filename;
3. fuzzy team name match.

Preview table:

```text
File name             Detected team      Matched team       Status
CHA Wrexham.xlsx      Wrexham            Wrexham            Ready
CHA Birmingham.xlsx   Birmingham City    Birmingham City    Ready
Unknown.xlsx          Unknown            —                  Needs review
```

Bulk upload is not required for the very first implementation, but the architecture should allow it.

## `/admin/leagues/[leagueId]/teams/[teamId]`

Detailed team import history.

Show:

- current published import;
- previous import versions;
- file names;
- import logs;
- errors/warnings;
- preview of imported player rows;
- publish/unpublish controls.

## `/admin/models`

Fantasy scoring models.

Admin can manage model rules by position group:

```text
GK
DEF
MID
FWD
DEFAULT
```

Each rule:

```text
metric_key
weight
aggregation / transform
position_group
enabled
```

First MVP may seed a default model and expose editing later.
