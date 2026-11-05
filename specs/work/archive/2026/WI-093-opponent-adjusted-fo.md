# WI-093 — FO with historical opponent adjustment

- Kind: `change`
- Canon action: `direct-edit`

## Outcome

Squad shows a separate Sports.ru player forecast that accounts for the difficulty of earlier opponents alongside the existing FO and Alt forecasts.

## Specs

- Governing: `spec://modules/machete/FEAT-001-global-ranking-strategy#historical-opponent-forecast`

## Scope

- In: time-ordered historical opponent factors, attack-only player adjustment, round and horizon comparison in Squad, bounded publication through the existing pool cache.
- Out: edits to source statistics, automatic selection and transfer strategies, FPL scoring, and production release.

## Acceptance

- [x] Verify which opponent signals already reach production FO and Alt. Evaluate historical adjustment on available data from both seasons.
- [x] Verify that earlier strong and weak opponents affect equal attacking histories in the expected direction without leakage or a second future-fixture adjustment.
- [x] Verify sorting, round and horizon values, missing data, old pool reads, and bounded cache, duplicates and memory.

## Result

Existing FO and Alt use the projected team xG and xGA from `fixtureStrengthProjection` for each upcoming fixture. FO can blend in bookmaker inputs. Their rolling player xG and xA use the recorded earlier match values and event fallbacks. That history previously carried no opponent-specific defense factor.

Sports.ru Squad now has a separate experimental `FO Opp.` comparison. Enable the selected-round or horizon column through the player table's Columns control. The selected-round column is included in the default list. The explanation shows the rated match count and the goal and assist factors. The computation uses half the bounded historical correction and keeps the next-fixture context from the component FO input.

The read-only replay covered 154,399 player rows in 4,979 finished matches across 12 competitions up to 5 November 2026 at 08:34 UTC. The final replay used the actual TypeScript factors, the same future-opponent proxy in both arms and known playing time to isolate the attacking signal. It uses earlier same-competition club observations and scores xG plus xA with observed event fallbacks. The measured metric is attacking event error, separate from full fantasy-point accuracy.

| Season | Evaluated player appearances | Attacking MAE before | Attacking MAE after |
|---|---:|---:|---:|
| 2025/26 | 59,784 | 0.151368 | 0.151384 |
| 2026/27 | 17,949 | 0.150802 | 0.151150 |

The correction made little difference to aggregate error and slightly increased MAE. Individual historical xGI/90 moved from 0.341 to 0.379 for Frank Anguissa and from 0.144 to 0.132 for Asier Osambela. The comparison is experimental. Its scope is individual player evaluation.

Tests verify fixture chronology including overlapping kickoff windows, venue and competition isolation, zero and fallback handling, capped attacking forecasts, double rounds, older pool reads, compact DTO output and mobile sorting. The full suite passed 1,383 tests with four platform skips. Type checking and workflow validation passed. Targeted lint had zero errors and the existing player-image warning. The replay peaked at 147 MiB RSS. Input keys were unique. Production read-only observation found 12 READY scopes with three revisions each, zero refresh queue rows and zero duplicate queue or raw cache keys. The worker used 1.255 GiB. The change uses the existing pool cache and adds no persisted ratings table.

The [verification receipt](../../evidence/WI-093/verification.json) records the replay. Prior work on historical opponent normalization includes [the opposition effect study](https://iyush.dev/football/research/opposition) and the [fixture-adjusted per-90 method in FPL CLI](https://github.com/rossgroomio/fpl-cli/blob/main/docs/custom-analysis.md).
