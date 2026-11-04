# WI-088 — root-operated production verification

This implementation chat has not launched, imported, or altered production data.
Only root runs these operations after the canonical immutable release succeeds.
The full successful production refresh and a newly published snapshot remain open
acceptance requirements. Never remove a source record or resolve a contradictory
board by choosing one of its values arbitrarily.

## Preflight after rollout

1. Verify public/internal health, current release, worker image and reviewed SHA
   agree. Confirm one worker, no franchise job, no active collector processes and
   no `.sync.lock`/`.collection.lock`. Do not remove a marker without checking its
   PID and process lifetime. Keep `.heavy-job.lock` and the shared volume inode.
2. Read `MemAvailable`: require at least 4,608 MiB. The job hard cap is 3,584 MiB,
   `--memory-swap` equals that cap, and the host reserve is still 1,024 MiB. Check
   the active launcher's constants/command, not a stale release directory. Do not
   lower the guard if it fails. Wait for the current heavy calculation to finish.
3. Record the previous database snapshot (a read-only bounded query):

   ```sh
   docker exec -i fantasy-scout-postgres psql -X -U fantasy_app -d fantasy_scout -Atq -v ON_ERROR_STOP=1 <<'SQL'
   BEGIN READ ONLY;
   SET LOCAL statement_timeout='5s';
   SELECT season, version, generated_at, squads, octet_length(payload), sha256
   FROM franchise_analytics_snapshots;
   ROLLBACK;
   SQL
   ```

4. Check only the presence/values of `FRANCHISE_USE_CACHE`,
   `FRANCHISE_RESUME_AFTER` and `FRANCHISE_DATA_DIR` in the selected worker/job
   environment without printing other environment entries. A normal full sync
   has no cache or resume override. Do not reuse October intermediate pickles,
   `report-data.json`, `validation.json`, or a prepared import bundle.

## One monitored full run

Start `monitor-readonly.py` on the host through SSH stdin and retain stdout in
root's local WI-084/WI-088 evidence. Its first line says `ready`; it only reads
Docker/cgroup/host aggregates. It waits for the named job and exits after the job
disappears, an abort condition, or 5,550 seconds.

Start exactly one regular entry point, in a separate tracked session:

```sh
bash /var/www/fantasy-scout-current/ops/franchises-sync.sh
```

The existing host lock excludes another collector/deployer, and the job's kernel
lock serializes pool/model/collector calculations. Do not launch `sync.py`
directly in the long-lived worker. The regular path does fresh acquisition and
fresh database exports, features, aggregate, enrichment, hypotheses, export and
the existing atomic importer. Node retains its 768 MiB old-heap bound.

Capture the launcher's exit status and all `FRANCHISE_STAGE` records. Those records
contain per-stage Linux peak RSS and cgroup memory totals/events. The host monitor
captures whole-container memory, including the waiting Node parent and file
cache; Windows synthetic process RSS is not a substitute for this measurement.

## Executable publication boundary and aborts

`analyze.validated_board_states` validates each actual source board before
aggregation outputs. Contradictory roles, board numbers, score, opponent or
finished status within the same source board fail closed. Across distinct H2H
duels, the user's confirmed rule projects exactly one football-round XI with
active-any and frozen-any. Original duel histories, freeze events and results
remain intact. Ordinary franchise ranking admits non-personal active-any XI;
personal manager histories and virtual groups retain all unique observations.

A contradictory source fails the Python stage before publication. The existing
export guard also rejects missing active states, duplicate player selections,
future history and invalid source selections. Preserve the old snapshot on any
failure; diagnose its exact source identity without weakening these checks.

Also abort the trial for any worker/web/PostgreSQL OOM or restart, any job OOM,
or host `MemAvailable < 1 GiB` for two consecutive five-second samples. Root may
gracefully terminate **only** `fantasy-scout-franchises-job` with
`docker stop --time 20 fantasy-scout-franchises-job`. Keep serving web, scheduler
worker and database running. Check child/container exit before any stale-marker
recovery. Do not retry by raising the cap or disabling a guard.

## Success evidence

After the November 4 full acquisition failed at fixture identity, a separately
validated source-parser correction may retry through the same normal entry with
`FRANCHISE_RESUME_AFTER=2026-11-04T11:42:00Z`, only while that verified checkpoint
is within three hours. This is the existing INFRA-006 bounded acquisition resume:
reuse only responses/squads acquired since that checkpoint and settled valid
lineups, refresh database exports, and run every calculation/publication stage.
Never set FRANCHISE_USE_CACHE or import the October artifacts. Root removed the
five October reproducible intermediates after preserving diagnosis. After the
three-hour window expires, use a normal fresh acquisition without this override.

Require all stages and importer to exit zero; a newer database `generated_at`,
different SHA, valid complete payload, preserved histories/personal groups, and
matching acquisition/generated times through the production report reader/UI.
Verify the fresh `validation.json`: future history, duplicate selections and
missing active state are zero; present XIs have 11 players; missing lineups remain
explicit. Compare source-index identity counts and published observation counts;
do not require equal counts to October when new rounds legitimately add records.

Record exact Linux stage RSS, whole-cgroup peak and minimum host headroom, OOM
counters, worker/web/PostgreSQL restarts and sampled public availability. Confirm
the disposable job and private environment file are gone, one worker remains,
the timer is active with the unchanged three-hour `:10 MSK` cadence, no collector
markers remain, successful-run intermediate files were removed, HTTP cache has
no temporary files and no expired entries, and source/index identities are
unique. Preserve user sources, rollback containers and the kernel lock file.

Keep `memory.events.max` separate from `oom` and `oom_kill`: boundary-triggered
reclaim is memory pressure and must be recorded, not silently converted to zero
or described as spare capacity. The complete 0.3.152 run succeeded with 1,313
such events and zero OOM. Its publication and host-reserve checks passed, while
TD-010 retains export/growth-headroom follow-up. No runtime limit or abort guard
was changed. See `production-run-0152-summary.json` and
`publication-acceptance-review.md`.

Production host note (2026-11-04): this kernel exposes `memory.current` and `memory.events`, but no `memory.peak`. The compatible read-only monitor reports `peak_bytes: null`, a clearly labelled five-second `sampled_peak_bytes`, and preserves current-memory/OOM/host-headroom checks. Do not call the sampled maximum an exact kernel peak. The first monitor was replaced at 11:44 UTC during acquisition after this absence was diagnosed; application containers and the collection were not restarted. Per-stage Linux process peak RSS remains available through `resource.getrusage`.
