# Fresh per-duel state diagnosis — production 0.3.150

The failed normal trial produced a fresh `freezes.json` at
2026-11-04 13:36:10 UTC (16:36:10 MSK), SHA-256
`68755f48537764d9e161546b1c6efa2761fb51ebbe2f6313d17490cf3daefe0f`.
It has 62,669 state records / 61,550 unique franchise/league/football-round/team
keys, an empty board audit and 1,702 verified freeze events. These are fresh-run
results, not the earlier October counts. Aggregate stopped before publication.

## Complete conflict classification

| Category | Football-state keys | Franchises | Distinct league/round scopes |
|---|---:|---:|---:|
| Different active flags | 26 | 9 | 1: UCL round 2 |
| Different frozen flags, including overlap with active | 45 | 22 | 2: Championship 10 and UCL 2 |
| Frozen differences with agreeing active flags | 32 | 19 | 2 |
| Both active and frozen differ | 13 | — | — |
| Union of all conflicting keys | 58 | 22 | 2 |

A separate read-only pass using the full identity
`franchise/slug/round/team/source` found **zero conflicting keys within the same
source board**. The differences occur between distinct H2H duels sharing a
football round. Repeated-key counts alone do not authorize deletion or a
last/any/all reduction.

## Concrete primary evidence

| Franchise / football round | Team ID | First duel | Second duel |
|---|---|---|---|
| Я·К·У·Д·З·А (401), Championship 10 | 590459 | 514485: reserve, exchange/frozen; score 78 | 514501: reserve, no exchange; score 78 |
| Я·К·У·Д·З·А (401), Championship 10 | 599673 | 514485: reserve, exchange/frozen; score 79 | 514501: reserve, no exchange; score 79 |
| Стадион33 (441), UCL 2 | 632180 | 538054: reserve, exchange/frozen; score 69 | 538094: active, board 2, not frozen; score 69 |
| Стадион33 (441), UCL 2 | 630929 | 538054: active, board 6; score 83 | 538094: reserve, not frozen; score 83 |

The canonical source table for franchise 401, form 15921, contains distinct
columns `1.10` and `1.11`, pointing to 514485 and 514501. Both have explicit H2H
tour ID 7579. The two inactive-team cells contain `exchange` only in the first
column. This is the contract's primary frozen marker; a reserve list alone does
not distinguish frozen from ordinary reserve. The cached form was fetched at
12:24:57 UTC, within the authorized acquisition-resume checkpoint.

Cached board 514485 was fetched at 13:34:11 UTC and confirms both teams in the
reserve list. Board 514501 was absent from the source cache because the normal
code fetches full boards only for freeze events. Root authorized a fresh bounded
read-only GET. Three exact GETs, without retries or source-cache writes, returned
HTTP 200 at approximately 13:46:18 UTC (16:46:18 MSK):

- `https://fantasy-h2h.ru/h2h/team_match_data/514501?ajax=1`: title date
  16.10.2026; both 590459 and 599673 are reserve.
- `https://fantasy-h2h.ru/h2h/team_match_data/538054?ajax=1`: title date
  20.10.2026; 632180 is reserve and 630929 is active.
- `https://fantasy-h2h.ru/h2h/team_match_data/538094?ajax=1`: title date
  20.10.2026; 632180 is active and 630929 is reserve.

Live HTML roles agree with the parsed per-source state in these examples. Each
response's timestamp, byte count, body hash and sanitized numeric participants /
CSS roles are in `fresh-duel-role-confirmation.json`. No raw manager names,
lineup payloads or credentials were saved. `fresh-board-state-conflict.json`
contains the matching cached table/board evidence and complete aggregate scope
classification.

## Historical diagnosis and the accepted decision

`FEAT-005#freezes` explicitly owns separate board verification, exchange events,
substitutions and success per source board. That history already supports these
distinct duels and must remain separate. `FEAT-005#contracts` requires one stored
XI per team/league/football round and no repeated observation within a group.

