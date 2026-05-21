# Machete FotMob Import

Machete supports four FotMob provider modes:

```env
MACHETE_FOTMOB_PROVIDER_MODE="mock"
MACHETE_FOTMOB_PROVIDER_MODE="unofficial"
MACHETE_FOTMOB_PROVIDER_MODE="browser"
MACHETE_FOTMOB_PROVIDER_MODE="real"
```

`mock` is the default and uses local seed data.

`unofficial` calls FotMob public endpoints directly. In practice most detail endpoints now require Cloudflare Turnstile verification, so this mode is mainly useful for endpoints that are still openly cacheable.

`browser` runs requests through a Playwright-driven Chromium that holds a persistent FotMob session. On the first run, set `MACHETE_FOTMOB_BROWSER_HEADLESS=false` and solve the Turnstile challenge once in the visible window; the resulting cookies are written to the profile dir and re-used by headless runs.

`real` is reserved for a licensed provider adapter. The app intentionally keeps this separate from the unofficial endpoint client.

## Browser mode setup

Browser mode runs in a dedicated docker service (`ingestion-browser`) so it
shares the same docker network as Postgres. The host machine never needs to
reach the DB. Build is gated behind the `browser` compose profile so default
`docker compose up` skips it.

### 1. Build and start the browser service

```bash
docker compose --profile browser build ingestion-browser
docker compose --profile browser up -d ingestion-browser
docker compose ps ingestion-browser
```

### 2. Smoke test (default league 47 / Premier League)

```bash
docker compose exec ingestion-browser npm run fotmob:smoke -- 47
# arguments: leagueId season sampleCount
docker compose exec ingestion-browser npm run fotmob:smoke -- 47 2025/2026 10
```

Outputs land in the `fotmob-browser-smoke` volume (mounted at
`/app/tmp_fotmob_smoke`). To pull them out:

```bash
docker compose cp ingestion-browser:/app/tmp_fotmob_smoke ./tmp_fotmob_smoke
cat ./tmp_fotmob_smoke/summary-47.json
```

A successful run reports `matchDetails sample: N/M matches returned detailed
payloads` with `hasPlayerStats: true` / `hasShotmap: true` for at least one
match.

### 3. Run the actual backfill

```bash
docker compose exec ingestion-browser npm run ingestion:initial-backfill -- current_league_47
# or the full multi-league backfill (long-running)
docker compose exec ingestion-browser npm run ingestion:initial-backfill
docker compose exec ingestion-browser npm run ingestion:status
```

### Turnstile fallback

Most of the time Cloudflare Turnstile passes silently with a real Chromium and
realistic settings. If you see `TURNSTILE_REQUIRED` or `Verification required`
in the smoke output, solve the challenge once on a workstation with a desktop
and copy the resulting cookies into the docker volume:

```bash
# On a workstation with a desktop (Windows/macOS/Linux + X):
npm install
npx playwright install chromium
MACHETE_FOTMOB_BROWSER_HEADLESS=false npm run fotmob:smoke -- 47
# A Chromium window opens; solve the Turnstile, close once smoke is green.
# Cookies are written to ./.cache/fotmob-browser-profile.

# Copy that profile into the docker volume (run on the docker host):
docker compose --profile browser cp ./.cache/fotmob-browser-profile/. \
  ingestion-browser:/data/fotmob-browser-profile/
docker compose --profile browser restart ingestion-browser
```

### Skipping broken fixtures

For modes that set `require_detailed_payloads: true` (e.g. `current_league_47`),
even a single FotMob anomaly fails the whole job. The most common cause is a
fixture whose page redirects to a different match id — confirmed by an
`error_message` like `match page payload id mismatch: <other id>`.

Add the offending fixture id(s) to `MACHETE_FOTMOB_SKIP_FIXTURE_IDS` in the
host `.env`. Both ingestion services pick it up via compose interpolation, so
no YAML edit is required:

```env
MACHETE_FOTMOB_SKIP_FIXTURE_IDS="4813374,4813380"
```

```bash
docker compose --profile browser up -d --force-recreate ingestion-browser
docker compose exec ingestion-browser npm run ingestion:initial-backfill -- current_league_47
```

A `[core_data] Skipping N fixture(s) via MACHETE_FOTMOB_SKIP_FIXTURE_IDS ...`
warning is logged at the start of each scope, so it is obvious which matches
were excluded from the dataset.

### Custom database credentials

The `ingestion-browser` service shares its `DATABASE_URL` with the other
ingestion containers via the `DATABASE_URL_INTERNAL` env variable in `.env`.
For example, if the postgres role in your container is `postgres` rather than
`fantasy_app`, set in `.env` (on the docker host):

```env
DATABASE_URL_INTERNAL="postgresql://postgres:postgres@postgres:5432/fantasy_scout"
```

Both `ingestion-worker` and `ingestion-browser` will pick that up; no YAML
edits required.

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

## Local Team Logos

Machete team sync prefers local repository logos from `public/team-logos` over FotMob CDN URLs. Matching uses the seeded `fotMobLeagueId`, team name, short name, and aliases from `src/lib/leagues/seed-data.ts`.
