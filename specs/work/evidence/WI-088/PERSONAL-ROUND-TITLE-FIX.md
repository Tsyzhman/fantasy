# Candidate 0.3.152 — preserve current personal rounds

Application commit: `3e58a9f3d7d45fc9f26b815f9b9c33a80e2d4b65`, committed/pushed
by root. Canon action for this correction: **none**; complete personal history
already belongs to FEAT-005#contracts. This implementation chat made no commit,
deployment, collector invocation, production aggregate or import. Application
code remains frozen; root owns full CI, review, promotion and the complete run.

## Cause and impact

Production 0.3.151's normal fresh run failed in `research.franchises()` while
parsing personal history UID `1101905285`. The subsequent scheduled run reported
the same error for UID `1115037086`. `pool()` prints ERROR and re-raises; its
executor waits for the other submitted futures before unwinding. This is a fatal
acquisition error, not an intentionally missing history result. It occurs before
the new franchise/forms files are saved, then metadata, players, squads, server,
freezes and all calculation/export stages cannot proceed. The root log confirms
the previous published snapshot remains available.

The exact cached personal response was fetched at `2026-11-04T14:59:27Z`.
The [read-only diagnosis](personal-round-link-0151-diagnosis.json) reproduces the
serving parser error. Its sole rejected link for this profile is:

```html
<a class="async_block_modal score_result in_progress" data-tour_id="0"
   href="https://fantasy-h2h.ru/analytics/fantasy_team_tour_data/641000/0/349/"
   title="тур 4">0</a>
```

Origin, team, numeric path and competition identity satisfy the existing checks.
The old title expression requires a comma immediately after the round number.
This legitimate current-round title has none. The full profile has twelve team
histories and 111 round links, 110 of which match the old title form.

One root-authorized [fresh public GET](personal-round-zero-primary-get-0151.json)
of that modal URL with `ajax=1` returned HTTP 200 at
`2026-11-04T15:04:34Z`, response 94,041 bytes, SHA-256
`7afff5e94c44cf7a049655e2680bd27e4785272733beb7a5a5f13ef69a832cb3`.
Its content has real selected players and repeated «Матч еще не начался» markers.
The modal is not an absent lineup. The diagnostic's `.roster li`/football-link
counters are not the collector's `li[data-player_id]` selector and must not be
interpreted as an empty XI. Dropping this link or the whole profile would lose
available personal history. No response was written to source cache.

## Before → after

One application line changes:

```python
# Before
re.match(r'тур (\d+),', title)
# After
re.match(r'тур (\d+)(?:,|\Z)', title)
```

Every previously accepted comma title remains accepted, including a line break
after its comma. A short title must end exactly after its integer; trailing
garbage, a fractional number, a newline or a suffix without the comma fails.
The fixture round remains 4; URL/data-tour ID 0 is not converted into football
round zero. Completed rounds and the entire profile remain. Domain/path/team,
container and conflicting-CID checks are unchanged. No status is relabelled as
finished; no lineup, forecast, future-history or calendar guard is changed.

The intermediate fullmatch formulation was rejected before release because it
narrowed legacy comma-title handling. Its newline regression failed as expected;
the final expression above passes it. Only the final grammar is committed.

## Local verification

[All 50 Python tests](personal-title-parser-tests.txt) pass on the pinned Python
3.11 environment, including the new sanitized real-source fixture, mixed current
and completed rounds, legacy comma/newline compatibility, exact short-title
termination, malformed titles, wrong host/team/path, relative URLs, missing
container and conflicting competition IDs. Existing lineup, source identity,
memory, projection, export and full small-fixture tests also pass.
`git diff --check` passes.

The [verification receipt](personal-title-parser-verification.json) binds the
three changed application/fixture/test files to the committed candidate with
exact matching Git blob and working-file hashes. `sources.py` SHA-256:
`aadae950bf2a0e0c230bd8d7dfc0cb9569b6bfcac9e53f76428fd761e5bf987c`.
Candidate `personal_teams` AST SHA-256:
`7ece6d66c3c7d81cb6fa7eb7976c82a507bf4d1fd4141332184a1e37e0bee11c`.

## Complete cached-source rehearsal

[Full receipt](personal-title-parser-rehearsal-0151.json),
[compact summary](personal-title-parser-rehearsal-summary-0151.json),
[reproducer](rehearse-personal-title-parser.py).

The exact candidate AST and the serving old parser run on every fresh cached
personal response from the current collection window. To prove coverage, the
helper independently resolves the same identity chain from fresh primary cache:
74 franchise pages → 734 form URLs and 803 profile URLs → union of 782 board UIDs
and 803 profile UIDs → **820 submitted personal UIDs**. Cached personal responses
contain exactly those 820 UIDs, with no missing or additional UID. The progress
denominator 803 belongs to the preceding profile pool; it is not the personal-job
count. The [initial coverage-only failure](personal-title-parser-rehearsal-0151-initial-coverage.json)
retains the superseded incorrect count assumption; no parser ran in that attempt.

The helper retains 18,384,705 compressed bytes from 2,431 fresh source-cache
entries in private memory, bounded to 128 MiB compressed input. Both parsers use
the same immutable bytes through the real JSON/soup/str boundary. This keeps the
comparison stable even if the independently authorized timer writes source cache;
global cache immutability is not a prerequisite or a claimed guarantee. All held
input hashes stayed identical; zero live personal cache files changed in this
particular observation.

Results:

- Candidate: **820/820 passed**, no exception and no omitted UID.
- Old parser: **578 failed**, all matching the short in-progress Liga Europa
  round-4 title form with data-tour ID 0; the other 242 outputs match the candidate
  exactly. The old success population is neither modified nor filtered.
- Both observed failing UIDs `1101905285` and `1115037086` occur in the old error
  list and passed in the complete candidate run. The first retains twelve teams,
  all 111 round observations and Liga Europa rounds `[1,2,3,4]`.
- Across the complete parser output, 7,512 team histories and 68,866 available
  team/round observations remain. These are parser availability counts, not a
  claim about final calendar-mapped production squads or published observations.
- Elapsed 160.131 seconds; peak RSS 82,288,640 bytes (78.5 MiB). Cgroup max/OOM
  counters are zero. Available host memory was 6,565,138,432 bytes before and
  6,619,238,400 bytes after. Exit 0; the diagnostic container was removed.

Isolation uses exact serving 151/d31ca19 image
`sha256:27ad0032b39975674757e0f536bd0ff320d28f2f34b2b5070fabe7acdaade9dd`,
read-only root/source volume, network none, 1 GiB RAM/no swap, one CPU and an
eight-minute hard timeout. It invokes no collector/import/aggregate and writes
no source/cache/output on production. The sole earlier authorized GET used a
separate read-only bounded container and did not populate cache.

## Remaining acceptance and resources

This is complete parser/source verification, not a successful full refresh.
Normal fresh metadata must still resolve actual calendar/tour identities, and
the existing lineup/future-history/validation guards remain in force. Root must
complete the reviewed 152 deployment, controlled full run and published readback.

[Final resource check](personal-title-resources-after.json): no addressed
test/diagnostic process remains. Both diagnostic containers exited
and were removed. No global build/dependency cache was changed and no production
source/cache/snapshot was removed. Earlier local ignored profile fixtures/venv
remain under the previously recorded automatic cleanup rejection; this pass
introduces no persistent fixture run directory.
