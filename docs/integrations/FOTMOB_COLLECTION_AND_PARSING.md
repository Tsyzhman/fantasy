# FotMob data collection and analysis

This memo is intended for the AI agent. It is intentionally not tied to the names of files, functions, classes or screens of the project. It describes the actual method of retrieving the data, the JSON parsing logic, and the recommended scheme for reliable collection.

## Briefly

The API is used: unofficial internal JSON endpoints of the FotMob site. This is not HTML page parsing or browser automation. Data is retrieved using regular HTTP GET requests.

However, this is not an official licensed API with an issued key, a published contract and a guarantee of stability. The same internal endpoints that the FotMob website accesses are used. So the method is technically working with an API, but that API may change the URL or structure of the response without warning.

Full match data is obtained through the internal Next.js endpoint:

```text
https://www.fotmob.com/_next/data/{buildId}/match/{matchId}/playbyplay.json
```

`buildId` is extracted from the HTML of the FotMob home page. This endpoint returns the exact match of `matchId` and does not require a `x-mas` signature, cookie, or passing Cloudflare Turnstile.

The main principle of collection:

```text
лига и сезон
→ состав участников и ростеры
→ список матчей
→ краткая карточка каждого матча
→ полный JSON каждого матча
→ проверка ответа
→ нормализация
→ идемпотентная запись
```

### What APIs are used

There are two types of API requests in the main thread:

1. Internal web API under the prefix `https://www.fotmob.com/api/data/`. Through it you get the league, teams, rosters, calendar and a short match card.
2. Internal Next.js data API under the prefix `https://www.fotmob.com/_next/data/`. Through it, the full JSON of a specific match is obtained with statistics of players, teams, shots, events and lineup.

HTML is used only as a service step: the current `buildId` needed for the Next.js data API URL is retrieved from the main page. The football data itself is not extracted from the HTML.

Practical classification:

| Question | Answer |
| --- | --- |
| Is the API being used? | Yes |
| Is this the official FotMob public API? | No |
| Do I need an API key for the main collection? | No |
| Do you need a headless browser? | No |
| Is football data parsed from HTML? | No |
| What is being parsed? | JSON responses of internal API |
| Is there a guarantee of circuit stability? | No |

## How exactly do we get the data?

### 1. League metadata, teams and match list

Queries used:

```http
GET https://www.fotmob.com/api/data/leagues?id={leagueId}&season={season}&ccode3=GBR
GET https://www.fotmob.com/api/data/teams?id={teamId}&ccode3=GBR
GET https://www.fotmob.com/api/data/fixtures?id={leagueId}&season={season}&ccode3=GBR&timezone=Europe/London
```

To determine the current season, metadata sync first calls league endpoint
without saved `season`. Only after the season update are the commands and
matches. This prevents you from getting stuck on the previous season after the summer rollover.

When retrieving matches, an array is first used:

```text
fixtures.allMatches
```

from the league's response. It is preferable to a separate match list request because it usually contains the match number. A separate endpoint for the list of matches is a fallback option if the league’s response does not contain a suitable array.

Teams are first taken from the standings:

```text
table[].data.table.all[]
```

If there is no table, teams are extracted from home and away matches. Stub values ​​like `TBD`, `Winner A`, `W12` are discarded. After this, for each numeric `teamId`, the team card and its roster are downloaded separately.

The season is converted to its full form: for example, `2025/26` becomes `2025/2026`. For tournaments designated by one year, that year is used without an artificial range.

### 2. Brief match card

Before a full response, the following is requested:

```http
GET https://www.fotmob.com/api/data/match?id={matchId}
```

It provides basic information about the match: participants, date, score and status. An empty response or a card without valid identifiers is considered an error rather than a successful import.

### 3. Full JSON of the match

First, the main page is loaded once per process:

```http
GET https://www.fotmob.com/
```

Extracts from HTML using a regular expression:

```regex
"buildId":"([^"]+)"
```

Then executes:

```http
GET https://www.fotmob.com/_next/data/{buildId}/match/{matchId}/playbyplay.json
```

The object `pageProps` is taken from the response. It expects:

```text
general
header
content.matchFacts
content.playerStats
content.shotmap
content.stats
content.lineup
```

The presence of at least one detailed section is sufficient for the response to be considered detailed at the transport level. For high-quality production collection, this condition is not enough - a more stringent check is described below.

`buildId` is cached in memory. If the full JSON request returned `404`, `buildId` is reset, re-fetched from the main page, and then the match request is repeated once with the new value.

### Why the URL is not used via slug

