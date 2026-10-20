# WI-078: Six transfers only in Champions League round three

- Kind: `change`
- Canon action: `direct-edit`

## Outcome

The production Sports.ru Champions League planner allows six transfers only in tour 2755 on 2026-10-20, then returns to three without carrying unused transfers forward.

## Specs

- Governing: `spec://modules/machete/FEAT-001-global-ranking-strategy#transfer-rules`
- Affected: `spec://common/INFRA-006-continuous-deployment#runtime`
- Constraint: `spec://common/INFRA-006-continuous-deployment#root`

## Scope

- In: exact provider-tour exception in live and cached rules, regression checks, immutable release and production/resource verification; use the operator-supplied Nik_server.conf to restore the existing VPN prerequisite after the first promoter attempt failed its FPL probe.
- Out: saved squad changes, provider transfers, other league quotas, transfer banking and database migrations.

## Acceptance

- [x] Tour 2755 permits six transfers and seven exceed its allowance, independent of the local ordinal.
- [x] Round four and subsequent rounds allow three without banking; other leagues, seasons and FPL retain their rules.
- [x] Both cached readers and live rules apply the exception without rewriting cached player data or saved squads.
- [x] Required release checks pass and production UI/health confirm the exact revision with continuous availability.
- [x] Memory, cache and duplicate-process checks are recorded and temporary server resources and observation processes are cleaned up.
- [x] The operator-supplied plain WireGuard profile passes the guarded API probe; its private deployment configuration is updated and actual FPL/Telegram read-only probes pass.

## Result

Completed 2026-10-20. Production `0.3.140`, commit `1f1ad3bb1b8fb710d9abcdfd424847e88ddffff8`, tree `bc1cee3c084ef2146bf3cc4beecb8e2c70f8acb1`. [Deployment 39390875234](https://github.com/Tsyzhman/fantasy/actions/runs/39390875234) succeeded. Evidence: [verification record](../../evidence/WI-078/verification.json).

Before, Champions League tour 2755 allowed three transfers. The authenticated production-rendered page now contains allowances `[6,3,3,3,3,3]` for tours three through eight and describes six transfers in the current tour. The exact provider ID and deadline identify this exception, because the third tour currently has local ordinal two. Other Sports.ru league rules, the existing Championship exception and FPL banking remain unchanged. Six/seven-transfer boundaries, shifted cached offsets and no banking pass direct regression checks.

Local full checks passed 1325 tests with two platform skips, lint with zero errors and 236 existing warnings, typecheck and build. Focused planner/UI checks passed 193 tests. The final Linux CI revision passed 1327 tests without skips/failures, all deployment checks, lint, typecheck and immutable image builds. Five new checks exercise the actual shell validator: plain WireGuard, complete AmneziaWG, rejected partial obfuscation, rejected command hooks and required identity/default route. The plain-profile failure was reproduced before correcting the validator.

The first promotion stopped before switching traffic because the previous VPN endpoint was unreachable. The operator supplied `Nik_server.conf`; the existing image accepts its original plain WireGuard fields. The guarded adapter now validates either complete format and promoted the new tunnel only after an official FPL probe. The existing encrypted deployment secret was updated. No private configuration entered Git or evidence. FPL returned HTTP 200 with 1785108 bytes; Telegram getMe returned HTTP 200/ok without sending a message.

The canonical promoter ran with no migrations, passed its domain canaries and drained the prior web for 30 seconds. Public health, release manifests and both image labels agree on the exact revision. All 289 availability observations returned HTTP 200; the prior JavaScript asset remains accessible. All 148 saved squads, 2207 saved player rows and the original cached pool metadata have identical checksums. Duplicate squad players and running scope/job keys are zero.

One healthy web and one healthy worker remain, with zero restarts/OOM in the final runtime and one retained rollback release. Settled memory samples: web 157 MiB, worker 1.06 GiB, PostgreSQL 910.1 MiB; host available 6526 MiB. Host build cache is zero. Failed-attempt archives (875573474 bytes), successful-release archives and temporary probe containers are removed; the observation helper is stopped. Automatic approval review rejected optional recursive removal of the local `.next` cache with `blocked by policy`; its 429703368 bytes remain in this isolated worktree. This is a disk-cache retention limitation, not a missing release check.

No new REVIEW or TECHDEBT items.
