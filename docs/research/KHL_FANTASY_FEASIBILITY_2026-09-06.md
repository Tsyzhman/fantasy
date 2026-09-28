# Assessment of Fantasy KHL implementation

Date of inspection: 6 September 2026. Local commit: `8c4835a`, application version `0.3.56`; production uses the image of the same version and commit. Base: custom file `C:/Users/Nik/Downloads/fantasy_khl_sportsru_ai_guide.md`.

**Conclusion: implementation is technically possible in an existing project, but requires a separate hockey module and a new source of statistics. Adding a file to an AI prompt or changing the squad size is not enough.** The document is considered as a proposal for a product, and not as a command to perform transfers. The application code, production, database and settings did not change. Only this report has been added.

## What is tested in production

Connection via SSH profile `deploy`. The SQL was executed inside `BEGIN READ ONLY` with a query time limit of 20 seconds. Units, circuit, sources, keys and freshness were checked; custom squads and secrets were not uploaded.

| Check | Result |
|---|---|
| Main catalog of competitions | 46, all football, source `fotmob` |
| Matches | 21 342, of which 13 709 completed |
| Rows player × match | 470 616, for 23 607 different players |
| Completed minutes | 350 696 lines |
| Completed goals/assists | 327 985 / 328 092 rows |
| Filled xG / xA | 149 754 / 223 225 lines |
| Completed shots/saves | 163 575 / 22 862 lines |
| Fantasy tournaments | 13 entries; Sports.ru and FPL, all with `squad_size=15` |
| KHL | Not in the catalog of leagues and matches |
| Hockey fields | No TOI in seconds, PP TOI, penalty minutes, plus-minus, hockey roles |

The numbers of filled fields mean the presence of a non-zero value in the SQL sense, including the numeric zero. They do not prove data accuracy or equal coverage across leagues. The saves and goals data in these tables refer to football. They cannot be used as hockey statistics. No separate news and injury tables were found in the tested schema.

## What from the project can be used

| Component | What is | What is required for the KHL |
|---|---|---|
| Next.js, PostgreSQL, Prisma, users | Ready platform | New sports mode and data area filtering |
| `FantasyContest`, Pricing, Rosters | Budget, Roster Size, Club Limit, Snapshots | Hockey Configuration, Correct Price Units, Season ID |
| Sports.ru | Football GraphQL import of prices, calendar, popularity | Separately check and implement the hockey source |
| Calendar | Matches, UTC time, opponents, home/away | Hockey import and grouping by game week |
| Predictions | Football model with minutes, xG/xA and game components | Standalone hockey model |
| Squad selection | Budget, position, club restrictions, selection and substitutions | Mode of all 17 players and when transfers take effect |
| Snapshots and background tasks | Queues, publishing a valid snapshot, limiting revisions | Hockey signs, freshness rules and invalidation keys |
| Interface | Tables, filters, comparison, lineups | TOI, PP TOI, role, goalkeeper starts, OUT/IN/HOLD and substitution time |

Code points tested:

- `prisma/schema.prisma:609`: shared entities use the global `BigInt` ID; field `source` is not included in the primary key. You cannot directly record KHL IDs as internal IDs: they may coincide with FotMob ID. We need a secure mechanism for internal identifiers and mapping by provider/sport/entity type.
- `prisma/schema.prisma:791`: The tournament has `rules: Json`, but the presence of a field in itself does not mean support for arbitrary rules in calculations.
- `src/machete/squad_planner.ts:2761`: rules selection contains FPL and Sports.ru football values; There is no hockey branch.
- `src/machete/squad_logic.ts:671`: the validator strictly requires one goalkeeper and ten outfield players in the base, as well as one goalkeeper on the bench.
- `src/machete/squad_logic.ts:1612`: circuit search is specified by `GK: 1`. Installing `starterSize=17` and `benchSize=0` does not fix the algorithm.
- `src/lib/providers/sports-ru-fantasy.ts:90`: import uses football roles including `MIDFIELDER`; URL parsing looks for the `football` segment.
- `src/machete/sports_ru_squad_import.ts:99`: Import sets `isLocked: false`. The existing user ban on substitution does not confirm the player's ban on Sports.ru before the match. These must be different states.

Recommended organization: general users, tournaments, prices, interface and infrastructure; separate adapters of rules, statistics, forecast and calendar for sports. Hockey statistics should be stored in typed tables associated with general matches and players, and not disguised as football fields.

