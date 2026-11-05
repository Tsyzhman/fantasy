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

- [ ] The clean remote candidate contains current main and the serving production revision and passes the exact-source dry run.
- [ ] The promoter verifies the alternate runtime before the switch. Public health and the production runtime identify the candidate commit.
- [ ] The new authenticated routes are reachable. Inspect availability, runtime memory, duplicate jobs/cache keys and retention after promotion.
- [ ] GitHub main contains the deployed revision and the release receipt.

## Result

The first dry run reached the existing franchise suite on Ubuntu 26.04. The runner defaulted to Python 3.14 and pip attempted to compile the pinned SciPy 1.15.3 from source. It failed on the OpenBLAS dependency. The reusable Check workflow now selects Python 3.12 for the existing pinned requirements. [First dry run](https://github.com/Tsyzhman/fantasy/actions/runs/42095816377)
