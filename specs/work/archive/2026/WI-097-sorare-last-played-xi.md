# WI-097: Restore reviewed SorareInside XIs and use the last played lineup

- Kind: `change`
- Canon action: `direct-edit`

## Outcome

Eight manually reviewed SorareInside player identities can publish the current forecast. Clubs without a usable published XI can use the verified XI from their latest finished match.

## Specs

- Governing: `spec://modules/machete/INFRA-004-sorareinside-starters#mapping`
- Governing: `spec://modules/machete/INFRA-004-sorareinside-starters#apply`
- Constraint: `spec://common/INFRA-006-continuous-deployment#root`
- Constraint: `spec://modules/telegram/INFRA-005-deadline-pipeline#freshness`

## Scope

- In: verify and record the eight existing UUID bindings, use the latest completed club XI in the affected fantasy scopes, publish through the existing Squad queue, and verify the production rollout.
- Out: changing saved user squads, inferring missing players, reactivating old roster memberships from a historical lineup, and modifying the Franchises collector.

## Acceptance

- [x] Each reviewed exception binds the exact saved UUID, player, club and conflicting dates. The normal check still rejects other mismatches.
- [x] A missing or structurally incomplete forecast uses only the latest completed match with eleven unique active starters and one goalkeeper. A verified upcoming forecast retains priority.
- [x] A dry run shows what would change. Publication is atomic with the existing queue and repeat runs produce no duplicate writes.
- [x] The exact checked release is deployed through the canonical promoter, and production readback verifies the eight forecasts, last-played coverage, health, memory, and cache retention.

## Result

Completed on 2026-11-06 with production 0.3.155, commit `ac22b542dc9ffa2b4908cda6fcf7347d26ecad09`. [Dry run](https://github.com/Tsyzhman/fantasy/actions/runs/42182014622) and [Deploy Production](https://github.com/Tsyzhman/fantasy/actions/runs/42183333553) succeeded. Both full checks passed, including 1,389 main tests, the new PostgreSQL regression, and 48 browser scenarios. The first dry attempt hit the Chromium install timeout after the floating runner moved to Ubuntu 26.04. Pinning the previously verified Ubuntu 24.04 runner restored the full check.

The read-only production rehearsal resolved all eight exact bindings and found 23 usable last-played XIs. The manual import, preceded by a private recovery snapshot of 35 club and competition pairs, applied five of the repaired forecasts and confirmed three already-matching XIs. It changed Benfica's Portuguese pool and Braga to their last played XI and recorded 21 other verified past XIs. The first automatic cycle on the new release confirmed all 23 fallback results and reported zero unresolved players. Lillestrøm's incomplete prediction remained visible as a source error while the last played XI supplied its flags. Sabah, Shakhtar, and Vitória de Guimarães lacked the full active XI required for fallback.

Database readback confirmed all 31 starter sets and matching Squad cache revisions. The queue and duplicate counts were zero. All 12 active scopes retained three READY revisions. Across the switch, 227 public health and prior-CSS probes passed, including 12 after promotion. Caddy and PostgreSQL kept their processes. There was one scheduler worker and no restarts or OOM. The settled worker used 1.13 GiB of 4 GiB. Two releases remained and the verified transport archive was consumed.