## External data availability

**Sports.ru.** Direct HTTP requests to the rules, the main page of Fantasy hockey and popularity returned 200. The basic rules from the file are the same as the current page: roster 2/6/9, starting budget 20 000, club limit 3, five transfers per week, no bench, immediate effect of transfers and pre-match ban. There is no explicit marking of the season version on the rules page; it should be kept with the date of inspection and separately associated with the active season. Source: [tournament rules 107](https://www.sports.ru/fantasy/hockey/tournament/rules/107.html).

Absolute ownership numbers and pagination are available in popularity. The percentage will require a time-agreed total number of fantasy commands; the number of participants on the main page cannot be considered an accurate denominator without verification. Sources: [popularity](https://www.sports.ru/fantasy/hockey/tournament/ratings/popular/107.html), [Fantasy hockey](https://www.sports.ru/fantasy/hockey/).

Test read-only GraphQL request `tournament(id: "khl", source: HRU)` to the endpoint that the project uses returned `tournament not found`. This proves that this substitution does not work, but does not prove the absence of any hockey API. A full download of current prices, lineups and locks has not yet been confirmed. The old hockey interface requires a separate study.

**KHL.ru.** Direct requests to `/stat/players/` and `/calendar/` from the current local connection returned 403 with an IP restriction message. The availability of data from production has not been checked. Regular automatic import cannot yet be considered guaranteed.

The presence of the necessary indicators at the source is confirmed by an indexed official card: VPB/I - average time in the power play, VP/I - total time, SMB/I - shifts in the power play. This is a confirmation of the existence of metrics, not a verification of the completeness of the 2026/27 season and not a stable API contract. Source: [official KHL card](https://www.khl.ru/players/15593/).

The first options for providing data are: available official channel/export, agreed upon supplier, or import of provided tables/protocols. The screenshot is suitable for manually entering the current roster, but does not replace a regular source of league-wide statistics.

Search for existing approaches including Reddit and Stack Overflow. Found [author's research code Picking Winners Using Integer Programming](https://github.com/dscotthunter/Fantasy-Hockey-IP-Code): the selection of a fantasy squad with restrictions itself is already a solvable problem of integer optimization. This is an example of an approach, not a ready-made KHL connector or portable Sports.ru rules. Forum discussions were not used as confirmation of the rules and API.

## How to correct the logic of an idea before implementation

1. **Price should limit the budget, not multiply the value.** The formula from the file with multiplication by price mathematically increases the valuation of an expensive player simply for being expensive. For comparison, you can show the expected points per unit price; What should be optimized is the sum of the expected squad points under the restrictions, and not the sum of these ratios.
2. **PP, role and TOI are prediction attributes, not score multipliers.** Multiplying by the zero role PP will zero out the useful player. PP TOI helps evaluate goals/assists; A separate bonus cannot be added for the same goals a second time.
3. **The goalkeeper's starting probability is counted once.** If the expected starts are already equal to the sum of the starting probabilities, repeated multiplication by the probability lowers the forecast. Calculate the start, possible substitution, time and conditional distribution of the result for each match.
4. **Do not make hard shortcuts from TOI.** Long time in the power play is a signal of participation, but not proof of PP1. Keep the PP TOI fact separate from the assigned or assumed role. Compare with partners and take into account the total volume of the power play of the team.
5. **Don't force the user to spend all replacements.** "There are three replacements" usually sets the maximum. Offer three only if there are three acceptable improvements or an explicit request; otherwise show useful substitutions and reasons for HOLD.
6. **Do not declare the player healthy due to lack of news.** `подтверждено / предположение / нет свежих данных` statuses, source and time of observation are needed. This applies to both lines and starting goalkeepers.
7. **Timing the sale is part of the optimization.** Compare the points that can be lost before the replacement, and the points of the new player after it. The advice to “always wait for the match” may be worse than the alternative. Earning points and unlocking are different events; You cannot automatically wait for 24 an hour or consider the end of the match as confirmation of unlocking.
8. **First clarify the borderline scoring cases.** The page does not explain exactly 10:00/40:00, the exact conditions of participation for team points and all cases of goalkeeper substitution. When formulating “every two saves”, you need to count pairs, and not unconditional 0,5 for any individual save. Check odd values ​​on the official fantasy protocol. The weekly reset time zone is also confirmed; The proposed `Europe/Moscow` should not be passed off as a rule explicitly stated on the page.

Working purpose of the model:

`E[FP игрока за период] = сумма по доступным матчам E[официальный скоринг статистики и участия игрока]`.

Participation and time allocation probabilities are taken into account within the expectation. For the field, you need the team's result, goals, assists, plus or minus, penalty, time and conditions of the cracker; for goalkeepers - participation, time, saves, missed goals and crackers. Correlated events, such as a cracker and defender time, are not automatically considered independent.

LLM can be connected to extract facts from news and explain recommendations. Sources and dates must accompany the facts. Check the budget, positions, replays, club limit and transfers using the usual code.

## First stage and sequence of work

**Be the first to check the sources, not the UI or AI advisor.** Success criterion: get an up-to-date full list of prices with IDs and positions, the calendar of the coming week, statistics of several matches with PP TOI and data for full scoring; match players and check for re-acquisition. Test matches with different outcomes, dead ends, goalkeeper rotations and missing values. Record the season, time units and prices, update times and source discrepancies.

If the data is available, proceed like this:

1. Add sport area, secure internal IDs, match/player hockey tables and rule versions. TOI is stored in seconds; the missing value is different from zero. The result of the match must distinguish between regulation time, OT and shootouts.
2. Add imports of Sports.ru Hockey and hockey statistics, control of coverage, freshness and comparison. Repeated import does not create duplicates; a failure does not replace a good photo with an incomplete one.
3. Implement accurate historical scoring and compare with official fantasy scores for players/matches. Distinguish between source statistics and points actually awarded by Sports.ru.
4. Implement a basic forecast: the last few matches + last season, adjusted for a small sample, TOI/PP, opponent, lineup and rotation. Test on a chronological time-lag without future information, compare with a simple “average FP × expected matches.” In the absence of history, honestly show heuristics rather than proven accuracy.
5. Add hockey selection, weekly limit and substitution points; all 17 players participate in the forecast. Sale price, bank, calendar and locks are checked as of the date of the recommendation.
6. Add comparison interface OUT/IN, expected gain, change in value, matches, TOI/PP TOI, risks, HOLD and update time. News and AI explanations - after a working numerical calculation.

Estimation of labor intensity for one developer, and not a promise of time: 1–3 working days to check sources; approximately another 10–20 days for a numerical MVP with import, scheme, forecast, selection and checks with stable sources; news and automatic extraction of roles is a separate stage. If access to hockey statistics is not provided, the time to a full-fledged module cannot now be estimated.

For the lightweight first version, you can manually import prices/squad and statistics tables, calendar comparison, validator and explanatory rating with missing data marks. This version is useful, but should not declare verified PP1, injuries and automatic transfer readiness.

## Cache, duplicates and resources

Checks performed during the study and again before completion. The base occupies about 1 450 MB. The initial measurement of available server RAM is about 6,3 GB; project containers in a separate measurement: web about 822 MiB, worker 1,306 GiB, PostgreSQL 996 MiB. These three containers each have zero restarts. There is about 92 GB free on the disk, Docker build cache is 0 B. These are load snapshots, not proof of the absence of leaks during long-term operation.

No duplicates were found for `(contest_id, provider_player_id)` in prices, `(contest_id, player_id)` among matched prices and `(source, raw_ref)` in matches. A full search of semantic duplicates of people and all tables was not performed.

For seven current Sports.ru football tournaments, the age of `last_synced_at` at the time of the SQL check was about 47,8 hours. This is an observation about the age of the snapshots, and the cause of the synchronization failure has not been determined. For hockey, you need to separately determine when a photo is still suitable and check prices/blocks before making a recommendation.

The code already has limited caches and saving three READY revisions of the pool. For the KHL, keys should include sport, tournament, season, interval, rules/model version, and input data revisions. A change to price, calendar, membership status, or role must invalidate the dependent forecast. Do not consider the presence of an old READY snapshot to be sufficiently relevant.

Store normalized statistics once, recalculate aggregates based on changed matches/teams, set the storage period for raw payloads. Do not load the entire football and hockey history into RAM for each request and do not send it entirely to LLM. Store snapshots needed for historical checking separately from the short-lived UI cache.

Cleaning production, changing indexes, VACUUM, deleting old local files and starting new services were not required or performed for this study.