The production 0.3.150 projection in `validated_board_states` keys only by
franchise/league/football-round/team and demands one active/frozen pair. Real
per-duel decisions do not always fit that representation. Source scoping in
0.3.150 is working in the concrete evidence above; selecting the last source
would erase a verified decision.

The then-unresolved policy affects the profile: `analytics.ts:233–234` counts
`Fact.active === true/false` as active/reserve rounds; UI labels include
`Вне основы`. `Fact.frozen` is carried in the snapshot, but the current production
report/UI derives freeze history from per-event `frozen`/`substitutes` lists and
`freeze.basis`, not from the scalar fact flag. Discarding only the frozen check
would still leave 26 active conflicts and would not answer the profile/ranking
weight question.

No complete scalar reduction can be inferred from source truth alone. Root has
asked the user the mandatory domain question, using the concrete Стадион33
example:

1. One XI per football round, include it when at least one H2H duel is active;
   retain freeze episodes separately.
2. Give every H2H duel its own weight.

The first requires an explicit cross-duel projection policy. The second changes
the current no-duplicate observation/ranking contract. No code/canon change or
new collector, importer, deployment or publication was made during this
diagnostic phase.

The user's final answer is **«Да, один XI; достаточно одной игры в основе.»**
This supersedes the intermediate proposal to give each duel a separate ranking
weight; double weighting is withdrawn. The accepted rule is one unique XI per
franchise/league/football-round/team, eligible for the ordinary franchise when
non-personal and active in at least one source duel. The projected frozen flag
means frozen in at least one duel. Both flags can therefore be true when the
roles belong to different source duels. Personal manager history and virtual
personal groups keep every unique source observation; per-source freeze events,
substitutions and results keep their existing identities.

Root updated FEAT-005#contracts and #freezes before candidate 0.3.151. The
implementation validates one source board first, rejecting contradictory
roles/results, then OR-projects the two flags across distinct duels. It never
selects a source/board/score for that scalar projection or mutates source history.
The same eligible XI identity now scopes private franchise summaries, league
coverage, purchases, hypothesis cases/controls and xFO summaries/examples.
Export eligibility precedes the two-example limit. Raw squad/decision/purchase
frames, source membership sets, validation totals and personal manager metrics
remain complete. No new copy of raw board states was added to the snapshot.

All 46 focused Python tests pass, including 720 input permutations of the
sanitized source cases, the full small fixture pipeline, no eligible XI at all,
nullable flags, retained personal rows, strict same-source errors, controls and
the exporter example cap. An exact candidate-reducer rehearsal on the unchanged
fresh freezes file resolved 62,669 records into 61,550 unique XI states. Reversed,
shuffled and repeated identical records gave the same projection; 1,702 events,
6,778 basis entries, 75 registry groups and 68,368 unique source squads remained.
Peak RSS was 190,820,352 bytes, with zero cgroup max/OOM events; the isolated
read-only/network-none container was removed. This is reducer verification,
not a full aggregate, importer or successful publication. Evidence:
[implementation and limits](MULTIPLE-DUEL-PROJECTION.md),
[46 tests](multiple-duel-tests-final.txt),
[candidate hashes](multiple-duel-python-verification.json),
[fresh reducer rehearsal](multiple-duel-projection-rehearsal.json).

The subsequent private captain-proof join correction does not change this
reducer. [The follow-up receipt](captain-proof-verification.json) verifies the
same reducer hash against the final candidate and records updated file hashes.
The production probe was not repeated; all 46 final tests include the exact-XI
regression for two same-named managers in active and reserve lineups.

## Isolation and cleanup

All source reads ran in the exact 1c9264f image
`sha256:cf9f730e6747050b6eec4f20ed87fd953f656b804ba2546ea9c1802267d1be1a`,
with a read-only root/source volume, 1 GiB/no swap, one CPU and 64 PIDs. Initial
cache-only probes used network none. Only the three explicitly authorized public
GETs used bridge networking; no database/runtime credentials were passed.
Responses were bounded to 8 MiB and 15 seconds each. No network response was
written to source cache. Every diagnostic container exited and was removed;
production source files, kernel lock, application state and snapshot were not
modified. Preflight host available memory exceeded 6 GiB.
