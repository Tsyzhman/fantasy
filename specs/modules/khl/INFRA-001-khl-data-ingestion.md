---
status: active
---

<a name="root"></a>

# INFRA-001: sources and regular import of KHL {#root}

<a name="plain-language"></a>

## Plain language {#plain-language}

Imports preserve sources and correction history separately from the football pipeline.

<a name="goal"></a>

## Goal {#goal}

Provide reproducible, resource-constrained downloads.

<a name="governing-specs"></a>

## Governing specifications {#governing-specs}

Product boundaries: `specs/common/main.md`; mutual contracts and exact links are listed in #relationships. Canon is active upon user request; source/rules gates determine the availability of relevant features, not the status of the document.


<a name="scope"></a>

## Scope {#scope}

Regular downloads, HTML parsing, normalization, storage and forecasting are performed without LLM. Data retrieval does not run on every user request. Each adapter returns a typed result, quality, provider IDs, source URL, watch and fetch time, parserVersion and hash; publishing a read model is atomic.

<a name="providers"></a>

## Suppliers and boundaries of proven {#providers}

New archival KHL ID connection is allowed only if the full name and position, as well as the number of games and all G/A/+/−/PIM amounts match the Sports history of the same season. Ambiguous names, different amounts and occupied canonical IDs are not automatically linked. Evidence preserves the basis of the connection. Matches of national teams are excluded according to official club IDs, even if the mobile API has returned the regular season stage.

The archive of the previous season is supplemented by the official KHL match protocols: the specific season and FINAL match are confirmed by the calendar, maximum 1000 matches; The official player ID is saved for each line. Match replays are not double-stacked. Matching to the current pool uses the confirmed KHL ID, new ambiguous names are left as passes. The exact amounts of SOG/TOI/PP/PK/attacks are calculated according to the PLAYED protocols; an attack column consisting entirely of zeros indicates unknown telemetry. Seasonal averages from the website table do not turn into fictitious exact amounts. Public normalized upload is transferred locally → server; raw HTML is not stored in the database.

| Data | Source and priority | Limit |
|---|---|---|
| Catalog, position, fantasy club, price, delta, lock | Sports.ru `GET /fantasy/hockey/team/create/107.json` | Reading, despite `create`; 694 unique ID, 22 club confirmed 7 September. This is a snapshot, not a completeness constant for future dates |
| FP history, exact time, G/A/+−/PIM, ownership %, week calendar | Sports.ru `/fantasy/hockey/player/info/107/{playerId}.html` | HTML parser with version. Previous season reviewed `?s=1317639`; do not confuse season ID with tournament ID |
| Matches, teams, line-ups of completed matches, goals/assists, deletions, starting six | `https://khl.api.webcaster.pro/api/khl_mobile/data.json`, `events_v2.json`, `event_v2.json` | Mobile backend does not promise a public SLA. stage_id=407 corresponds to khl_id=1436 in the check 6 September; compare seasons separately |
| TOI/PP TOI/PK TOI, shifts, shots, blocks, SV/GA | Protocols khl.ru `/game/{season}/{match}/protocol/` | Fields found in browser; production HTTP/REST upload and resolution have not yet been confirmed. An alternative is a licensed supplier with proven KHL coverage |
| Injuries | Section “Injured” of club applications khl.ru | Not a complete register of all injuries. Disappearance from the list does not in itself prove readiness to play |
| Ready xG | Separately selected supplier: KHL/Wisesport or other with verified KHL | The existence of the indicator is confirmed; automatic upload not found. Mandatory dependency XG-01 below |
| Odds | Fonbet | Separate hockey adapter according to INFRA-003 |
| Future start of the goalkeeper, PP1/PP2, full links | Until a reliable automatic source is confirmed | Fact, forecast and unknown are separate; played does not prove starter |

Do not select Goalserve/Statorium/Sportradar based on the NHL description. Check separately the season, regular season, playoffs, fields and storage rights of the KHL. In Global Hockey Sportradar starter/played are not distinguished in the verified documentation - such a flag cannot be called a confirmed start.

