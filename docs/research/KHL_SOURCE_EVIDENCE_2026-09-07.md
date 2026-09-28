# Fantasy KHL: verified sources and access boundaries

Date: 2026-09-07. The document accompanies [specifications](../../specs/SPEC-MAP.md), and is not a report on the completed production import. Checks 7 September - limited GET without authorization, without saving raw in this worktree and without accessing production. The original study base is September 6; these observations below are not passed off as re-verified access 7 September.

## Re-checked 7 September

| ID | Source | Check and result | What has not been proven |
|---|---|---|---|
| SRC-01 | [Tournament Rules 107](https://www.sports.ru/fantasy/hockey/tournament/rules/107.html) | Normal Node fetch: HTTP 200. 17 =2G+6D+9F, 20 000, club cap 3, 5 transfers/week, no substitutions, instant action, lock for 30 min, floating unlock, revaluation after the match | Explicit timezone 04:00, exact scoring exactly 10:00/40:00, goalie edge cases, season version on page |
| SRC-02 | [Hockey Players Catalog](https://www.sports.ru/fantasy/hockey/team/create/107.json) | GET HTTP 200; 694 strings, 694 unique id, 22 unique club_id; positions 1/2/3; id/tag_id/club_id/price/delta/lock present | SLA, stability all season, future constant catalog size; endpoint does not create a command with this GET |
| SRC-03 | [Sprong Card](https://www.sports.ru/fantasy/hockey/player/info/107/1922861.html) | HTTP 200; the calendar assigns September 7/11/13 to the week 1, September 15 to the week 2; HTML is accessible to a regular parser | The exact UTC boundaries of all weeks cannot be derived from one card |
| SRC-04 | [KHL Telematics Publication](https://www.khl.ru/news/2025/12/10/554592.html) | Reopened by web tool; published xG values of field and xG− goalkeepers | API, automatic uploading, full player-match dataset, terms of commercial use |
| SRC-05 | [Wisesport Hockey](https://wisesport.com/hockey/) | Supplier page verified as a search direction for ready-made advanced metrics | Contract available KHL feed, IDs, regularity and coverage required xG fields |

Web tool did not open Sports.ru URLs; a direct limited HTTP request opened the rules, catalog and card. This is a specific observation about access method, not proof of future continuity, and not browser-based automation.

## Observations from the study 6 September

Source materials were read from `C:/Users/Nik/Documents/fantasy_export/docs/KHL_FANTASY_FEASIBILITY_2026-09-06.md`, `C:/Users/Nik/Documents/fantasy_export/outputs/khl-source-research-2026-09-06/` and custom `C:/Users/Nik/Downloads/fantasy_khl_sportsru_ai_guide.md`. Cache directories, private squads, connection settings and operating files were not copied.

| ID | Source | Observation | Implementation constraint |
|---|---|---|---|
| SRC-06 | [Mobile data](https://khl.api.webcaster.pro/api/khl_mobile/data.json) and [control event](https://khl.api.webcaster.pro/api/khl_mobile/event_v2.json?id=3000059&stage_id=407) | stage_id 407 → khl_id 1436; mobile event 3000059 → match 901980, Severstal-Salavat 2:3. Lineups, start_fives and base events are available | PP TOI and SV not found in this payload; future lineups are empty; seasonal totals may lag behind |
| SRC-07 | [KHL Protocol](https://www.khl.ru/game/1436/901980/protocol/) | TOI, PP/PK, shifts, shots/blocks, SV/GA are visible in the browser. Gregoire 20:50 /06:05 /00:44 | Direct HTTP and PDF provided 403 locally and from the server. REST request bodies and production browser stability are not checked |
| SRC-08 | [Text and map of shots](https://www.khl.ru/game/1436/901980/text/) | 60 shots on target and 5 goals; 100 total attempts. Two DOM copies give 120 points, mobile rotated | Incomplete map of attempts, no position of all players/goalies; cannot be used as a ready xG or double events |
| SRC-09 | [Application Dynamo Minsk](https://www.khl.ru/clubs/dinamo_mn/team/) | Section “Injured”, verified Gardner, Limoges, Melosh | Incomplete register of short injuries, the absence of a line does not confirm the health of |
| SRC-10 | [Isaev Card](https://www.sports.ru/fantasy/hockey/player/info/107/1982464.html) | 21 SV, 1 GA, 60:00, 12 FP; cards give official FP and history, old season via `?s=1317639` | Completeness of goalie edge cases requires additional samples |
| SRC-11 | Card of the first week of Sports.ru from the previous check | Week 1 ended 14 September | Do not turn a date without time into proven deadline; need to collect official week mapping |

The main KHL website requires permission for automated extraction. Before regular ingestion, check conditions and permissible transport. This task does not receive this permission and does not run a regular parser.

## Search for existing solutions

Internet search, Reddit and Stack Overflow were performed before design. [Discussion of the needs of fantasy hockey](https://www.reddit.com/r/fantasyhockey/comments/1n03ds3) and [collection of sports data from various sources](https://softwareengineering.stackexchange.com/questions/357695/collecting-sports-data-from-many-sources-in-many-formats) are useful only as directions; forum statements do not confirm KHL coverage/API/rules. The technical solutions in the package are based on the project code read and verified primary sources.

Old Sports.ru articles about the regular season and the Gagarin Cup have different transfer limits. For example, [playoff 2025](https://www.sports.ru/hockey/blogs/3308841.html) cannot be used as the rules of the regular tournament 107. Ready-made NHL xG models do not solve the issue of access to ready-made KHL xG and are not included in the scope.

## Unclosed dependencies

| ID | Uncertainty | How to close | What is allowed before closing |
|---|---|---|---|
| DEP-XG | There is no verified stable supplier of ready-made player-match xG KHL | Execute XG-01 from INFRA-001: access/rights/coverage/history/latency/corrections | Catalog and drafts, but not the promised xG release |
| DEP-STATS | Full PP TOI/SV is available in the browser, automatic delivery has not been proven | Allowed feed/protocol adapter and 14-day staging probe | Cards with honest null; limit recommendations |
| DEP-WEEK | Exact boundaries, timezone and special weeks | Official week IDs/boundaries and conflicting fixtures | Calendar with explicit numbers, no unconfirmed reset |
| DEP-SCORE | Exact thresholds, participation and goalie exceptions | Set of official Sports.ru FP, reconciliation; if necessary, clarification at the site with a separate authorized request | Official FPs are available; local calculation provisional |
| DEP-ODDS | The dictionary of hockey factor IDs and market conditions has not been verified | ODD-00, control snapshots, stability with staging | Historical hockey baseline with no line mark |
| DEP-ROSTER | Complete links, future goalie starter, PP1/2 | Verified source + timestamp; otherwise a separate probability model | Unknown/estimate, without fake confirmed |
| DEP-TEAM | Stable import of hockey squad, bank and weekly transfers is not confirmed | Read-only providerTeam endpoint, ownership and snapshot completeness | Manual local draft with unconfirmed external state |
| DEP-BASE | Worktree is older than the original study and the main branch | Check schema/FPL/Squad against the current integration head | Specifications, but not blind migration using old numbers |

## Hygiene of this task

KHL/football data in the database has not changed. New documents are compact; raw responses are not saved, the original research cache was not duplicated. Dependencies were not installed, browser/Next/dev workers were not launched. Checks for links, anchors, changes and document sizes are performed locally; application tests/migrations were not run by this task.
