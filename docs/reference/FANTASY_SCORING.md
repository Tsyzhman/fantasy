# Fantasy Scoring

## Meaning

`fantasyScore` is the player's predicted fantasy points for one upcoming round from the imported event metrics.

`valueScore` is fantasy output adjusted for market value:

```text
value_score = fantasy_score / max(market_value / 1_000_000, 0.1)
```

It answers a different question: not "who scores most?", but "who gives the most fantasy points per EUR 1m of value?"

## Formula

The default score is rule-based, position-aware, and normalized to one match/round:

```text
expected_minutes = minutes_played / matches_played
fantasy_score = projected_one_round_events * position_rule_weight
```

Rules can be `DEFAULT` for all positions or specific to `GK`, `DEF`, `MID`, and `FWD`.
Imported totals are converted to per-match values. Per-90 fields are scaled by `expected_minutes / 90` when available.

Admins can also enable custom formulas on `/admin/models`. Custom formulas are position-specific: GK, DEF, MID, and FWD
can each have their own formula. If a position formula is empty, that position uses the default rule set.

Custom formulas are evaluated exactly as written against the imported fields. For a per-round custom model, prefer per-90
fields and scale them the way you want.

Custom formula syntax:

```text
4*{Goals} + 2*{xG/per90} + 3*{Assists} - {Yellow cards}
```

Use numbers, `+`, `-`, `*`, `/`, and parentheses. Put metric names in braces. Metric labels are normalized like imported
Wyscout headers, so `{xG/per90}` maps to `xg_per_90`, `{Yellow cards}` maps to `yellow_cards`, and missing fields count as
0.

Supported transforms:

- `linear`: use the metric value as-is.
- `appearances_60`: `floor(minutes_played / 60)`, capped by `matches_played` when available.
- `full_matches`: `floor(minutes_played / 90)`, capped by `matches_played` when available.
- `floor_per_2`: `floor(value / 2)`.
- `floor_per_3`: `floor(value / 3)`.

## 2025/26 Seed Model

| Action | GK | DEF | MID | FWD |
| --- | ---: | ---: | ---: | ---: |
| Appearance | +1 | +1 | +1 | +1 |
| 60+ minutes | +1 | +1 | +1 | +1 |
| Full match | - | - | +1 | +1 |
| Goal | +6 | +6 | +5 | +4 |
| Assist | +3 | +3 | +3 | +3 |
| Fantasy assist | +3 | +3 | +3 | +3 |
| Clean sheet, 60+ minutes | +4 | +4 | +1 | - |
| Every 3 saves | +1 | - | - | - |
| Every 3 possession recoveries | - | +1 | +1 | +1 |
| Penalty save | +5 | - | - | - |
| Foul leading to penalty | -2 | -2 | -2 | -2 |
| Missed penalty | -2 | -2 | -2 | -2 |
| Own goal | -2 | -2 | -2 | -2 |
| Every 2 goals conceded | -1 | -1 | - | - |
| Yellow card | -1 | -1 | -1 | -1 |
| Red card | -3 | -3 | -3 | -3 |

Missing metric values count as 0 in formula calculation. Formula inputs come from the promoted typed metric columns on
`PlayerSnapshot`; new formula fields need an importer mapping and a typed column.

## Historical Evaluation

The production Machete formula can be evaluated with the rolling-origin runner
documented in `docs/testing/MODEL_BACKTEST.md`. Prediction uses only earlier match
aggregates; actual points use the target match's scoring result. Reports compare
the model with a same-window historical-mean baseline and are persisted with a
model version and formula/rule hash.

## Auto-pick Strategies

The squad and starting-XI optimizers expose three explicit strategies. Every
strategy is constrained by the same budget, position, club, lock, exclusion,
and formation rules; only the player ranking score changes.

- `balanced` maximizes raw projected fantasy points over the selected horizon.
- `reliable` scales projected points using expected minutes (45%), historical
  start share (30%), and forecast confidence (25%). It also penalizes declared
  forecast risks and estimated rather than Sports.ru prices. These inputs are
  heuristics, not calibrated probabilities.
- `upside` adds 35% of the best loaded round projection and 50% of the
  round-to-round standard deviation. It intentionally prefers a higher ceiling
  and can produce a less stable squad.

The interface always reports the raw xFP change after optimization. Strategy
scores are ranking weights and must not be presented as expected fantasy
points.

## Formula Fields

The `/admin/models` page includes the full field guide for formula aliases, normalized keys, field meanings, and fantasy
points by position.

It also includes the full Wyscout Excel field list. Any numeric source field can be used in a custom formula by wrapping
its label in braces, for example `{Shots per 90}` or `{Accurate progressive passes, %}`. Extra fields have 0 fantasy
points by default until a custom formula assigns a weight.
