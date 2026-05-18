# Fantasy Scoring

## Meaning

`fantasyScore` is the player's projected fantasy points from the imported event metrics.

`valueScore` is fantasy output adjusted for market value:

```text
value_score = fantasy_score / max(market_value / 1_000_000, 0.1)
```

It answers a different question: not "who scores most?", but "who gives the most fantasy points per EUR 1m of value?"

## Formula

The score is rule-based and position-aware:

```text
fantasy_score = sum(transformed_metric_value * rule_weight)
```

Rules can be `DEFAULT` for all positions or specific to `GK`, `DEF`, `MID`, and `FWD`.

Admins can also enable a custom formula on `/admin/models`. When enabled, the custom formula is used instead of the
default rule set for new imports.

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

Missing metric values count as 0 in formula calculation, while raw imported values stay preserved in `PlayerSnapshot.rawMetrics`.
