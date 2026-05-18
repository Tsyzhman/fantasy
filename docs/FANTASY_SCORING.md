# Fantasy Scoring

## Goal

Calculate a comparable fantasy score for every imported player snapshot.

The score should be transparent, configurable, and position-aware.

## MVP approach

Use a rule-based weighted model.

Each rule:

```ts
type FantasyRule = {
  positionGroup: 'DEFAULT' | 'GK' | 'DEF' | 'MID' | 'FWD';
  metricKey: string;
  weight: number;
  transform: 'linear' | 'per90' | 'percent' | 'negative' | 'cap';
  enabled: boolean;
};
```

Formula:

```text
fantasy_score = sum(metric_value * rule_weight)
```

Apply rules in this order:

1. DEFAULT rules;
2. position-specific rules for GK/DEF/MID/FWD;
3. optional caps/normalization later.

## Suggested seed model

### DEFAULT

```text
minutes_played * 0.01
matches_played * 0.05
goals * 5
assists * 4
xg * 1.5
xa * 1.5
yellow_cards * -1
red_cards * -3
```

### FWD

```text
shots_per_90 * 0.3
shots_on_target_percent * 0.02
touches_in_box_per_90 * 0.4
successful_attacking_actions_per_90 * 0.4
goal_conversion_percent * 0.03
```

### MID

```text
key_passes_per_90 * 1.0
shot_assists_per_90 * 0.8
passes_to_final_third_per_90 * 0.2
accurate_passes_to_final_third_percent * 0.02
progressive_passes_per_90 * 0.25
accurate_progressive_passes_percent * 0.02
smart_passes_per_90 * 0.8
```

### DEF

```text
successful_defensive_actions_per_90 * 0.5
defensive_duels_won_percent * 0.03
aerial_duels_won_percent * 0.02
interceptions_per_90 * 0.6
shots_blocked_per_90 * 0.8
```

### GK

```text
clean_sheets * 2.5
save_rate_percent * 0.05
prevented_goals * 1.5
conceded_goals * -0.8
shots_against_per_90 * 0.1
exits_per_90 * 0.2
```

## Value score

Calculate value score when market value exists:

```text
value_score = fantasy_score / max(market_value / 1_000_000, 0.1)
```

This helps users find underpriced players.

## Missing values

For MVP:

- missing metric value = 0 for formula calculation;
- keep raw value as null in DB;
- show missing data in UI as `—`.

## Future improvements

- z-score normalization by position;
- percentile ranking by league;
- opponent strength adjustment;
- fixture difficulty weighting;
- recent-form weighting;
- user-custom scoring models.
