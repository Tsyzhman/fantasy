# WI-002: Checking the profitability of bets according to statistics

- Kind: `research`
- Canon action: `none`

## Outcome

Verifiable answer whether available data supports the possibility of sustainable ROI 20–30% on bets.

## Specs

Research without owning betting spec. Context: `specs/common/main.md`, `docs/reference/DATA_MODEL.md`, `docs/operations/DEPLOYMENT.md`. The implementation of a betting product will require a new canon and a separate task.

## Scope

- In: read-only production audit via SSH deploy; limited downloads of sports data; external archives of odds; chronological simulations; report with uncertainty and limitations.
- Out: money bets, changes in production, deployment, changes in product models and other people’s uncommitted files.

## Acceptance

- [x] Inventoryed sports tables, periods, occupancy, doubles and history of odds.
- [x] Reproducible historical testing has been performed on the available sample, or the required intersection has been proven to be missing.
- [x] Actual ROI, statistical uncertainty and hypotheses are separated; leaks and margins checked.
- [x] The methodology, evidence, summary and verification of resources after the study were saved.

## Result

Completed 2026-09-07. Report: `docs/research/BETTING_FEASIBILITY_2026-09-07.md`; evidence: `specs/work/evidence/WI-002/`.

21 343 match / 13 781 completed; 280 092 impact; 473 577 player strings; 496 snapshots Fonbet. Matched 3 532 external match, holdout 1 837. Four models × four thresholds tested in each of two markets. Not a single option passed the selection for validation with ROI >0 and n>=50. For a fixed EV>=5% ROI 1X2: xG −13,63%, regression −7,48%; totals: −6,13% / −4,89%. Fonbet: +0,28% at 71 bet, 95% weekly-bootstrap −48,75…+55,14%. Target 20–30% is not confirmed.

Checks: target-day/future perturbation does not change the characteristics of the current day; payment calculation; unique bet on the match; holdout boundaries; reconciliation of names and results; CRC and SHA-256 of the input archive. The results of all compared matches are taken from one external archive, without excluding 36 discrepancies in the result. The last story for Fonbet precedes the day of the photo.

REVIEW: 2 626 finished without a full score in matches; 36 differences in the fallback of the Premier League account; one outsider team-stat row; rewritable history odds; historical snapshots are largely uploaded after matches. These are research findings, not accepted implementation trade-offs; production fixes outside scope. The implementation of the betting circuit will require a new owning canon.

Resources: production unchanged, no new server processes/containers were created, healthy services. Available RAM 5 678 → 6 262 MiB; disk 19%. Calculation is local; input data is stored in a verified compressed archive. Clearing approximately 20 MB of temporary dumps/caches rejected by automatic check (`blocked by policy`); a copy was left and clearly noted in the report. WAL was not required, the canon did not change.
