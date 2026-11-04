# Fresh acquisition failure — 2026-11-04

The subsequent authorized correction and its bounded rehearsal are recorded in
[FIXTURE-CORRECTION.md](FIXTURE-CORRECTION.md). This file retains the original
before-fix primary evidence.

The normal 269980b sync failed inside acquisition, before features/aggregate and
before replacing freezes.json. Old board conflicts and old intermediate files
are not results of this run. No production code, specifications, source data,
snapshot, BOARD or WAL were changed during this diagnosis.

## Reproduced primary failure

An isolated read-only/network-none diagnostic used the exact worker image
`sha256:1201dadd6ce48d0a36b263605b6621c80b7cc6e856d1cde70815d169cbb6685f`,
commit `269980b7bbc8d16c850aad89229423f5a2383346`, 1 GiB/no swap,
one CPU and 64 PIDs. It did not import research or run freezes.main/sync/import.
The ordered cached-form walk stopped at its first conflict after 3,413 columns,
396 cache reads and 53.251 seconds. All diagnostic containers exited and were
removed. No cache miss or network fallback was used.

- Franchise 563, `la_liga_2026`, column 8.
- Form: `https://fantasy-h2h.ru/form/view/h2h_tournament_franchise/15924`;
  cached 2026-11-04 12:27:28 UTC.
- Board: `https://fantasy-h2h.ru/h2h/team_match_data/520404`.
- Fallback: `https://fantasy-h2h.ru/h2h/match_data/8020124?v=721271&ajax=1`;
  cached 2026-11-04 12:27:32 UTC. No explicit tour identity was present.
- The title date is 10.10.2026; the current date map identifies round 9.

The current fixture dictionary reports round 10 for every numeric Sports match
in this response and raises `Conflicting board fixture identity`.

## Why the dictionary is wrong

All eleven observed numeric Sports IDs have **two** actual calendar memberships:
round 9 (`index=9465`, `tour=7580`) and round 10 (`index=9466`, `tour=7594`).
The map in freezes.py writes `fixtures[(slug, sports_match_id)] = scope`, losing
the earlier membership. This turns a multiple-candidate source into a falsely
certain round-10 identity. It is not evidence that the board itself contradicts
the retained complete calendar memberships.

The fresh primary schedule responses reproduce the metadata. Both relevant
responses were fetched at 11:47:04 UTC. These are not stale October cache hits.
For example, Sports ID 1957463 occurs as H2H match 778243 in index 9465 and as
787515 in index 9466, both dated 16 October. Index 9466 also contains different
H2H row identities for repeated Sports IDs within the same round. Index 9465
includes canceled Sports ID 1957458, dated 10 October; the same Sports ID also
appears in round 8. All 12 cross-round duplicate Sports identities are in La
Liga. No record has been removed or relabelled.

## Minimal candidate rule for review, not yet implemented

1. Retain a set of calendar scopes for every `(slug, Sports match ID)`.
2. Intersect the scope sets of the recognized current-lineup match IDs. Different
   unique scopes remain a real contradiction; do not union unrelated rounds.
3. When a title-date candidate set exists, intersect it with the retained match
   candidates. With no recognized fixtures, allow the existing date-only
   fallback only for one date scope.
4. Require exactly one surviving scope; zero or several remain fail-closed.
   Preserve the explicit H2H tour-ID path, all source records, and guard checks.

For this exact board, fixture candidates are `{round 9, round 10}` and date
candidates are `{round 9}`. Their intersection is uniquely round 9. The
read-only reproduction asserts this result alongside the current-code failure.
No arbitrary duplicate deletion, last-record choice, or weakened validation is
needed for this case. This does not prove every later board can be resolved;
other fresh ambiguities still require independent validation.

Suggested focused regressions if root authorizes implementation: shared fixture
aliases plus one compatible date resolve uniquely; disjoint fixtures/date fail;
disjoint fixture candidates fail; several remaining candidates fail; existing
unique fixture and date-only cases remain unchanged. The separate cross-duel
`verify(event)` source-scoping issue remains distinct and was not modified here.

## Evidence and preservation

[fresh-fixture-conflict.json](fresh-fixture-conflict.json) stores only URLs, IDs,
dates, memberships, primary row status flags and body hashes; no raw lineups or
manager names. [reproduce-fresh-fixture-conflict.py](reproduce-fresh-fixture-conflict.py)
rechecks the single known failing board under the same isolation constraints and
writes only this local evidence JSON.

No HTTP entry older than 30 days is needed for this proof. Preserve the five
fresh entries named by `form_cache.file`, `fallback_cache.file`, and the three
`primary_calendar[].cache.file` values. Their fetch times are November 4, so the
planned age-based cleanup should retain them automatically. Preserve the
canonical source files and published snapshot as instructed. Old pickles and
old HTTP entries were not used by this reproduction.
