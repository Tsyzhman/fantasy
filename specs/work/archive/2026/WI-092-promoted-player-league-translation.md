# WI-092 — League translation for promoted-player history

- Kind: `change`
- Canon action: `direct-edit`

## Outcome

Use evidence from players who changed divisions to calibrate the contribution of lower-division attacking history to Squad forecasts.

## Specs

- Governing: `spec://modules/machete/FEAT-001-global-ranking-strategy#league-translation`

## Scope

- In: recognized lower-to-higher division pairs, earlier-season attacking priors in FO and Alt, detailed history in the internal 3/5-round projection, and the existing caches and publication paths.
- Out: provider feeds, raw statistics, competition rules, changes to saved squads, and production release.

## Acceptance

- [x] Measure paired observations for retained players on both sides of promotion and validate the selected treatment against the existing prior.
- [x] Verify competition-scoped rate adjustment, precedence for higher-division evidence, fallback for thin data, and snapshot compatibility.
- [x] Record provenance, checks, cache and resource bounds.

## Result

The shared feeder table applies 0.74 for Championship to Premier League, 0.70 for Eerste Divisie to Eredivisie and 0.70 for LaLiga2 to LaLiga. Other recognized feeder pairs use 0.78. FO and Alt previously used 0.78 for every recognized pair. The internal horizon model previously used the raw attack input for all divisions.

The read-only extract had 21,151 unique player-match rows. The calibration used 159 outfield players in seven pairs who stayed with the same club after promotion, played at least 450 minutes in the lower division and at least 180 minutes in the higher division before 1 October 2026. The rate ratio compares lower-division goals plus assists to top-division xG plus xA per 90, using observed events where expected stats are absent. It weights by up to 450 higher-division minutes and shrinks toward 0.78 with 40 prior player equivalents. A pair needs 15 players and two clubs for its own factor. The estimate is bounded by 0.45 and 0.78. Earlier coverage for a direct 2025/26 promotion replay was sufficient for 25 Eredivisie players only.

| 2026/27 October holdout | Old | New | Observed |
|---|---:|---:|---:|
| Translated prior xGI/90 | 0.2279 | 0.2204 | 0.2168 |
| Prior-only MAE | 0.1115 | 0.1087 | |
| Prior blended with available current stats, MAE | 0.1012 | 0.1008 | |
| Internal horizon allocation, share MAE | 0.037797 | 0.037582 | |

The blend used 162 holdout players and the production position priors. Internal horizon replay used earlier top-flight participants and the production 60/40 shares on same-club history across 24 clubs. These are attacking-rate and share checks. The estimated gains are small and the sample gives no basis for separate factors in all pairs. League-season archive rows often lack minutes, so the production appearance-based fallback still applies when needed.

The normal recalculation test verifies the translated lower-division goal fallback, explicit zero xA, unscaled destination data and the stored shares. Archive tests cover destination precedence and directional pair matching. The current-season reader uses observed goals or assists only for missing expected-stat cells. The worker reads a smaller history projection and appends player history rows in place. Both changes reuse the existing refresh, retention and upsert keys. The final suite passed 1,379 tests with four platform skips. Type checking and targeted ESLint passed. Production observation found three READY revisions per scope, zero duplicate queue or raw-cache keys, 5,820 MiB host memory available and 1.262 GiB worker memory. The work used production read-only.

The [verification receipt](../../evidence/WI-092/verification.json) records the input and holdout. The choice to evaluate the same player across divisions follows the separation of team and league context described by [Opta](https://theanalyst.com/articles/what-is-the-transfer-portal).
