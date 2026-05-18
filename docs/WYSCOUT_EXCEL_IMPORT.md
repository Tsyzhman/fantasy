# Wyscout Excel Import

## Assumption

All uploaded files are Wyscout-style Excel tables with a stable header row.

There is no manual column mapping UI in the MVP.

## Expected file

- extension: `.xlsx`
- first worksheet contains the table;
- first row contains headers;
- one row per player;
- `Team` column contains the team name;
- `Player` column contains player name.

## Required columns

The import must fail if any required column is missing:

```text
Player
Team
Position
Age
Market value
Contract expires
Matches played
Minutes played
Goals
xG
Assists
xA
```

Recommended profile columns:

```text
Birth country
Passport country
Foot
Height
Weight
On loan
```

## Parser pipeline

```text
read workbook
→ select first worksheet
→ read header row
→ normalize header names
→ validate required columns
→ read player rows
→ coerce numeric/date/boolean fields
→ detect team name
→ compare with target team card
→ normalize position group
→ store raw metrics JSON
→ calculate fantasy score
```

## Header normalization

Normalize headers to internal keys:

```ts
function normalizeHeader(header: string): string {
  return header
    .trim()
    .toLowerCase()
    .replace(/%/g, 'percent')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}
```

Examples:

```text
"Market value" → market_value
"Minutes played" → minutes_played
"xG" → xg
"xA" → xa
"Shots on target, %" → shots_on_target_percent
"Defensive duels won, %" → defensive_duels_won_percent
```

## Type coercion

Numeric fields:

- empty string → null;
- `null`/`undefined` → null;
- number-like string → number;
- invalid number → validation warning.

Dates:

- `Contract expires` should parse as date when present;
- allow `YYYY-MM-DD` strings;
- empty value → null.

Boolean:

```text
On loan: "yes" → true
On loan: "no" → false
empty → null
```

## Team validation

When a file is dropped onto a team card, the target team is known.

Validation:

```text
expectedTeam = team card name / aliases
detectedTeams = unique values from Team column
```

Rules:

- if all rows match expected team or alias: OK;
- if multiple teams detected: ERROR;
- if one different team detected: ERROR unless admin explicitly rematches in bulk upload flow;
- store detected team name in `TeamImport.detectedTeamName`.

## Position group normalization

Wyscout positions can contain multiple comma-separated values:

```text
"CB , LCB3 , RCB3"
"GK"
"RCMF"
"CF"
```

Map to groups:

```text
GK → GK
CB, LCB, RCB, LB, RB, LWB, RWB → DEF
DMF, CMF, LCMF, RCMF, AMF → MID
LW, RW, LWF, RWF, CF, ST → FWD
otherwise → UNKNOWN
```

Use position group for fantasy model rules and filters.

## Import idempotency

Calculate file checksum.

If the same file is uploaded again to the same team:

- either block duplicate import;
- or create a new version but show duplicate warning.

MVP recommendation: allow it but show warning.

## Publishing behavior

Import creates status `READY` after successful parse.

Admin clicks `Publish`.

Publishing should:

1. set previous current published import for same team/season to `ARCHIVED` or `isCurrentPublished=false`;
2. set new import status to `PUBLISHED`;
3. set `isCurrentPublished=true`;
4. expose its player snapshots to users.
