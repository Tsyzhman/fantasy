# WI-085: Telegram consent, deadlines and fenced recovery

- Kind: `fix`
- Canon action: `none`

## Outcome

Prevent revoked, stale or duplicate deadline deliveries and enforce the 08:50 Moscow cutoff.

## Specs

- Governing: `spec://modules/telegram/INFRA-005-deadline-pipeline#delivery`
- Constraint: `spec://common/INFRA-006-continuous-deployment#root`

## Scope

- In: Delivery consent/campaign checks, revoke pending sends, cutoff, abandoned lease recovery and publication fencing; reproduce related Telegram limiter/inbox risks if bounded.
- Out: unrelated work, interface capability removal, unreviewed production mutations.

## Acceptance

- [ ] No real Telegram sends; normal active delivery once, revoked delivery never, cutoff boundaries, expired lease unknown/no resend, stale stage cannot publish.
- [ ] Applicable tests pass and before/after evidence is recorded.

## Dependencies

- Related: WI-084

## Result

In progress.

