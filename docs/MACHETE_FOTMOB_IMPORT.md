# Machete FotMob Import

Machete supports three FotMob provider modes:

```env
MACHETE_FOTMOB_PROVIDER_MODE="mock"
MACHETE_FOTMOB_PROVIDER_MODE="unofficial"
MACHETE_FOTMOB_PROVIDER_MODE="real"
```

`mock` is the default and uses local seed data.

`unofficial` calls FotMob public endpoints directly. Every request is signed
with the `x-mas` header (`base64(JSON({body, signature}))`, signature =
`MD5(JSON(body) + secret).toUpperCase()`, body = `{url, code: Date.now()}`).
The secret string lives in [`src/providers/fotmob/signing.ts`](../src/providers/fotmob/signing.ts).
This is enough to fetch detailed match payloads (matchDetails / shotmap /
playerStats / stats) without a browser.

`real` is reserved for a licensed provider adapter. The app intentionally keeps
this separate from the unofficial endpoint client.

## When FotMob rotates the secret

If you start seeing `TURNSTILE_REQUIRED` or `403` on signed requests, FotMob
likely changed the signing secret. Find the new one by:

1. Open `https://www.fotmob.com` in a browser with DevTools → Network.
2. Pick any request to `/api/data/*` and copy the `x-mas` header value.
3. Base64-decode it; the JSON body contains `url` and `code` (ms timestamp).
4. Pull the FotMob JS bundle, search for `x-mas`, and follow the function that
   produces the signature — the secret is a string concatenated to the JSON
   body before MD5. It has been Rick Astley and Three Lions lyrics in the past.
5. Replace `SECRET_LYRICS` in `signing.ts` (no leading/trailing newlines,
   internal blank lines matter).

## Smoke test

```bash
docker compose exec ingestion-worker npm run fotmob:smoke -- 47
# arguments: leagueId season sampleCount
docker compose exec ingestion-worker npm run fotmob:smoke -- 47 2025/2026 10
```

A successful run reports `matchDetails sample: N/M matches returned detailed
payloads` with `hasPlayerStats: true` / `hasShotmap: true` for at least one
match.

## Run the actual backfill

```bash
docker compose exec ingestion-worker npm run ingestion:initial-backfill -- current_league_47
# or the full multi-league backfill (long-running)
docker compose exec ingestion-worker npm run ingestion:initial-backfill
docker compose exec ingestion-worker npm run ingestion:status
```

## Skipping broken fixtures

For modes that set `require_detailed_payloads: true` (e.g. `current_league_47`),
a single FotMob anomaly fails the whole job. Add the offending fixture id(s)
to `MACHETE_FOTMOB_SKIP_FIXTURE_IDS` in the host `.env`:

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
GET /api/data/match?id={matchId}
GET /api/data/matchDetails?matchId={matchId}
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

With signed `matchDetails` working, per-match player stats, the shotmap, and
team stats land in `details.raw.content.{playerStats,shotmap,stats,lineup}`
and feed the normal Machete snapshot/scoring pipeline.

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
