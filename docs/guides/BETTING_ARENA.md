# Arena Fantasy

Mini-application: `/betting`, “Arena” item in general navigation. Uses existing active Fantasy accounts.

Before the change, Fonbet import saved several team totals in an overwritten snapshot. After the change, Arena receives a complete pre-match schedule of the selected event, maintains a virtual league and stores the accepted odds for each bet separately. Example: bet A on 2,50 and bet B on 2,60 for one win are calculated according to 2,50 and 2,60, respectively.

## Rules

- Starting balance - 100 000 coins, once for each user and Mia, Abella, Lana, Riley, Adriana.
- Single bets, whole amount from 1 to 100 000 coins. There are no payments, deposits, withdrawals or balance resets.
- The quote is fixed upon acceptance. Before receiving, the server checks Fonbet again; changing the price requires confirmation of the new price in the coupon. Accepted bids are not edited.
- Equity rating: available coins plus denomination of open bids. ROI - profit / turnover of calculated bets without full refunds.
- You can skip the match or simply not bet. The pass does not deduct coins or prevent you from changing your decision before the match begins.
- Five algorithms publish their parameters in the “Algorithms” tab. They consider matches in the next 24 hours, bet a maximum of 1 000 coins per match, a maximum of one outcome per match and 10 000 in open risk.

## Sources and limitations

Event catalog: public Fonbet `events/listBase`; full painting: `events/event`; names: `line/factorsCatalog/tables`. Fonbet does not have a stable public agreement for these endpoints. The unavailability of the source is shown in the interface. Unsupported or blocked selection will not be accepted.

Leagues are taken from the normalized database; the names of Fonbet tournaments are compared explicitly, with the division of divisions. Test pass 2026-09-07 received 367 events; 76 could not be confidently associated with a specific match of statistics. They are available by league with a clear marking of missing statistics, without probabilities from models and with manual calculation.

Automatic calculation: main outcomes, double chance, totals and team totals, both will score, obviously supported handicaps - according to the final fields of the FotMob score. Own goals are not restored through the sum of the players' goals. Cups, possible extra time, unconfirmed scores, time and special markets are awaiting administrator review. The coupon clearly shows the payment method. Some similar factors are intentionally left manual until there is a verified contract.

In the “Calculation” tab, ADMIN selects the outcome, result, writes down the reference/source, actual result and reason. The payout applies to all still open bets on that selection at their own odds. Repeated action does not award anything. The result and author are saved in the tickets. Cancellation of a match will refund bets; disappearance of the line is not considered a cancellation.

Models are experimental, not calibrated as a proven profitable system. Weather not included. Previous studies have not confirmed a sustainable ROI for 20–30%; high estimated EV is not a guarantee. Statistics and rating fields are saved until the bet, model changes do not change old tickets.

## Operation

The background loop starts only in the worker from instrumentation. The interval is 60 seconds after the end of the previous cycle. Distributed tenancy protects against overlay. `BETTING_LEAGUE_ENABLED=false` disables the cycle. The status is in `betting_sync_state`: `last_success`, `last_error`, `summary`.

The catalog is updated in batches. Per cycle, up to 16 complete paintings are loaded in the next 24 hours, two in parallel. The rest of the paintings are loaded when the match opens. The title catalog is cached for 6 hours. The current painting is one per event; The history of accepted bet odds remains unchanged. An old quote older than 5 minutes will not be accepted. HTTP is limited to 15 seconds and 25 MB of unpacked response. Line pages - 30 events; The browser does not load all the murals at once.

Postings and rates are not cleared. Old events without bets and decisions are deleted in batches of 100 after 30 days. `.tmp`, local env and QA artifacts are excluded from Git/image. Repeated requests are protected by a unique account key; the balance is blocked for the duration of the transaction.

Accounting diagnostics (result must be empty):

```sql
SELECT a.id, a.balance, COALESCE(sum(l.delta), 0) AS ledger_balance
FROM betting_accounts a LEFT JOIN betting_ledger l ON l.account_id = a.id
GROUP BY a.id HAVING a.balance <> COALESCE(sum(l.delta), 0);
```

Migration `20260907100000_virtual_betting_league` only adds tables and relationships. The release is carried out by the standard `Deploy Production`: backup, verified recovery and migration to a temporary database, then production migration, canary and web/worker replacement. Rolling back the application does not delete league logs.

## Checks

- Full `npm run check`: 1 019 successful tests, 1 regular skip, lint without errors, typecheck and production build.
- DB: real separate `fantasy_betting_test_20260907`, all 41 migration from scratch; unique accrual, competitive write-off, network replay, different accepted odds, re-calculation, outdated quote, match start and log reconciliation.
- Catalog: individual regressions of non-standard factor numbers and different divisions.
- Browser: existing test user session, line, coupon with five ratings, accepting bid, history with original price, rating; 390 px, light and dark themes, without horizontal overflow and browser console errors.
- API: 401 without a session, 403 for someone else's/invalid Origin, 400 for invalid JSON, 413 if the size is exceeded.

Spec: `spec://modules/betting/FEAT-001-virtual-league#root`; WI-005. The unfinished runtime WI-001 and visual changes WI-004 are not included in this release. Their existing documents are preserved; spec-space diagnostic for missing code WI-001 is expected for a separate branch of this release.


Production v0.3.57 launched 2026-09-07; workflow 34107206679 success. Revision d9abf51 matches health, web, worker and .release-commit. Reconciliation of 33 accounts: 0 duplicates and 0 discrepancies. On the first smoke - 368 events. Evidence: specs/work/evidence/WI-005.