You should not receive full JSON through a redirect from the conditional `/match/{id}.json` to `/matches/{slug}`. A Slug can be common for several matches of one pair of teams. In this case, FotMob is able to return another match of the same pair.

Endpoint `playbyplay.json` uses `matchId` directly in the URL, so once the response is received, all that's left to do is check that the ID matches.

### Signature and cookie

The main collection does not use `x-mas` and cookies.

The signed individual player data endpoint is a secondary path. It may require both `x-mas` and a current cookie with a passed Turnstile. For the main import, players are collected from team squads, lineups, statistics, shots and match events, so this endpoint is not needed.

Unless source mode is explicitly switched to unofficial HTTP endpoints, the project uses local test data. For real collection this switching is necessary.

## Transport protection

Requests are sent with the usual browser-like headers:

```text
User-Agent
Accept
Accept-Language
Referer
```

Current secure scheme:

- timeout for one request - 20 seconds;
- minimum interval between requests - 1500 ms;
- queries are executed sequentially;
- for regular JSON requests - up to 5 attempts;
- for Next.js JSON - up to 3 attempts;
- retries use exponential delay from 750 ms and random jitter up to 500 ms;
- for `403`/`429`, if not Turnstile, use a longer base delay of 3 seconds;
- Turnstile error does not repeat indefinitely: it is considered permanent for the current session.

This is slow, but safer than aggressive parallel traversal. The speed limit cannot be disabled during mass gatherings.

## Checking the full answer

Before parsing, the following must be checked:

1. The response is JSON.
2. The response contains a non-empty `pageProps`.
3. The ID of `general.matchId`, `header.matchId`, root `matchId`, or `id` is strictly equal to the requested `matchId`.
4. `content` has at least one detailed section: `playerStats`, `shotmap`, `lineup`, `stats`, or `matchFacts`.

An ID mismatch cannot be corrected by substituting the requested ID. This answer must be rejected, otherwise the statistics of one match will be recorded in another.

## How JSON is parsed

### General context of the match

The base fields are read with several fallbacks because the response form was changing:

- match ID - from root, `general` or `header`;
- league and season - from wrapper, root, `general` or `header`;
- hosts and guests - from `general`, `header`, root `home`/`away` or an array of commands;
- status - from `status`, `header.status` or `general.status`;
- time - first of all UTC fields, then other dates;
- account - from command cards or root fields;
- round - from `round`, `roundName` and similar fields.

League, team, player and match identifiers are considered authoritative source identifiers and are stored as integers. The name is not used as the primary key.

### Teams and players

Two teams are created for the match - home and away. Players are united by the number `playerId` from several sources:

- player statistics;
- starting lineup and substitutes;
- beats;
- goals, cards, substitutions and other events;
- nested player objects inside full JSON.

If a name is found in one section, but the participation and team are found in another, the information is combined by `playerId`.

### Player Statistics

The exact paths are checked first:

```text
playerStats
content.playerStats
content.lineup.playerStats
content.lineup.lineup
content.lineups
lineups
```

Arrays are expanded recursively through containers:

```text
players
members
lineup
starters
substitutes
subs
```

When expanding down, the command context is transferred. For `starters`, the exit flag is additionally set at the start. If the statistics does not contain a team, it is supplemented from the lineup by `playerId`.

Numbers are read in two passes:

1. direct fields and known variants of their names;
2. recursive search inside `stats`, `groups`, `items`, `children`, `sections` using the normalized signature of the indicator.

The signature is converted to lower case, and parentheses, spaces and punctuation are removed. The nested value is retrieved from `value`, `displayValue`, `total`, or `stat.value`.

Normalized at a minimum:

- minutes, position, number, start and substitutions;
- goals, assists, cards, saves, missed goals and clean sheet;
- `xG`, `xGOT`, `xA`;
- shots and shots on target;
- created chances and key passes;
- tackles, interceptions, clearances, won duels and horse duels;
- returns of possession, touches in the penalty area, earned fouls and penalties;
- rating.

The missing value remains `null`. It cannot be automatically converted to `0`: the source often simply does not send the indicator.

### Team statistics

Main source:

```text
content.stats.Periods.All.stats
```

The structure is traversed recursively through `stats`, `groups`, `items`, `children`, `sections`. From each line, the indicator signature and a pair of host/guest values ​​are taken.

Supports numbers, decimals with a period or comma, and percentages. Values ​​like `421 / 487` are not reported as one number.

Disassembled:

- account;
- `xG`, `xGOT`, `xA`;
- shots, on target, wide, blocks;
- big chances and missed big chances;
- touches in the penalty area;
- possession, passes, accurate passes and accuracy;
- corners, offsides, fouls, cards;
- tackles, interceptions, clearances and saves.

