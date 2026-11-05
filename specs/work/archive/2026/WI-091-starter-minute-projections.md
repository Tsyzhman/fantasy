# WI-091 — Football projections for players marked in the starting XI

- Kind: `change`
- Canon action: `direct-edit`

## Outcome

Calibrate the playing-time contribution to Sports.ru FO for players marked in the starting XI, including players with a history of coming off the bench.

## Specs

- Governing: `spec://modules/machete/FEAT-001-global-ranking-strategy#starter-event-minutes`
- Constraint: `spec://modules/machete/INFRA-004-sorareinside-starters#apply`

## Scope

- In: retrospective FO and Alt comparison using 2025/26 and 2026/27 FotMob player-match rows and archived Sports.ru pre-match marks, FO event exposure, and cached pool compatibility.
- Out: new lineup providers, Alt and FPL formula changes, Foontasy feed, saved lineups, scoring-rule changes, and production release.

## Acceptance

- [x] Compare the existing calculation with the selected candidate using time-ordered history in both seasons. Separate known starts, a past-lineup proxy, and archived pre-match marks.
- [x] Verify the nearest-fixture signal, substitute-heavy and thin histories, and existing behavior outside the selected scope using the normal projection entry point.
- [x] Verify consistent pool refresh, bounded resource use and input uniqueness, and record the checks and historical evidence.

## Result

Sports.ru FO uses at least 55 minutes of event exposure for a marked outfield starter in the nearest fixture. The fixture explanation shows the floor when it increases exposure. Position priors and team totals still determine how that playing time translates into expected events.

The replay retained 4,583 matches across 12 competitions after excluding 16 incomplete or extra-time matches from the read-only FotMob extract. It used only earlier matches as features and evaluated archived Sports.ru marks only when captured before the mapped kickoff. Points are from the stored CORE ruleset. The replay used the default production FO and Alt formulas with one shared historical-goals fallback for fixture strength. The fixture strength and player histories were reconstructed for a paired replay.

| Sample | Cases | FO MAE before | FO MAE after |
|---|---:|---:|---:|
| 2025/26 known-XI scenario, recent bench history | 3,782 | 1.8581 | 1.5193 |
| 2026/27 archived marks, recent bench history | 970 | 1.9455 | 1.8952 |
| 2026/27 archived marks, actually started | 628 | 2.2928 | 2.0100 |
| 2026/27 archived marks, did not start | 342 | 1.3079 | 1.6845 |
| 2026/27 archived marks, all comparable rows | 57,724 | 1.2390 | 1.2308 |

Recent bench history requires at least five earlier club observations and starts in at most 25% of the last ten. In the archived cohort, actual playing time averaged 54.07 minutes and model event exposure moved from 35.61 to 55.07. In the October holdout of 564 cases, FO MAE moved from 1.8249 to 1.7952. A 55-minute floor had lower minute RMSE for the target group than 60 minutes and produced a smaller penalty for missed marks. Last-XI proxy error was higher in the prior season, so the strongest evidence comes from the archived pre-match marks. Alt MAE for the same 968 comparable marked cases rose from 2.0709 to 2.3014 when trialled with the floor. The implementation applies the floor to FO.

Stanis Idumbo played 87 minutes in match 5802925. The replay moved from 25.63 to 55 event minutes and from 1.9 to 2.7 FO against 3.68 recorded points.

The candidate replay through the normal index reproduced the selected variant. Focused regression and cache checks passed. The final suite passed 1,379 tests with four platform skips. Type checking, targeted ESLint and workflow validation passed. Earlier READY snapshots remain readable until the existing worker publishes a full revision. The candidate replay peaked at 410.95 MiB RSS. Both input keys were unique. No production release was part of the work.

The [verification receipt](../../evidence/WI-091/verification.json) records the inputs and comparisons. The research used the separation between playing-time scenarios and scoring rates described by [FPL Review](https://docs.fplreview.com/the-model/projections/xmins/) and [FPL Toolkit](https://www.fpltoolkit.co.uk/projections/methodology).