### Confirmed partial import, 8 September 2026

Public anonymous Sports.ru cards of the current competition 107 are available for limited reading upon user request. Checked 693 profiles of the current catalog: real FP, TOI, G/A/+−/PIM and SV/GA goalkeepers. Numeric tag, `/hockey/person/{slug}/` and root vanity profile are possible; the main identity is the exact requested fantasy player ID, additionally checked by tag if available, position, season and explicitly matched club. The provider's history table may not cover the tbody; the absence of a table for a beginner means an unknown history. Zero TOI means DNP: such a line is not included in the average of matches played and FP. The PLAYED→DNP correction revokes the previously published FP while preserving the revision evidence.

22 Sports.ru club ID/slug are mapped to the official KHL team ID by an explicit table. The match is determined by the Moscow date, this ID and home/away, then the score is reconciled; the ambiguous line remains quarantine. The match page slug is not a unique match ID. The current club opens membership with an observation date, without a fictitious transfer date. Fantasy week numbers are stored from `verified=false`: exact boundaries have not been proven.

Source contract `SPORTS_RU_STATS` uses `PUBLIC_READ` and only the actual capabilities listed. These are technically verified public readings and not a statement of commercial license or implementation of a full protocol/xG gate. Direct HTTP protocol khl.ru responded 403; bypass is not applied. PP/PK TOI, xG, lines and confirmed future starts remain unknown. Forecast readiness is not enabled.

<a name="protocols"></a>

## Match reports as a source of statistics {#protocols}

At the request of 2026-09-11, seasonal indicators are calculated from unique player-match protocols. The season page is not the source of amounts. The official protocol stores TOI, PP/PK, time on attack (TBA), G/A, SOG, blocks, shifts, PIM, +/− and goalie SV/GA. Sports.ru remains the source of official fantasy FP. Priority of match fields: full KHL protocol, then limited Sports.ru history; Sports.ru replay does not overwrite the proven protocol.

HTML adapter accepts tables with verified headers, official match/player IDs and scope. The transport does not bypass CAPTCHA/403 and does not copy user sessions. Browser-ready tables can be imported locally; unattended transport publishes only successfully verified responses. An empty VVA and no telemetry remain null. A completely zero BBA column in the absence of team time in attack does not prove 0 seconds to all players.

Reloading replaces the facts of a particular match, then recalculates the sum; does not add again. The sum contains coverage: the number of matches played and the number of matches with a filled field. Incomplete amounts are clearly marked as partial. The average is calculated only for matches with a known value; missing is not equal to 0.

<a name="xg-gate"></a>

## Ready xG: selection criteria {#xg-gate}

XG-01 - unclosed dependency, not promised API. Before starting a forecast with xG you need:

1. A proven method of regularly obtaining from a production environment, storage/use permission, limits and cost, documented by correction and retry.
2. Dictionary of metrics: individual field xG per match and team xG per match; separately on-ice xG, xGA, GSAx/xG−, EV/PP/PK, accounting for OT, shootouts, empty goals. You cannot pass off team xG or GSAx as individual ixG.
3. Stable player/team/match IDs and mapping. Provider model version, event time and moment of availability for historical backtest; unknown modelVersion stored explicitly.
4. Acceptance set: all clubs of the season, at least 100 completed matches, last 30 days of the season (or all played at the start), one previous full regular season for backtest. Successful re-import and correction of one match.
5. Proposed release threshold: ≥95% set matches with team xG and ≥95% played player-match outfield with individual xG; no club <90%; There is a separate denominator for each field. 0 - valid observation, null - uncovered. Delivery no later than 24 hours after the match in ≥95% cases on 14- day observation. These numbers are project requirements, not the vendor's stated SLA.
6. Amount consistency as determined by supplier; deviations and incomplete coverage cannot be corrected by dividing the team xG between players.