If a strike unit is missing in team statistics, it is restored according to `content.shotmap.shots`: shots, goals, target, blocks, sum `xG` and sum `xGOT` are counted. If the command `xA` is missing, the sum of the found individual `xA` is used.

Two lines of team statistics are expected for one match: one for the hosts, one for the guests.

### Beats

Main path:

```text
content.shotmap.shots
```

Known exact paths are checked first. If they are not found, a limited search is performed on a nested array similar to the beat array. The array is recognized as suitable by the presence of coordinates, `expectedGoals`, `playerId` or `teamId`.

For each beat, the following are extracted:

- match, team, opponent and player;
- minute and added time;
- original `x` and `y`;
- event type, impact type, body part and situation;
- goal, target, block and big chance;
- `xG` and `xGOT`.

FotMob coordinates in field `105 × 68` are converted to percentage `0–100`. If the attack direction is explicitly specified from right to left, the longitudinal coordinate is reflected. If the direction is not specified, the coordinates are only scaled - you cannot invent a direction.

To protect against duplicates, a stable fingerprint is built from the match, team, player, minute, added time, coordinates, event type and original event ID.

### Events

Events are searched along the following paths:

```text
content.matchFacts.events.events
content.matchFacts.events
content.events.events
content.events
events
incidents
```

Team, main and associated player, minute, added time, type and subtype are retrieved. The attributes of a goal, assist, own goal, penalty, card and substitution are separately normalized.

Objects with impact coordinates are not considered regular events, even if they are nearby in JSON.

### Restoring connections

After the initial parsing, a second pass is performed:

- team is restored based on home/away;
- opponent is defined as the other team of the match;
- a player's missing team is restored based on that player's unique association with a statistic, hit, or event;
- event command is restored by the main or associated player;
- An own goal is not used as evidence of a player's normal team affiliation;
- stat lines without a positive team or player ID are discarded;
- The number of links restored and dropped is counted as a quality metric.

## How data is being recorded now

The normalized result is written transactionally and idempotently:

- match - by `matchId`;
- team statistics - for a pair `matchId + teamId`;
- player statistics - for the pair `matchId + playerId`;
- blow - on `matchId + fingerprint`;
- events before the new entry are completely replaced for the match;
- missing reference entities are temporarily created as placeholders to avoid breaking foreign keys;
- after the real data appears, placeholders are updated;
- After changing strikes, the associated strike map cache is reset.

For an unfinished match, the full JSON is stored along with the hash, parser version, and schema version. For a completed match with a detailed payload, the raw JSON is now removed after successful normalization.

A completed match is skipped on the next normal start if there is already at least one normalized line of team statistics, player statistics or shot in the database. To re-receive, you need a forced refresh, and to re-parse, you need a saved raw payload.

After player statistics, derivative fantasy indicators can be calculated separately. This is no longer part of FotMob parsing.

## How to collect better

### 1. Separate detection and loading of parts

Don't make one long "form a league" request. First, save the list of matches and their statuses, then create a separate task for each `matchId`. This gives independent replays, clear progression, and resuming after failure.

### 2. Store raw data separately from normalized data

Best option:

```text
raw JSON + hash + fetched_at + parser_version + schema_version
→ проверка
→ нормализованные таблицы
```

Raw JSON of completed matches is best stored compressed in cheap object storage rather than deleted entirely. Otherwise, after fixing the parser, the history will have to be downloaded again, and if the endpoint changes, it will be impossible to restore the old data.

The minimum acceptable compromise is to store the latest raw, its hash and a link to the archive. If the new hash matches the old one, re-parsing is not necessary.

### 3. Introduce an explicit sign of completeness

The “there is at least one normalized row” check is too weak. For a completed match, you need to save certain signs:

```text
metadata_ok
team_stats_ok
player_stats_ok
shots_ok
events_ok
payload_validated
normalized_at
```

A match can only be declared fully assembled under a specific product contract. For example, for fantasy, player statistics are required, and for a map of hits, an array of hits or clear evidence that there were zero hits.

### 4. Don't confuse empty value with no section

`shots: []` could mean a real no-kicks match, and missing `shotmap` is an incomplete answer. Similarly, `0` and `null` have different meanings. In the raw layer you need to store information about the presence of the partition itself.

### 5. Update based on match status

Recommended mode:

- roasters and calendar - 1–4 times a day;
- matches before start - update only for time, round and transfers;
- live - every 1–2 minutes with a limitation of the total load;
- just completed - repeat after 10 minutes, 1 hour and 24 hours, because the source can correct the statistics;
- old completed and fully tested - do not request without reason;
- after changing the parser version, parse the saved raw, rather than download the entire archive again.

