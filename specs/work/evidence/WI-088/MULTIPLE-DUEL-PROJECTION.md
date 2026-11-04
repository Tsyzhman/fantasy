# Candidate 0.3.151 — one eligible XI, complete duel history

User decision: **«Да, один XI; достаточно одной игры в основе.»** The
intermediate double-weighting interpretation is withdrawn. Root owns the direct
FEAT-005 contract edit, independent review, full CI, release and production run.
This implementation chat changed Python code/tests and this evidence only; it
did not commit, deploy, acquire, aggregate production data or import a snapshot.

Final application candidate: `043e28efe085bbc876721d945fdbae2025c3ff54`,
committed/pushed by root. All 11 recorded Python implementation/fixture/test
files match this committed tree and the clean application worktree; Git's CRLF
to LF normalization is the only byte difference, in multiple-duel-roles.json.
Both committed-blob and tested-working-file hashes are recorded. In
analyze.py the follow-up changes only `captain_examples` to carry the exact team;
the tested board-state reducer hash is unchanged. The final verification receipts
name this commit. CI/review/deploy/publication remain root's separate checks.

## Before → after

- Production 0.3.150 rejected legitimate different roles across two H2H duels.
  The reducer now validates the full source identity, rejects conflicting roles,
  board, score, opponent score or completion within one source, then OR-projects
  active/frozen across distinct duels onto one XI. Missing source/boolean flags
  still fail closed. A projected active+frozen XI has one ranking weight.
- A projection formerly retained an arbitrary whole source row. The new result
  contains only the two flags. Source roles/results/events remain unmodified;
  there is no invented common board, score or duel.
- Ordinary private franchise/league summaries, coverage, purchase explanations,
  hypothesis cases/controls and xFO summaries now use non-personal active-any XI.
  Virtual groups continue using every unique personal observation. Summary ranks
  ignore unavailable groups, preserve ties and use neutral 50 for one valid group.
  No eligible XI yields null metrics/rank and zero coverage without losing groups.
- Export formerly capped examples before excluding reserves. The same eligible
  XI identity now filters players before the cap, so reserves cannot evict active
  examples. Identity is franchise/league/round/team, not manager display name.
- Raw squad/decision/purchase frames, source memberships, validation counts and
  personal manager summaries retain all records. Existing per-event freeze/basis
  snapshot fields retain their data. No board-state array or new snapshot schema
  was added. Existing feature definitions and stored peer/field gaps remain;
  this pass changes population selection for franchise outputs.

## Verification

[46 focused Python tests](multiple-duel-tests-final.txt) pass on Python 3.11.9,
numpy 2.2.6, pandas 2.3.3 and scipy 1.15.3. [Candidate file hashes and command](multiple-duel-python-verification.json)
bind the check to the implementation. `git diff --check -- scripts/franchise-analytics`
passes. The earlier `multiple-duel-tests.txt` retains the superseded synthetic
fixture failure caused by a missing display name; the final log is authoritative.

The tests cover 720 permutations of six sanitized source-role records, identical
duplicates, reversed same-source contradictions, untouched shared histories,
explicit/unknown/numpy/nullable booleans and active+frozen from different duels.
The full 200-observation fixture runs features → aggregate → enrich → hypotheses
→ export. It retains all raw rows and personal manager observations while
ordinary groups contribute 47/48/48 eligible XI and the virtual group contributes
8. The deliberately personal-only ordinary row is excluded only from franchise
outputs. Its manager retains all eight rounds. A separate all-reserve fixture
retains 192 source observations, all four registry groups and 24 personal managers
with no eligible franchise XI. Export examples and hypothesis cases/controls have
explicit reserve, personal and virtual regressions.

Independent review then found a remaining P2 in captain proofs: the private
enrichment join used manager display name and could combine the active XI with
a reserve XI belonging to a same-named manager. The [before regression](captain-proof-before.txt)
demonstrates reserve captain ownership 12.2 replacing the active captain's 6.2.
The small authorized follow-up carries `team` in private captain examples and
joins the exact franchise/league/round/team tuple without manager-name identity.
The new regression verifies the active captain and Player 7 alternative with
all three forecast values 20, even when the higher-valued reserve alternative
is read first. All 46 tests pass. The compact snapshot schema is unchanged.

The [follow-up hash receipt](captain-proof-verification.json) confirms the
reducer hash remains
`378c993454a5bab794ecd9b2128cd7d4d76cffbeb1bfbb1af0b547375f0f311b`.
The original rehearsal's whole analyze.py hash identifies the pre-captain-fix
file; its exact tested reducer is identical to the final candidate. The current
file hashes are in the final Python verification receipt. The production probe
was therefore not repeated after this unrelated private-proof join correction.

The [bounded fresh-source rehearsal](multiple-duel-projection-rehearsal.json)
executes only the exact AST-extracted candidate reducer in serving 1c9264f image
`sha256:cf9f730e6747050b6eec4f20ed87fd953f656b804ba2546ea9c1802267d1be1a`.
It uses read-only root/source, no network, 1 GiB RAM/no swap and one CPU. It does
not import application modules, run aggregate/acquisition, read credentials or
write source/cache/output. The expected fresh input SHA is checked before work.

It projects all 62,669 source-state rows to 61,550 XI keys with zero same-source
contradictions, and gives identical results for original/reversed/shuffled and
repeated identical records. The deep-copied history and source file SHA remain
unchanged. All 75 registry groups, 68,368 unique source squads, 1,702 events and
6,778 basis entries remain. Concrete 401 frozen-only and 441 active+frozen cases
match the accepted rule. Peak RSS is 190,820,352 bytes (182 MiB), charged memory
183,418,880 bytes at observation, zero cgroup max/OOM events. Host available
memory was 6,565,089,280 bytes before and 6,563,569,664 after. The container exited
successfully and was removed.

This verifies the new reducer against real source data. It does not prove the
memory/duration or publication acceptance of the complete production pipeline.
That acceptance remains open until root's controlled full run and readback.

## Resource and cache control

The test fixture directories are scoped temporary directories and were removed
by their context managers. No addressed Python test/probe process remains after
completion. No dependency/build cache was changed or server started by this
pass. The [final local inventory](multiple-duel-resources-after.json) records
2,627,267,133 bytes (2.45 GiB) in earlier ignored profile fixtures and the pinned
venv; these remain local:
automatic execution policy rejected their recursive cleanup twice, as recorded
in WI-088, so that operation was not retried. Other chats' Python watchers were
not stopped. Production source/cache, lock and published snapshot were untouched.

Before implementation, source-order and nullable-boolean precedents were checked
on Stack Overflow/Reddit and primary Python/pandas documentation. Nullable scalar
handling follows [pandas missing-data semantics](https://pandas.pydata.org/pandas-docs/version/2.3/user_guide/missing_data.html),
with existing `clean()` converting numpy booleans and `pd.NA` before the strict
eligibility predicate. User/domain policy comes from the explicit answer above.
