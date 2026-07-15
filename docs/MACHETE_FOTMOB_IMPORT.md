# Machete FotMob Import

Machete supports three FotMob provider modes:

```env
MACHETE_FOTMOB_PROVIDER_MODE="mock"
MACHETE_FOTMOB_PROVIDER_MODE="unofficial"
MACHETE_FOTMOB_PROVIDER_MODE="real"
```

`mock` is the default and uses local seed data.

`unofficial` calls FotMob public endpoints directly. Two transport layers:

* **Unsigned `/api/data/*`** for league / team / fixtures / single-match
  summaries. Plain GET, no headers, edge-cached at CloudFront.
* **Unsigned `/_next/data/{buildId}/match/{matchId}/playbyplay.json`** for
  the full match payload (matchFacts, playerStats, shotmap, lineup, stats,
  …). This is the same content shape that the signed `/api/data/matchDetails`
  endpoint returns, but indexed by matchId in the URL path and not gated by
  Cloudflare Turnstile. The Next.js buildId is parsed out of the homepage
  HTML once per session and refreshed automatically on 404.

There is no x-mas signature or cookie required for the main ingestion flow.
Signing + `MACHETE_FOTMOB_COOKIE` are only relevant if you use `getPlayer`
(signed `/api/data/playerData`), which is currently a secondary path.

`real` is reserved for a licensed provider adapter.

## How the playbyplay endpoint dodges the slug-collision trap

The intuitive next-data path `/match/{id}.json` → 308 redirect to
`/matches/{slug}` → fetch `/matches/{slug}.json` does NOT work. FotMob's
slugs are per team-pair, not per match, so for any home/away pair (e.g.
Liverpool vs Bournemouth round 1 vs round 23) FotMob serves the canonical
match's data for both. Validators in this codebase catch the mismatch and
treat the payload as unavailable.

`/match/{matchId}/playbyplay.json` is a separate Next.js page whose getter
takes matchId as the URL parameter directly. It returns the exact match we
ask for, with the full content tree intact. Verified against finished PL
matches across the 2024/25 and 2025/26 seasons: 100% success rate, all
matchIds returned exactly as requested.

## Smoke test

```bash
docker compose --profile setup run --rm db-setup npm run fotmob:smoke -- 47
docker compose --profile setup run --rm db-setup npm run fotmob:smoke -- 47 2025/2026 10
```

A successful run reports `matchDetails sample: N/M matches returned detailed
payloads` with `hasPlayerStats: true` / `hasShotmap: true` for the sample.

## Run the actual backfill

```bash
docker compose --profile setup run --rm db-setup npm run ingestion:queue-initial-backfill -- current_league_47
# Full multi-league backfill (long-running)
docker compose --profile setup run --rm db-setup npm run ingestion:queue-initial-backfill
docker compose --profile setup run --rm db-setup npm run ingestion:status
```

## Reset stored data

If stale rows from a broken earlier run pollute the UI, wipe FotMob-sourced
match data and re-run the backfill:

```bash
docker compose --profile setup run --rm db-setup npm run fotmob:reset -- --yes
```

This truncates `matches` and cascades to all dependent stats/shots/events/
fantasy points; user data and Machete league/team master rows survive.

## When FotMob's deploy or schema rotates

The playbyplay path is keyed on the Next.js `buildId`. Every FotMob deploy
mints a new buildId. The client refetches it once on a 404 and caches the
result for the session. If smoke suddenly fails on every match with
`buildId-related` errors, check the homepage:

```bash
curl -s https://www.fotmob.com/ | grep -oE '"buildId":"[^"]+"'
```

If FotMob ever drops the `playbyplay.json` route (it has existed for a long
time but is undocumented), fall back to the signed `/api/data/matchDetails`
+ Turnstile cookie flow — see commit history for the previous implementation.

## Skipping broken fixtures

For modes that set `require_detailed_payloads: true` (e.g. `current_league_47`),
a single FotMob anomaly fails the whole job. Add the offending fixture id(s)
to `MACHETE_FOTMOB_SKIP_FIXTURE_IDS` in the host `.env`:

```env
MACHETE_FOTMOB_SKIP_FIXTURE_IDS="4813374,4813380"
```

```bash
docker compose up -d --force-recreate web
docker compose --profile setup run --rm db-setup npm run ingestion:queue-initial-backfill -- current_league_47
```

## Custom database credentials

```env
DATABASE_URL_INTERNAL="postgresql://fantasy_app:fantasy_app_password@postgres:5432/fantasy_scout"
```

## Endpoint Mapping

```text
Unsigned (no cookie, no x-mas):
  GET /api/data/leagues?id={leagueId}&ccode3={CCODE3}                (metadata/season discovery)
  GET /api/data/leagues?id={leagueId}&season={YYYY/YYYY}&ccode3={CCODE3}
  GET /api/data/teams?id={teamId}&ccode3={CCODE3}
  GET /api/data/fixtures?id={leagueId}&season={YYYY/YYYY}           (fixtures fallback)
  GET /api/data/match?id={matchId}                                  (summary)
  GET /_next/data/{buildId}/match/{matchId}/playbyplay.json         (full content)

Signed + Turnstile cookie required (only used by getPlayer today):
  GET /api/data/playerData?id={playerId}
```

Run metadata sync before teams and fixtures. Metadata discovery intentionally
omits a stored season so summer rollover can select FotMob's current season;
passing the old season here would keep the league pinned to stale metadata.
Fixture sync then requests the discovered season and prefers
`leagues.fixtures.allMatches`, because it contains round numbers. The separate
`/api/data/fixtures` response remains a fallback when the league response has no
usable fixture array.

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

Machete normalizes provider responses directly into:

```text
MacheteLeague
MacheteTeam
MachetePlayer
MacheteFixture
MachetePlayerMatchStat
MachetePlayerSnapshot
```

Legacy `MacheteRawPayload` rows are not written by default. Set
`MACHETE_STORE_RAW_PAYLOADS=true` only for short-lived debugging, then run
`npm run payloads:prune-machete -- --yes`.

## Local Team Logos

Machete team sync prefers local repository logos from `public/team-logos` over FotMob CDN URLs. Matching uses the seeded `fotMobLeagueId`, team name, short name, and aliases from `src/lib/leagues/seed-data.ts`.
