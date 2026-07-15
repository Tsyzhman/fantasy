# Fantasy Model Backtest

The reproducible Machete backtest is run from finished normalized FotMob matches:

```bash
npm run prisma:migrate:deploy
npm run model:backtest -- --league=47 --season=2024/2025 --expected-matches=380
```

`--league`, `--season`, and a configured `DATABASE_URL` are required. Supplying
`--expected-matches` is strongly recommended. Without it, the runner infers a
double round-robin total as `team_count * (team_count - 1)`; that inference is
not valid for knockout, split, or single-round competitions.

## Method

- Validation is rolling-origin. A target match is never present in its own
  feature window.
- The default feature window is the player's last five provider-observed
  matchday rows for the same team, including emitted zero-minute bench rows.
  At least three earlier matchday rows are required.
- The uncalibrated input is the production `calculateFantasyScore` result over
  the historical aggregate. The evaluated and production projection then uses
  the fixed `ridge19-v1` position-specific ridge calibration (`lambda=25`, 19
  predeclared features, minimum 30 training samples). This configuration was
  fixed before the final holdout was inspected.
- The actual target is the production `calculateScoringScore` result over the
  target match stats.
- The baseline is mean actual fantasy points over exactly the same historical
  window used by the model.
- The final 25% of match dates is a fixed chronological holdout. Rolling-origin
  predictions for all rows on a UTC date are made before any outcome from that
  date is added, so the target and same-date targets cannot leak into features.
- MAE and RMSE are reported overall, for `GK`, `DEF`, `MID`, and `FWD`, and for
  stable starters, uncertain-minute players, and other players.
- Playing-time groups use history only. A stable starter has at least an 80%
  historical start rate and at least 60 average minutes. An uncertain-minute
  player is not a stable starter and has either a 20-80% start rate or a
  historical minutes standard deviation of at least 25.

The run reports calibrated one-, three-, and five-observation horizons. The
predeclared beta decision horizon is five observations, matching the product's
1/3/5-round planner. One-observation metrics remain visible and are never
discarded merely because they are weaker. The run stores the selected scoring
model identity, calibration version, a SHA-256 hash of all active formulas and
rules, the full configuration, dataset coverage, all metrics, and gate result
in `fantasy_backtest_runs`.

## Beta Gate

The command exits with code `2` when any beta condition fails:

- the number of finished matches does not exactly match the expected season
  total, or an unfinished match remains in scope;
- a finished match has no date;
- any of the four positions has fewer than 30 evaluated samples by default;
- the calibrated five-observation model does not beat the corresponding
  five-observation baseline on overall MAE or RMSE;
- fewer than three of four positions improve five-observation MAE or RMSE by
  at least 10%.

Thresholds are explicit CLI options:

```bash
npm run model:backtest -- --league=47 --season=2024/2025 \
  --expected-matches=380 \
  --history-matches=5 \
  --minimum-history=3 \
  --minimum-position-samples=30 \
  --minimum-improvement-percent=10 \
  --required-passing-positions=3
```

Use `--json` for machine-readable output. `--no-persist` is suitable for an
exploratory calculation but does not satisfy the requirement to save results.
`--allow-gate-failure` keeps exit code 0 for exploration while the report still
contains `betaGate.passed: false` and exact failure reasons.

## Verified Full-Season Result

On 2026-07-15 migration `000004_fantasy_backtest_runs` was applied to an
isolated restored database. The fixed implementation was then executed against
all 380/380 finished Premier League 2025/26 matches (15,193 source player rows,
13,267 raw evaluation samples). The final holdout started on 2026-03-15 and run
`cmrm2jqri0000d0znld4ykird` was persisted as `COMPLETED` with the beta gate
passed.

- Five-observation holdout: 1,334 samples; all four positions exceeded the 10%
  RMSE-improvement threshold (`GK 16.569%`, `DEF 10.759%`, `MID 13.403%`,
  `FWD 11.116%`). The beta model gate passed.
- Next observation: no position reached 10%; MAE improvement was `GK 8.394%`,
  `DEF 7.023%`, `MID 5.000%`, `FWD 3.463%`. This is a real limitation: the
  model is validated for five-round planning, not claimed to be 10% better for
  an individual next match.

This is a real persisted full-season result, not a dry run. It proves the
historical model gate in the isolated release candidate.

After the verified image was promoted, the same test was repeated in production
on 2026-07-15. Run `cmrm6rgwx0000106radpcmtco` was persisted as `COMPLETED` with
`gate_passed=true`, 380/380 finished matches, the same model hash prefix
`2ce4d0dab55e`, 1,334 five-observation holdout samples, and the same four passing
positions. This closes the SMART historical-backtest criterion for the deployed
five-round model.

## Known Data Limitation

The runner evaluates recorded player matchday rows in `match_player_stats` and
keeps emitted zero-minute bench rows. When the provider omits a player from the
match payload entirely, that non-appearance still cannot be reconstructed
reliably without dated roster membership. The report therefore states both the
source row count and the evaluated sample count instead of claiming complete
lineup coverage.

Having only the runner and schema is not proof that historical testing is
complete. Both isolated and production now contain persisted full-season runs
for the deployed model hash; the one-observation limitation remains explicitly
reported rather than hidden.
