# WI-096 — Release league strength and passing networks

- Kind: `migration`
- Canon action: `none`

## Outcome

The verified league-strength and passing-network release serves production and is reachable from the GitHub default branch.

## Specs

- Governing: `spec://common/INFRA-006-continuous-deployment#contracts`
- Constraint: `spec://common/INFRA-006-continuous-deployment#runtime`
- Constraint: `spec://common/INFRA-006-continuous-deployment#recovery`
- Related: WI-094, WI-095

## Scope

- In: semantic version, GitHub change set, compatible CI Python for the existing franchise checks, immutable dry run and promotion, release receipt and live verification.
- Out: runtime migrations, source refresh, and automatic pass-event ingestion.

## Acceptance

- [x] The clean remote candidate contains current main and the serving production revision and passes the exact-source dry run.
- [x] The promoter verifies the alternate runtime before the switch. Public health and the production runtime identify the candidate commit.
- [x] The new authenticated routes are reachable. Inspect availability, runtime memory, duplicate jobs/cache keys and retention after promotion.
- [x] GitHub main contains the deployed revision and the release receipt.

## Result

The first dry run reached the existing franchise suite on Ubuntu 26.04. The runner defaulted to Python 3.14 and pip attempted to compile the pinned SciPy 1.15.3 from source. It failed on the OpenBLAS dependency. The reusable Check workflow now selects Python 3.12 for the existing pinned requirements. [First dry run](https://github.com/Tsyzhman/fantasy/actions/runs/42095816377)

The 0.3.154 promotion timed out waiting for its operator-prestaged artifact. The resumed candidate merges the feature branch into the verified serving commit `3e17630` (0.3.159), preserving the production lineage and the pinned Ubuntu runner. The new version is 0.3.161, following the separately attempted 0.3.160. [Earlier promotion](https://github.com/Tsyzhman/fantasy/actions/runs/42099830993)

Both workflows passed for commit `866b1aacc7a4f949c8d43ab511133914c12a094b`, tree `10ccc39cb6d95b6ffd0ddc061583cb413e30f39b`. The live run verified its 754,406,376-byte ZIP after transfer through the `deploy` SSH profile. The candidate passed all three Squad canaries and became healthy on port 3001 before Caddy switched traffic. The previous web drained for 30 seconds. There were zero pending migrations. Public and internal health, the release marker, and the web and worker image labels agree on the deployed commit. [Exact-source dry run](https://github.com/Tsyzhman/fantasy/actions/runs/42353897245) · [Deploy Production](https://github.com/Tsyzhman/fantasy/actions/runs/42354789557) · [Merge PR](https://github.com/Tsyzhman/fantasy/pull/56)

The authenticated browser opened the 18-club Bundesliga Massey table from the league page. MiXerr opened the file picker and rendered Barcelona and Deportivo Alavés with 46 and 14 directed links. Both maps appeared side by side at 1280 px and stacked at 360 px with no horizontal page overflow. The temporary session was removed. [StatsBomb sample](https://github.com/hudl/open-data/blob/master/data/events/15946.json)

All 263 public health and prior-CSS probe pairs succeeded, including 20 on the new revision. The 164 host samples observed one or two web processes and at most one worker. Available memory stayed at or above 5,352 MiB in those samples. Post-rollout readings were 224.8 MiB of 2 GiB for web and 1.601 GiB of 4 GiB for the worker, with zero restarts or OOM. Caddy and PostgreSQL kept their process identities. The pool queue was empty, with three READY revisions in each of 12 scopes and zero duplicate pool players, deadline jobs, Telegram deliveries or inherited runtime keys. Retention kept 0.3.159 for rollback and one completed database dump. Temporary artifacts for this run were removed locally and on the host.
