# Independent review of the 0.3.151 reporting scope

Reviewer: existing Sol 6.1 Max Telegram implementation chat,
`01a1a5ca-b107-70f2-8329-48fa8c9b07df`; read-only review of the independent
UI implementation in the shared audit checkout, 2026-11-04.

Initial actual-function probes confirmed four issues: ordinary franchise
rankings included reserves; export example limits preceded eligibility;
precomputed report summaries still included reserve/personal-only observations;
the freeze denominator label called H2H duels football rounds. All four were
assigned to the relevant implementation owners before release.

The completed UI/TypeScript diff has no remaining blocker. The reviewer checked
the franchise/league/round/team join, date/league/completed filters, inclusion of
active+frozen exactly once, exclusion of unknown/non-boolean active, retained
missing-lineup coverage, complete manager history and virtual personal groups.
Purchases, xFO examples and hypotheses use the same eligible XI population.
Twenty targeted analytics tests and an independent null/undefined/non-boolean
active probe passed. The implementation's broader targeted set passed 24 tests.
The two-duel/one-freeze regression yields 50% with one XI in the ranking.

UI changes are explanatory text and denominator labels; controls remain.
This review did not run a browser and does not establish Python/exporter or
production publication acceptance. Those checks follow separately.

## Final Python and exact-commit review

The reviewer additionally checked source-bound conflict rejection, OR projection
without input mutation, strict pandas/NumPy/nullable boolean handling, ordinary
franchises with no eligible XI, preserved group metadata/personal history and
eligibility before example limits. One P2 remained in candidate 26f8e91:
captain proofs joined a manager display name and could select another team's XI.
That candidate's Check/Deploy were cancelled before artifact delivery or
promotion; production stayed on 0.3.150.

Final candidate `043e28efe085bbc876721d945fdbae2025c3ff54` is approved with no
remaining review blocker. Its delta contains exactly analyze.py, enrich.py and
the integration regression: captain examples carry team identity and proofs
join franchise/league/round/team. The new integration test passed. An independent
actual-code probe returned the correct active captain/alternative for all 24
row orders; the previous implementation failed all 24. The reviewer did not
rerun the whole suite; the owner separately passed all 46 Python tests.

The source-state rehearsal confirms 62,669 fresh duel records project to 61,550
unique XI states, with unchanged 1,702 freeze events and source SHA, invariant
under reversal/shuffle/repetition. It executes the unchanged reducer only and
does not establish full production computation/publication acceptance.

## Final cache fixture delta

CI043e28e rejected a legacy cache fixture that omitted active; the new eligibility rule correctly excludes it. Candidate d31ca192f80467bc7cd611b688c3047d45545c5b changes only report-cache.test.ts (blob bd684fae0f5352c158e6b6abf486ee19b9bc8c62). Three explicit active XIs plus one reserve retain full cached/direct equality and add independent expected franchise populations3/2/1/0 versus personal populations4/3/2/0, ownership55/50/10/null, cache reuse and bounded retention. Owner passed22 focused tests; independent reviewer passed all5 cache tests and approved without blockers. No production implementation changed; earlier application/reducer/Python review remains valid. Final full CI and production acceptance remain required.
