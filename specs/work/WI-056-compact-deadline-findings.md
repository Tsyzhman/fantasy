# WI-056: Compact deadline findings

- Kind: `change`
- Canon action: `direct-edit`

## Outcome

Telegram deadline reports show each player once, group identical reasons within the starting squad and bench, and retain actionable risks without a repeated degradation list.

## Specs

- Governing: `spec://modules/telegram/FEAT-007-deadline-assistant#message`
- Affected: `spec://modules/telegram/FEAT-007-deadline-assistant#signals`
- Constraint: `spec://modules/telegram/INFRA-005-deadline-pipeline#delivery`

## Scope

- In: concise wording, grouping and duplicate suppression in the renderer, contract checks, immutable production release and resource verification.
- Out: provider ingestion, classification thresholds, squad selection, campaign schedule and message delivery.

## Acceptance

- [ ] The supplied Russia report retains all six affected players and their reasons, including the captain, in four grouped lines without a repeated summary.
- [ ] Identical causes remain separate between starters and bench; vice-captain and multi-reason findings remain explicit.
- [ ] General missing-data warnings remain visible and do not claim a complete check.
- [ ] HTML escaping, deterministic multipart output, schedule, popularity and Squad link remain valid.
- [ ] Required checks pass and the exact production revision is verified.
- [ ] Cache retention, duplicate processes/messages and memory are inspected before and after release.

## Result

Pending implementation and release verification.