Without XG-01 the catalog and local options can work. The forecast is marked `XG_UNAVAILABLE`; a major release promising xG is not accepted. The base forecast without xG is only valid as an explicitly separate beta function; Do not create your own shot-xG model automatically. The xGA/GSAx fields for the goalkeeper are optional and do not block the directory; their absence is visible separately.

<a name="normalization"></a>

## ID, parsing and reconciliation {#normalization}

- Internal hockey UUID/CUID are not equal to external numbers. Key mapping: provider + entityType + providerScope + externalId; Sports.ru id and tag_id are saved separately.
- Mobile event `3000059` and official match `901980` are different IDs of one verified match of the season 1436/stage 407. Check dates and commands when linking. Names/transliteration + club + date of birth - candidates; ambiguity in quarantine, without automatic merging by last name.
- The fantasy club determines the limit and availability of purchases, the match club determines historical statistics. A real transition does not overwrite past player-match lines.
- `start_at` mobile - milliseconds, time filters - seconds. The calendar request has both borders, sorting, all pages, watermark control. Default 16 entries are not a complete calendar; take into account both type_id=18 completed and future 24.
- An empty `players/start_fives` of a future match does not mean refusal to participate. The seasonal unit may lag: confirmed player-matches are higher than the seasonal “0 games”.
- `20:50` store as 1250 seconds; `06:05` PP as 365; `00:44` PK as 44. Do not disassemble 20:50 as 20.5 minutes. The proven Gregoire is a control fixture.
- TOI/PP/PK, SV, GA, PIM and other unknown fields are nullable. The parser distinguishes between an empty cell, a stub, the number 0 and the absence of a player. Amounts are invalid when mixing full-game and per-game/season headers.
- The khl.ru map shows only verified shots on target: 60 (26+34), 5 goals with 100 attempts in the example. Desktop/mobile give 120 DOM points, the mobile system is rotated `x'=100-y, y'=x`. If the map is later imported, select one view, check the fingerprint; it is not a complete map of attempts or a source of your own xG. Map import is not needed for the first version.
- `/rest/game/{header,text,protocol}/`, `/rest/clubs/team/` were detected in the browser, but request contracts were not verified. Don't declare them as ready-made APIs. Browser fallback is allowed only after technical and legal verification, without bypassing 403 and security measures.

<a name="operations"></a>

## Update, cache and resources {#operations}

The initial settings below are limited budgets for the pilot, adjusted according to supplier conditions and measurements, but not automatically increased in case of errors.

| Object | Schedule / TTL | Old data |
|---|---|---|
| Catalog/prices | Every 15 min; every 60 s in the window −60 min…unlocking matches | To save the transfer scenario price ≤5 min, lock ≤60 s; otherwise require background update |
| Calendar | Every 60 min, next 48 hours every 5 min | Changing the date/status immediately invalidates plans; overdue >2 h blocks new recommendations |
| Match Statistics/FP | After completion, re-+1 h, +24 h, +72 h; rolling reconciliation of the last 7 days | Early result provisional; the original official FP and calculation are stored separately |
| Card history | Changed/played players; full catalog once a day | Do not pump cards 694 every minute |
| Injuries | Every 60 min, before matches according to permissible limits | >2 h stale; “not on the list” not “healthy” |
| xG | According to the agreed supplier schedule, re-verification of corrections | Unavailability does not turn into 0; save the last fact with prescription |
| Read model | Set version; cache TTL up to 5 min, invalidation according to revisions | UI reads the last complete published set with status |

One task per provider/scope, lease in the database with heartbeat and reclaim after expiration; cron and multiple processes do not duplicate work. Don't use only process-global Set as protection. Initially 2 HTTP requests simultaneously to the provider, 4 in total, timeout 20 s, up to 3 attempts with jitter and Retry-After; 401/403/schema drift stops the adapter until the cause is analyzed. Limit response 20 MiB, DB page 500 rows, queue 1000 tasks with backpressure. Don't keep the whole season/raw in your memory.

