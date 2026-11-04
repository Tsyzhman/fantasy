# WI-088 implementation result

The code and focused checks are ready for root integration. The real monitored
Linux refresh/publication has not been run and WI-088 is not complete.

| Item | Before | After / actual evidence |
|---|---|---|
| Python decision accumulation | Wide dictionaries for all selected players plus DataFrame conversion | Column value buffers, released one column at a time |
| Detailed JSON | Full `to_dict` + recursive clean + full JSON string | Atomic streamed record encoding; no record removal |
| Downstream decision file | Full wide player features | Every row, 21 columns needed for enrichment/validation/xFO; purchase/history features preserved separately |
| Host/job budget | 6 GiB available / 5 GiB hard no swap | 4.5 GiB available / 3.5 GiB hard no swap; 1 GiB host reserve unchanged |
| Board ambiguity | Last duplicate row silently wins | Different active/frozen flags abort before outputs and import; legitimate distinct duel histories remain |
| Production observability | No exact normal-stage child peaks | Linux `FRANCHISE_STAGE` RSS and cgroup logs; read-only host/cgroup monitor |

Measured Windows process-tree/native working-set peaks with pinned production
libraries (Python 3.11.9, numpy 2.2.6, pandas 2.3.3, scipy 1.15.3):

| Synthetic aggregate | Before | After |
|---|---|---|
| 12,000 observations, 70,340 features | 1,162.67 MiB / 14.718 s | 531.82 MiB / 18.672 s |
| 61,000 observations, 905,850 decisions, 70,340 features | Not run at this scale | 1,377.67 MiB (1.345 GiB) / 84.813 s |

The 61k experiment used four synthetic groups/eight rounds and is aggregate only.
It excludes a complete production acquire, the waiting Node importer parent,
full Linux cgroup file-cache accounting, the actual 75-group current history and
the production import. Those are explicit limits, not measured savings. The cap
must be confirmed by the real run. The older WI-079 successful Linux calculation
had 4,689,364 KiB maximum child RSS (4.472 GiB) before these changes; it cannot be
compared as an identical input against the synthetic fixture.

The complete 200-observation fixture matches the immutable baseline in all six
canonical JSON artifacts after omitting only `generated`. Canonical byte hashes
distinguish integer/float/boolean encodings. The full small pipeline was repeated
after the fail-closed board guard. 34 Python tests pass, including no-start below
headroom, no swap, immutable shared-lock configuration, dataframe inference/null
semantics, atomic JSON failure and rejecting contradictory flags before outputs.

Production read-only evidence shows why an old import is unsafe: the on-disk
artifacts are from several dates; the unpublished October 24 report has 411
missing active states in Championship round 11 and 1,529 excess repeated state
keys. Of the repeats, 166 have different active/frozen flags, 1,363 agree on those
flags. Distinct H2H matches can use the same football round. The code preserves
history and stops on unresolved conflicting flags. Do fresh acquisition; do not
delete/relabel repeats or import stale prepared outputs. A lasting repeated-duel
ambiguity requires canonical review before a new snapshot can be published.

Root owns the INFRA-006/FEAT-005 budget canon, structure registration, workflow
dependencies, integration, full CI, release and real verification. See
[RUNBOOK.md](RUNBOOK.md). No commit/push/deploy/production collector or import was
performed here. No secret or personal squad payload was exported.

Internet precedents were searched first on Stack Overflow and Reddit; technical
decisions were checked against primary documentation. pandas documents the
memory cost of intermediate copies and column projection in its
[2.3.3 scaling guide](https://pandas.pydata.org/pandas-docs/version/2.3.3/user_guide/scale.html).
The same-version [DataFrame constructor](https://pandas.pydata.org/pandas-docs/version/2.3.3/reference/api/pandas.DataFrame.html)
supports column Series without a second copy. Equal Docker memory and swap caps
disable swap per the [Docker resource documentation](https://docs.docker.com/engine/containers/resource_constraints/).

Temporary-process/cache inventory and the rejected recursive cleanup are in
`cache-memory-status.json`. No synthetic profiling process remains, and global
dependencies, production sources, lock inodes and user caches were untouched.