### 6. Limit concurrency

Safe start - one request at a time with an interval of at least 1.5 seconds. If you need speed, it is better to have several independent queues with a common limiter, but not uncontrolled `Promise.all` over hundreds of matches.

It is recommended that no more than 1–2 simultaneous requests be made to one host before obtaining real metrics on `429`, timeouts and response times.

### 7. Make hitting set update atomic

The current beat record only adds or updates fingerprint lines. If the source has removed or corrected the old stroke so that the fingerprint has changed, the old string may remain.

It is more reliable to replace the entire set of match strikes in one transaction after successful parsing of the new full payload, or to mark the payload revision and delete the lines of the old revision.

### 8. Don't hide partial failures

A single match failure may not stop the bulk upload, but the resulting task should not appear to be a complete success. At a minimum you need:

- number of matches found, downloaded, missed and crashed;
- last processed `matchId` for each season;
- reason for the last error;
- number of links restored and discarded;
- raw age control that has not yet been normalized;
- separate status `completed_with_errors`.

For a strict backfill, it is better to fall on an incomplete detailed payload. For daily updates, it is acceptable to continue with the remaining matches and put the unsuccessful match in the replay queue.

### 9. Protect against scope expansion

Before mass bypass, you need to check:

- all matches found belong to the requested league;
- season coincides;
- the number of matches does not exceed a reasonable limit;
- The date range doesn't look like several seasons thrown together at random;
- temporary placeholder commands were not included in the reference book;
- known tournament aliases are reduced to one canonical ID.

### 10. Monitor schema changes

Public endpoints are not a stable licensed API and are subject to change without notice. Therefore we need:

- saved anonymized JSON fixtures for parser tests;
- counters of found sections and lines of each type;
- alarm if yesterday the player statistics were for the majority of completed matches, but today they disappeared for all;
- log of unknown statistics names;
- smoke check on several known completed matches after each client or parser change.

## Recommended algorithm

```text
для каждого разрешенного сезона лиги:
    получить метаданные лиги
    определить фактическое обозначение сезона у источника

    получить список команд
    для каждой команды последовательно получить состав
    upsert команд, игроков и сезонных ростеров

    получить fixtures.allMatches
    если массива нет — получить отдельный fixtures endpoint
    отфильтровать статусы и проверить границы scope

    для каждого matchId:
        сохранить или обновить краткую карточку матча

        если матч завершен и есть строгий completeness marker:
            пропустить

        получить краткий JSON матча
        получить актуальный buildId
        получить playbyplay.json

        если 404:
            один раз обновить buildId и повторить

        проверить matchId и наличие требуемых разделов
        посчитать hash raw JSON

        разобрать metadata, teams, players
        разобрать team stats, player stats, shots, events
        восстановить только однозначные связи
        выполнить проверки качества

        в одной транзакции:
            сохранить raw или ссылку на raw
            upsert нормализованные сущности
            атомарно заменить изменяемые наборы матча
            сохранить completeness markers и версию парсера

        обновить checkpoint и счетчики
```

## Minimum set of quality checks

For a completed match, the agent must check:

- requested and received `matchId` matched;
- hosts and guests have different positive IDs;
- status, time and score are consistent with the short card;
- each line has the correct `matchId`;
- there are no duplicate players for `matchId + playerId`;
- there are exactly two command lines or an obvious reason for their absence is recorded;
- shotmap total does not conflict with team totals without a recorded explanation;
- `xG` strokes and command `xG` are compared to the permissible error, and not to strict float equality;
- unknown fields do not lead to a drop in the entire payload, but are recorded as schema drift;
- zeros are not substituted for missing data;
- partial payload is not marked as full.

## Actual weaknesses of the current approach

Without softening:

1. Using the unofficial and undocumented FotMob path. It can break at any moment.
2. The raw JSON of completed matches is removed, so fixing the parser requires downloading the history again.
3. Checking an already normalized completed match considers any one line of statistics or strikes to be sufficient. A partially disassembled match may no longer update automatically.
4. Beats are not replaced entirely. After data is corrected by the source, there may be outdated rows.
5. A roster synchronization error is logged, but season processing continues. As a result, matches may be loaded with an incomplete roster.
6. Consistent collection is reliable, but complete backfill of a large number of leagues takes a long time.
7. The presence of one detailed section confirms the form of the payload, but not its completeness for a specific product.

These are not reasons to abandon the current method. These are places that the other agent should take into account and not pass off as already solved.