Raw cache: content-addressed hash + parserVersion, compressed, 7 days and total ceiling 250 MiB on KHL; Individual impersonal regression fixtures are not subject to purification. If the license conditions are stricter, they take precedence. Errors metadata 30 days; pool READY latest 3 revisions on scope, do not delete the active link. Forecast/odds features of the solutions used are stored as compact evidence for a season + 90 days with permitted storage.

In-memory read cache: max 50 keys and 64 MiB per process; If the LRU/TTL is exceeded, exceptions and canceled promises are not cached forever. The key includes `sport=ICE_HOCKEY`, contest/season/week, filters, historyWindow, rule/model versions, data/price/status/schedule/odds/xg revisions. User keys additionally user/franchise/squad/version. The transition between FPL/KHL does not share user state.

Idempotent repeat does not change the number of entity/price revisions; a new revision only when the value changes, lastSeenAt is updated separately. At each stage, metrics: inserted/updated/unchanged/quarantined, coverage/null, staleness, HTTP errors, dedup hits, cache bytes, queue depth/oldest age, RSS/heap. The cleaning is scoped and does not affect football or other people's files.

### Implemented limited history launch

`KHL_STATS_SYNC_ENABLED=true`, together with general sync, includes only workers. Every 60 seconds after the previous batch, a maximum of 20 cards are processed, sequentially with a pause of 300 ms, timeout 20 s and a size of up to 2 MiB. Each player's checkpoint allows a partially completed import to continue. Cards are updated when the price changes or the last completed match of the club and at least once a day. The calendar is updated once every hour in the range −13/+28 days. Exact correction intervals +1/+24/+72 and full seasonal backfill remain requirements above, and not the stated readiness of this partial launch.

The initial loading is continued by the same fenced coordinator: `node scripts/khl-runner.cjs statistics CONTEST --all` in the worker image; limit 100 batches per launch. HTML is not saved in the runtime cache, normalized changes are versioned, replay preserves the number of revisions. Limited source coverage/checkpoints save the number of processed profiles and quarantine. History outside the already loaded calendar is not published until it is expanded.

<a name="acceptance"></a>

## Acceptance criteria {#acceptance}

- ING-01: two repetitions of one batch give the same normalized lines, there is no double event/player-match; failure in the middle is recovered from checkpoint.
- ING-02: catalogs and calendar are verified on all pages; unknown club, role and ID conflict give quarantine, not silent exclusion from denominator.
- ING-03: 1250/365/44 control player seconds, nullable PP/SV, lagging aggregates and empty future lineups are parsed correctly.
- ING-04: all clubs of the season are presented; ≥99% directory has unambiguous mapping statistics, 100% selected in the recommended squad are mapped. Unmatched ones are visible to the user.
- ING-05: ≥95% completed player-matches from the acceptance set are covered with field TOI and PP TOI, ≥95% participating goalie-matches have SV/GA/TOI. Otherwise, sentences with the corresponding attribute do not pass readiness.
- ING-06: 14-day staging soak without LLM, without duplicate jobs, without bounded cache growth; After warming up heap/RSS plateau, growth >10% between comparable windows requires parsing.
- XG-01 is only accepted for all six supplier check points above; Posts and marketing pages do not pass this criterion.

<a name="relationships"></a>

## Related specifications {#relationships}

`spec://modules/khl/INFRA-002-khl-storage-and-api#schema`, `spec://modules/khl/INFRA-003-khl-fonbet-odds#root`, `spec://modules/khl/FEAT-003-khl-projections-and-optimizer#inputs`.

<a name="changelog"></a>

## Changelog {#changelog}

- 2026-09-28: English documentation, repaired document references, and GitHub navigation anchors (WI-039).

- 2026-09-14: full cycle of MSC sources 10:00/20:00, independent error results, limited packages and inter-process lock. The exact upper bound of the calendar is filtered locally after the provider rounds to the day. The conflict of the unconfirmed assignment of the week from the Sports card is isolated in quarantine without rolling back its correct historical facts (WI-023).

- 2026-09-08: Sports.ru public cards have been confirmed, partial capabilities, DNP/corrections, exact matching and bounded worker/CLI are described; protocol/xG gates are saved.

