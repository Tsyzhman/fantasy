# Machete FotMob Import

Machete supports three FotMob provider modes:

```env
MACHETE_FOTMOB_PROVIDER_MODE="mock"
MACHETE_FOTMOB_PROVIDER_MODE="unofficial"
MACHETE_FOTMOB_PROVIDER_MODE="real"
```

`mock` is the default and uses local seed data.

`unofficial` calls FotMob public endpoints directly. Two layers of protection
have to be satisfied:

1. **x-mas signature** — required on `/api/data/matchDetails` and
   `/api/data/playerData`. The body is `{url, code, foo}`, signature =
   `MD5(JSON(body) + secretLyrics).toUpperCase()`, final header =
   `base64(JSON({body, signature}))`. Implemented in
   [`src/providers/fotmob/signing.ts`](../src/providers/fotmob/signing.ts).
2. **Cloudflare Turnstile session cookie** — set via
   `MACHETE_FOTMOB_COOKIE`. FotMob's frontend solves Turnstile silently when
   you load the site in a browser; the resulting `turnstile_verified` cookie
   is what unlocks signed endpoints. Without it the server returns
   `{error: "Verification required", code: "TURNSTILE_REQUIRED"}` regardless
   of how perfect the signature is.

Unsigned public endpoints (`/api/data/leagues`, `/api/data/fixtures`,
`/api/data/teams`, `/api/data/match`) work without any cookie or signature.

`real` is reserved for a licensed provider adapter.

## Setting up the Turnstile cookie

You need a real browser session ONCE. The cookie lasts several hours; refresh
when the worker starts logging `TurnstileRequiredError`.

1. Open `https://www.fotmob.com` in Chrome.
2. Click any finished match (e.g. a Premier League fixture).
3. DevTools (F12) → Network → filter `matchDetails`.
4. The frontend will fire `GET /api/data/matchDetails?matchId=...`. Right-click
   it → Copy → Copy as cURL (bash).
5. From the cURL command, copy the value passed via `-H 'cookie: ...'`.
6. Paste into your `.env` on the host:
   ```env
   MACHETE_FOTMOB_COOKIE="turnstile_verified=...; __cf_bm=...; ..."
   ```
7. Restart the worker so it picks up the new env:
   ```bash
   docker compose up -d --force-recreate ingestion-worker
   ```

If matchDetails still fails after a fresh cookie, FotMob may have rotated the
deploy marker. Discover the current value and set it explicitly:

```bash
curl -sI https://www.fotmob.com/api/data/leagues?id=47 | grep x-client-version
# x-client-version: production:<sha>
```

```env
MACHETE_FOTMOB_DEPLOY_ID="production:<sha>"
```

If the SECRET (Three Lions lyrics) itself rotates — rare, but it has happened
before — replace `SECRET_LYRICS` in `signing.ts` by decoding a fresh `x-mas`
header from DevTools (base64 → JSON; the `signature` is `MD5(JSON(body) +
lyrics)`).

## Smoke test

```bash
docker compose exec ingestion-worker npm run fotmob:smoke -- 47
docker compose exec ingestion-worker npm run fotmob:smoke -- 47 2025/2026 10
```

A successful run reports `matchDetails sample: N/M matches returned detailed
payloads` with `hasPlayerStats: true` / `hasShotmap: true`.

## Run the actual backfill

```bash
docker compose exec ingestion-worker npm run ingestion:initial-backfill -- current_league_47
# or the full multi-league backfill (long-running)
docker compose exec ingestion-worker npm run ingestion:initial-backfill
docker compose exec ingestion-worker npm run ingestion:status
```

## Reset stored data

If old broken rows are polluting the UI, wipe the FotMob-sourced match data
and re-run the backfill:

```bash
docker compose exec ingestion-worker npm run fotmob:reset -- --yes
```

This truncates `matches` and cascades to all dependent stats/shots/events/
fantasy points; keeps user data and the Machete league/team master rows.

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

## Custom database credentials

The `ingestion-worker` service uses `DATABASE_URL_INTERNAL` from `.env` if set,
otherwise the default `fantasy_app` role:

```env
DATABASE_URL_INTERNAL="postgresql://postgres:postgres@postgres:5432/fantasy_scout"
```

## Endpoint Mapping

```text
Unsigned (no cookie, no x-mas):
  GET /api/data/leagues?id={leagueId}&season={YYYY/YYYY}&ccode3={CCODE3}
  GET /api/data/teams?id={teamId}&ccode3={CCODE3}
  GET /api/data/fixtures?id={leagueId}&season={YYYY/YYYY}
  GET /api/data/match?id={matchId}            (basic info only)

Signed + Turnstile cookie required:
  GET /api/data/matchDetails?matchId={matchId}   (full content)
  GET /api/data/playerData?id={playerId}
```

## Seeded League IDs

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
