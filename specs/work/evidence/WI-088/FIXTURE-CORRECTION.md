# Fixture identity and per-board verification correction

Product changes are limited to `sources.py`, `freezes.py`, the targeted tests and
one sanitized fixture. No specification, BOARD, WAL, package/version, commit,
checkout, deployment, source record or published snapshot was changed here.

## Exact resolution cases

Recognized current-lineup Sports IDs each contribute their complete calendar
scope set. The candidate is the intersection of those sets, then the intersection
with the title-date scope set when that date is present in the calendar index.
Input calendars and sets are not mutated. Explicit H2H tour-ID resolution remains
unchanged; this corrects only the fixture/date fallback.

| Evidence | Result |
|---|---|
| One compatible recognized match scope, no date | That scope |
| A title date absent from the date index | No new constraint; recognized matches still decide |
| Unknown numeric Sports IDs mixed with recognized IDs | Unknown IDs add no constraint and cannot erase known evidence |
| No recognized IDs, one indexed date scope | Existing date-only fallback |
| No recognized IDs and no indexed date evidence | `None`, preserving the caller's missing-identity path |
| Incompatible recognized match scope sets | Error, even when a date agrees with one match |
| Matches and indexed date have disjoint candidates | Error |
| A broad date set containing a unique match candidate | Unique match scope |
| Ambiguous match/date sets with exactly one common scope | That uniquely supported joint scope |
| Several candidates remain, including ambiguous date-only input | Error |
| Legacy singleton `(slug, round)` fixture-map values | Accepted; previous regression tests unchanged |

`calendar_fixture_scopes` retains all declared aliases for each Sports ID rather
than overwriting an earlier calendar membership. `fixture_round` requires exactly
one surviving scope and retains the existing exception type/message for failure.
The sanitized fixture contains the real eleven numeric Sports IDs, calendar
memberships and source response hash/date of board 520404, with no manager names
or raw squads. It reproduces the proven singleton-overwrite failure and resolves
to La Liga round 9 under the new rule.

`verify(event)` now includes the exact `event.source` board URL in its state
selection before building `byid`. Two H2H duels sharing a football round cannot
mutate or reuse each other's state objects. The regression uses two independent
boards with differing active participants and scores; both board histories,
substitution objects and gains must remain correct. Running this test against
269980b's old `main` reproduced the wrong-source assertion; the candidate passes.
The existing aggregate conflicting-active/frozen guard remains unchanged.

## Validation performed

- 37 Python tests passed with the pinned production requirements. The matrix above
  is exercised with meaningful success/failure cases, plus the proven sanitized
  board and a two-duel state-isolation test. Log: `fixture-correction-tests.txt`.
- A separate network-none container used exact worker image
  `sha256:1201dadd6ce48d0a36b263605b6621c80b7cc6e856d1cde70815d169cbb6685f`,
  commit `269980b7bbc8d16c850aad89229423f5a2383346`, with candidate `sources.py`
  and `freezes.py` bind-mounted read-only. Source volume/root were read-only;
  memory/no-swap cap 1 GiB, one CPU, 64 PIDs. Preflight host available memory was
  6,351,134,720 bytes. Candidate archive SHA-256:
  `c00e76dbb17851eddbc667a2ccadc5c65ee6da862170d8b500e472419c569cfd`.
- The container imported only the candidate source helpers and replayed cached
  form/fallback parsing. It never ran `freezes.main`, sync, an importer, database
  access or any source/cache write. The exact nested candidate verification
  function was separately executed against two tiny in-memory synthetic boards
  and passed the source-isolation checks on Linux.
- 3,415 columns / 366 completed forms / 31 fallback attempts were reached in
  41.463 seconds. The proven board 520404 resolved to `la_liga_2026`, round 9.
  No true identity conflict was found in that checked prefix.
- Rehearsal stopped at missing cache:
  `https://fantasy-h2h.ru/h2h/match_data/8118690?v=721271&ajax=1`, belonging to
  franchise 563, form 15924, column 10, board
  `https://fantasy-h2h.ru/h2h/team_match_data/520438`. No request was made to the
  network. This is an incomplete-input stop, not proof that subsequent boards
  pass. One cached response used beyond the previous run's failure point was
  dated October 24; it is explicitly counted as pre-run cache in the evidence.
- Diagnostic container and public-code transport directory were removed after
  exit. No profiling or collector process was left running.

See `fixture-correction-rehearsal.json` and the reproducible bounded wrapper
`rehearse-fixture-correction.py`. Do not claim a full fresh rehearsal, successful
sync, new snapshot or production memory certification from this prefix result.
The older `reproduce-fresh-fixture-conflict.py` intentionally exercises the
unchanged 269980b image and remains the before-fix proof.

The twelve cross-round Sports IDs remain in the calendar source. Their complete
memberships are now represented explicitly; they are not a cleanup target.
Post-run audits must distinguish these disclosed provider aliases from duplicate
round identities or duplicated report observations, which remain forbidden.