- 2026-09-07: during integration, the original anchors and requirements are preserved; added mandatory sections of the current standalone protocol and implementation trace. Draft gates have not been removed.

- 2026-09-07: source contracts, unclosed gate xG and resource budgets have been created. The import did not start.

<a name="environments"></a>

## Environments and dependencies {#environments}

Local PostgreSQL used for fixtures; production transport is enabled only after confirmation of the source (#providers/#xg-gate).

<a name="decisions"></a>

## Canonical decisions {#decisions}

Exact external IDs and quarantine instead of fuzzy merge; the finished player-match xG goes through a separate gate (#normalization/#xg-gate).

<a name="runtime"></a>

## Runtime and operations {#runtime}

The full cycle of statistics is launched by a server script daily in 10:00 and 20:00 Europe/Moscow. The cycle includes the Sports catalog, KHL Mobile calendar, current and past Sports history, current and available archived KHL minutes, Fonbet odds and EP publication. Limited packages are used, an inter-process lock shared with deploy (waiting for release up to 30 minutes before stopping the worker, waiting for the collector up to 5 minutes) and saved checkpoints; The completed archive is not downloaded again twice a day; gaps and the due date of the update are checked. Unavailability of the source saves last-good data and a separate error result; You cannot declare a loop to be completely successful if the source is missing. EP recalculation and line updates throughout the day maintain the current freshness contract, separate from two full stat cycles.

Coordinator executes jobs with lease/heartbeat, limited retries and checkpoints (#operations).

<a name="data"></a>

## Data and state {#data}

Normalized observations, provenance, revisions and limited gzip raw payloads (#normalization/#operations).

<a name="contracts"></a>

## Contracts {#contracts}

The history of the last season Sports is loaded through the #slt selector of the current identity-checked card: /fantasy/hockey/player/info/{contest}/{player}.html?s={providerSeasonId}. The seasonKey/ID pair is taken from the published list and is not guessed. The archive re-checks the tag ID (or the exact full name of the confirmed current card), position, selected season, date ranges and uniqueness of matches. Completed matches with TOI=0 - DNP, null - unknown. Limit 2 MiB per response, 100 history lines, 20 profiles per pass, no network requests within a transaction. The missing season is recorded in the bounded checkpoint; the error does not delete the previous snapshot. The import repeats idempotently and updates the revision of dependent tournaments only when facts change.

Schema, ID, coverage, observedAt and source rights are checked before publication. Repeating A→A does not create a new revision.

<a name="recovery"></a>

## Rollout, rollback, and recovery {#recovery}

Redelivery is idempotent; the lost lease worker does not publish the result. Old correct observations are preserved.

<a name="observability"></a>

## Observability {#observability}

Health, freshness, quarantine, raw size, active queue and process cache are measured by #operations.

<a name="traceability"></a>

## Implementation traceability {#traceability}

src/server/khl/coordinator.ts, observations.ts, jobs.ts, retention.ts; src/khl/data-layer.db-test.ts. Final acceptance is determined by #acceptance; implementation status - docs/guides/KHL_IMPLEMENTATION_STATUS.md.

- 2026-09-11: the canon of the realized contour is activated; added protocols, BBA and seasonal amounts with coverage.

Server protocol worker uses a queue and lease, up to two matches per pass, re-checking known matches no more than 24 hours. HTTP 401/403 opens requests for a day, other errors - for at least an hour; Changing the IP, bypassing the anti-bot and replacing the response are not used. Maximum HTML 5 MiB, timeout 30 seconds, redirects are prohibited. Raw is stored with deduplication and the existing budget 250 MiB/7 days. Importing locally stored tables uses the same parser and normalization path.

- 2026-09-13: Sports Last Season Archive, Normalized Limited Storage, New Metrics and EP Explained; numeric display up to two decimal digits.

- 2026-09-14: deploy and daily use a common host lock; the release waits up to 30 minutes before stopping the worker, the scheduled launch waits until 5 minutes to complete the replacement of containers.
