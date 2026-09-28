# WI-008: KHL on the server and Betting fixes

- Kind: `fix`
- Canon action: `direct-edit`

## Outcome
Production shows the real KHL catalog, saves and restores rosters; Betting uses the Squad list and tips from five models for the selected match, including the history of the national leagues and the UCL/UEFA.

## Specs
- Governing: `spec://modules/khl/INFRA-001-khl-data-ingestion#operations`.
- Governing: `spec://modules/khl/INFRA-002-khl-storage-and-api#root`.

- Governing: `spec://modules/betting/FEAT-001-virtual-league#feed`.
- Governing: `spec://modules/betting/FEAT-001-virtual-league#algorithms`.
- Governing: `spec://modules/khl/FEAT-002-khl-squad#root`.

## Scope
- In: directory/worker/KHL restoration; Squad leagues in Betting, tips inside the match, history of the Champions League/UEFA + championships, hiding manual settlement UI; one-time rate reset by direct order; production acceptance.
- Out: unconfirmed feeds, xG, trained forecast and sending transfers to the provider.

## Acceptance
- [x] A proven tournament and a complete real catalog are available on production.
- [x] Re-synchronization updates freshness without duplicates and unlimited accumulation of receipts.
- [x] An authorized browser opens a section on desktop/tablet/mobile.
- [x] Checked release, health, memory and queue.

- [x] Betting uses the general Squad list, including non-event leagues.

- [x] The selected match displays five personalized algorithm tips.
- [x] By direct order of the user, Betting was reset with a backup and restoration of starting balances.

- [x] The KHL is restoring its last roster upon entry; you can open a new option.
- [x] Champions League/UEL use the history of the championships and the previous general stage; unknown main time is not replaced.
- [x] The manual calculation tab has been removed.

## Result
Completed. It was: KHL_ENABLED=false and 0 tournaments after 0.3.58; Betting was limited to busy leagues, tips were only in the coupon, European cups were blocked entirely.

Now: production 0.3.60, commit 15b5a6c9083cf60a292a90f7ef4bf9167c5b0bdd, release 20260907T112939Z-v0.3.60-15b5a6c. KHL catalog 694/22, fenced single-flight refresh 45s, stable receipts with the same data, restoration of your own variant and an obvious new variant. Calendar/protocol/xG gates remain open; no unverified data was generated.

Betting uses a general list of 12 Squad leagues and a server-based ban on betting outside the list. Five tips are found inside the selected match; legacy line disables actions. The manual calculation tab and dialog have been removed; the virtual settlement is saved. For the Champions League/UEL, the history of national championships and past general stages is available; windows 20/8 save up to 8/3 European games. An empty CoreMatch score can use the explicitly stored goals of both teams, rather than the sum of the players. All five real UCL matches tested received numerical scores from all models; cutoff checked. For the playoffs, the regular time is not invented.

Checks: CI workflow 34116440816 — 1075 unit tests pass, lint 0 errors/98 warnings, typecheck/build pass. DB catalog test on 694 lines checked repetition without receipts, correction and absence of duplicates; wallet DB test tested failure outside Squad, concurrency/retry and automatic settlement of the general stage of the Champions League while maintaining the prohibition of an ambiguous final. Production smoke 34117242298 — auth 1 pass, UI 10 pass/17 intended skips: desktop/tablet/mobile, valid UCL model inputs, 5 tips, KHL save/reload/return/new variant. The first smoke 34115224750 detected a duplicate-name conflict on a new login; default restore has been corrected and re-acceptance has passed.

By direct order of the user, 50 open bets (50 000 coins) and 125 previous decisions were reset one-time. All 33 accounts have been restored to 100 000 coins; ledger mismatch/duplicates=0. Backup of Betting tables saved and checked via pg_restore --list; path and SHA-256 in evidence. After smoke, the temporary lease pause was removed: cycle 11:38:24 UTC successful, 12 leagues/202 events, 39 new bets version 2026-09-07.2, outside Squad=0, ledger mismatch=0, duplicate tickets=0. New rates were not reset again.

Resources after smoke: web 433.6 MiB, worker 131.3 MiB, PostgreSQL 1.188 GiB; web/worker healthy, restarts=0. KHL raw=0, receipts=2776 are stable after several cycles, the only QA draft is reused, duplicate entries=0. The full-time promoter saved the current one and one rollback; build cache 82.95 MB. Local PostgreSQL test has stopped. Historical ignored cache/heap files, the deletion of which was previously blocked, are not touched.

No new migrations added: 46 applied, 1 historical rolled-back audit row, unfinished=0. Evidence: specs/work/evidence/WI-008. The next runtime commit contains only enhanced browser tests and this report; There is no runtime diff.
