<a name="root"></a>

# Product {#root}

<a name="purpose"></a>

## Purpose {#purpose}

Fantasy Scout is a fantasy football scouting workspace. It turns provider data, price sheets, and match events into decisions about which players to buy, who is underpriced, and which shot profiles are real.

## Audience

- Admins operate leagues, ingestion, mappings, workbook imports, and model settings.
- Fantasy users browse players, compare projections and prices, and build legal squads.
- Analysts inspect attacking and conceded shot maps on normalized match shots.

## Main process

1. Ingest and normalize FotMob fixtures, rosters, player stats, shots, and events.
2. Import Sports.ru fantasy prices and map them onto FotMob players.
3. Calculate projections and value scores for squad planning.
4. Keep Baltika's Wyscout-style workbook import path for uploaded scouting tables.
5. Expose MiXerr shot maps and comparisons on the same normalized shots.

## Product modes

- **Machete** — FotMob-backed leagues, fixtures, stats, Sports.ru prices, projections, and squad planning.
- **Baltika** — Wyscout-style Excel imports, scouting tables, manual schedules, and configurable models.
- **MiXerr** — shot maps, xG overlays, and team or player shot comparisons.

## Boundaries

In scope today: cookie/session auth with admin and user roles, Prisma/PostgreSQL, FotMob ingestion, Sports.ru price mapping, squad planning, Baltika workbook imports, MiXerr shot maps, saved views, watchlists, and operational runbooks.

Out of scope for now: payments, multi-tenant organizations, live-match updates, public anonymous league hosting, and a generic spreadsheet ETL builder.

## Sources

These facts come from `README.md`, `docs/product/PRODUCT_BRIEF.md`, and `docs/reference/ARCHITECTURE.md`. Those files remain product documents; they are not typed Prist specifications.

<a name="changelog"></a>

## Changelog {#changelog}

- 2026-09-28: English repository documentation, topic-based navigation, and stable product-purpose anchors (WI-039).
