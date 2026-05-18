# Machete FotMob Import

Machete supports three FotMob provider modes:

```env
MACHETE_FOTMOB_PROVIDER_MODE="mock"
MACHETE_FOTMOB_PROVIDER_MODE="unofficial"
MACHETE_FOTMOB_PROVIDER_MODE="real"
```

`mock` is the default and uses local seed data.

`unofficial` calls FotMob public endpoints for prototype/internal research. Keep volumes small, respect blocks and rate limits, and do not use proxy or verification bypasses. If FotMob returns `403`, `429`, or `TURNSTILE_REQUIRED`, the sync stops.

`real` is reserved for a licensed provider adapter. The app intentionally keeps this separate from the unofficial endpoint client.

## Endpoint Mapping

The unofficial client currently maps:

```text
GET /api/data/leagues?id={leagueId}&season={YYYY/YYYY}&ccode3={CCODE3}
GET /api/data/teams?id={teamId}&ccode3={CCODE3}
GET /api/data/fixtures?id={leagueId}&season={YYYY/YYYY}
GET /api/data/match?id={matchId}
```

## Seeded League IDs

Machete seeds these FotMob league IDs:

| League | FotMob ID |
| --- | ---: |
| Championship | `48` |
| Premier League | `47` |
| Bundesliga | `54` |
| Ligue 1 | `53` |
| Serie A | `55` |
| Primeira Liga / Liga Portugal | `61` |
| Eredivisie | `57` |
| Turkish Super Lig | `71` |
| Russian Premier League | `63` |
| World Cup 2026 | `77` |

Machete stores raw provider payloads through `MacheteRawPayload` in the existing sync jobs, then normalizes them into:

```text
MacheteLeague
MacheteTeam
MachetePlayer
MacheteFixture
MachetePlayerMatchStat
MachetePlayerSnapshot
```

## Player Stats

Some FotMob detail endpoints, including `matchDetails` and `playerData`, can require verification. The importer does not bypass that. For player scoring, `unofficial` mode uses the squad data embedded in `/data/teams` as a season aggregate:

```text
rating
goals
assists
yellow cards
red cards
```

Those aggregates are stored against a synthetic `SEASON_AGGREGATE` fixture per team so the existing Machete snapshot and scoring pipeline can stay unchanged.
The scorer uses the team's synced finished fixture count as the denominator for these season totals, so `Expected Fantasy Points` stays a per-match expectation instead of treating season goals and assists as one-match output.

Because `/data/teams` does not expose every fantasy metric, fields such as minutes, shots, key passes, tackles, interceptions, and saves may be empty or zero in unofficial mode.
