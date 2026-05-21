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

```bash
npm install                 # picks up playwright as an optional dependency
npx playwright install chromium

# .env
MACHETE_FOTMOB_PROVIDER_MODE="browser"
MACHETE_FOTMOB_BROWSER_HEADLESS="false"      # first run only, to solve Turnstile
MACHETE_FOTMOB_BROWSER_PROFILE_DIR=".cache/fotmob-browser-profile"

# Smoke test (default league 47 / Premier League):
npm run fotmob:smoke -- 47

# After the first successful run, flip headless back to "true".
```

The smoke script writes `tmp_fotmob_smoke/league-47.json`, `fixtures-47.json`, a sample `match-{id}.json`, and a `summary-47.json` that confirms which `content.*` sections are present (`playerStats`, `shotmap`, `lineup`, `matchFacts`).

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
