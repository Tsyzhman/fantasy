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

- [ ] Each reviewed exception binds the exact saved UUID, player, club and conflicting dates. The normal check still rejects other mismatches.
- [ ] A missing or structurally incomplete forecast uses only the latest completed match with eleven unique active starters and one goalkeeper. A verified upcoming forecast retains priority.
- [ ] A dry run shows what would change. Publication is atomic with the existing queue and repeat runs produce no duplicate writes.
- [ ] The exact checked release is deployed through the canonical promoter, and production readback verifies the eight forecasts, last-played coverage, health, memory, and cache retention.

## Result

In progress.
