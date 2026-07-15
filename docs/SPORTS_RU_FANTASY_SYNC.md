# Sports.ru Current Fantasy Price Sync

The production price source is the current Sports.ru fantasy season GraphQL
feed. The importer never treats the small featured-player block on the public
landing page as a complete price list.

## Manual Dry Run

```bash
npm run prices:sync-sports-ru -- \
  --league-id=47 \
  --season=2026/2027 \
  --hru=england \
  --url=https://www.sports.ru/fantasy/football/england/ \
  --dry-run
```

The importer first resolves Sports.ru's `currentSeason`, then downloads every
`GOALKEEPER`, `DEFENDER`, `MIDFIELDER`, and `FORWARD` page. A normal sync
requires at least 100 unique players by default. It upserts the contest and
price snapshot transactionally, removes stale rows only after the replacement
snapshot has passed validation, and then refreshes player mappings.

If Sports.ru returns no current season, fewer than the minimum number of
players, GraphQL errors, or a network error, the operation fails closed. No
existing price row is deleted or replaced. On 2026-07-15 the official England
fantasy endpoint returned `currentSeason: null`, so 2026/27 real prices were not
yet available and the beta real-price criterion remained blocked. Estimated or
previous-season prices must not be relabelled as current real data.

## Scheduled Sync

```bash
SPORTS_RU_FANTASY_SYNC_ENABLED=true
SPORTS_RU_FANTASY_SYNC_SCOPES="47:2026/2027:england"
SPORTS_RU_FANTASY_SYNC_INTERVAL_HOURS=6
SPORTS_RU_FANTASY_MAXIMUM_AGE_HOURS=7
SPORTS_RU_FANTASY_MINIMUM_PLAYERS=100
SPORTS_RU_FANTASY_MINIMUM_MAPPED_PERCENT=98
```

Scope syntax is `<FotMob league id>:<season>:<Sports.ru tournament HRU>`;
multiple scopes are separated by `;`. The web process starts the first attempt
after five seconds and repeats it every 6 hours. `UNAVAILABLE` and error results
are structured warnings/errors and preserve the last valid snapshot.

`GET /api/health/fantasy-prices` returns `200` only when every configured scope
has a snapshot no older than 7 hours, at least 100 price rows, and at least 98%
player mapping. Missing, stale, sparse, weakly mapped, invalidly configured, or
unqueryable data returns `503`. Monitor this endpoint separately from container
liveness so stale data pages an operator without causing a restart loop.
