# Machete FotMob Import

Machete supports three FotMob provider modes:

```env
MACHETE_FOTMOB_PROVIDER_MODE="mock"
MACHETE_FOTMOB_PROVIDER_MODE="unofficial"
MACHETE_FOTMOB_PROVIDER_MODE="real"
```

`mock` is the default and uses local seed data.

`unofficial` follows the same public-data flow as
[`bjrsti/fotmob`](https://github.com/bjrsti/fotmob): league/team/fixture
summary data comes from `/api/data/*`, and match details are resolved through
FotMob's unsigned Next.js data files:

```text
GET /_next/data/{buildId}/match/{matchId}.json
GET /_next/data/{buildId}/matches/{slug}.json
```

The client validates that the returned payload id is the requested match id.
If FotMob serves a canonical paired fixture for the slug, the match is skipped
instead of writing another fixture's playerStats/shotmap into the database.

`real` is reserved for a licensed provider adapter. The app intentionally keeps
this separate from the unofficial endpoint client.

## Next-data canonical mismatches

FotMob can resolve `match/{matchId}.json` to a slug whose
`matches/{slug}.json` payload belongs to another fixture. This is currently
common for paired league fixtures. The importer treats those as unavailable
match details. Do not disable the id check; otherwise a backfill can silently
store another match's detailed stats.

## Smoke test

```bash
docker compose exec ingestion-worker npm run fotmob:smoke -- 47
# arguments: leagueId season sampleCount
docker compose exec ingestion-worker npm run fotmob:smoke -- 47 2025/2026 10
```

A successful run reports `matchDetails sample: N/M matches returned detailed
payloads` with `hasPlayerStats: true` / `hasShotmap: true` for at least one
match. If FotMob's Next-data route serves canonical paired fixtures, those
matches are reported as unavailable and are skipped by ingestion.

## Run the actual backfill

```bash
docker compose exec ingestion-worker npm run ingestion:initial-backfill -- current_league_47
# or the full multi-league backfill (long-running)
docker compose exec ingestion-worker npm run ingestion:initial-backfill
docker compose exec ingestion-worker npm run ingestion:status
```

## Skipping broken fixtures

Add known-bad fixture ids to `MACHETE_FOTMOB_SKIP_FIXTURE_IDS` in the host
`.env` if you want discovery to exclude them before detail fetching:

```env
MACHETE_FOTMOB_SKIP_FIXTURE_IDS="4813374,4813380"
```

```bash
docker compose up -d --force-recreate ingestion-worker
docker compose exec ingestion-worker npm run ingestion:initial-backfill -- current_league_47
```

A `[core_data] Skipping N fixture(s) via MACHETE_FOTMOB_SKIP_FIXTURE_IDS ...`
warning is logged at the start of each scope.

## Custom database credentials

The `ingestion-worker` service uses `DATABASE_URL_INTERNAL` from `.env` if set,
otherwise the default `fantasy_app` role:

```env
DATABASE_URL_INTERNAL="postgresql://postgres:postgres@postgres:5432/fantasy_scout"
```

## Endpoint Mapping

The unofficial client currently maps:

```text
GET /api/data/leagues?id={leagueId}&season={YYYY/YYYY}&ccode3={CCODE3}
GET /api/data/teams?id={teamId}&ccode3={CCODE3}
GET /api/data/fixtures?id={leagueId}&season={YYYY/YYYY}
GET /_next/data/{buildId}/match/{matchId}.json
GET /_next/data/{buildId}/matches/{slug}.json
GET /api/data/playerData?id={playerId}
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

When FotMob's Next.js data payload returns the requested match id, per-match
player stats, the shotmap, and team stats land in
`details.raw.content.{playerStats,shotmap,stats,lineup}` and feed the normal
Machete snapshot/scoring pipeline.

If you intentionally fall back to the squad aggregate endpoint
(`/data/teams`), only the season totals below are exposed (no per-match
breakdown):

```text
rating
goals
assists
yellow cards
red cards
```

## Local Team Logos

Machete team sync prefers local repository logos from `public/team-logos` over FotMob CDN URLs. Matching uses the seeded `fotMobLeagueId`, team name, short name, and aliases from `src/lib/leagues/seed-data.ts`.
