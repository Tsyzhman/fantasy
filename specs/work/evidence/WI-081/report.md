# WI-081 production cleanup evidence

The serving application remains **0.3.145 / 32fcc3d**. This maintenance operation installed the committed cleanup scripts, without an application rollout or production restart. The next source version is 0.3.146.

## Before and after

- Old database and table backups were spread across `/var/backups/fantasy-scout`, `/home/deploy/fantasy-backups` and one project-specific file in the shared deploy-backups directory. They are replaced by **one fresh complete PostgreSQL dump: 379,894,669 bytes**, mode 0600. Full archive reading/decompression passed before deletion. Retained SHA-256: `e5a58b0ebf34cddfab80953ce8ae97aca83f532dfb5ebdf3bf7baf1fd416bac9`.
- Host Docker build cache: **23 records / 227.6 MB → 0 records / 0 bytes**. Both application containers have only empty Next cache directories. Project images were already bounded to the serving image and the rollback image; both remain.
- Scheduled maintenance used an outdated copy with a three-release default, no database retention and a separate lock. It now uses the committed two-release cleanup, the full-backup helper, explicit complete unused build-cache removal and the production deployment lock. The existing Sunday 04:15 server schedule is preserved.
- Removed the obsolete July server checkout and historical mapping/table exports. Removed a 266,752,000-byte TAR only after SHA-256 comparisons proved that all 11,617 members match their preserved extracted source files. No research source files were deleted.
- The serving release and exactly one complete rollback generation remain, including their containers, image tags, static assets and relay volumes.

The filesystem measurement shows **2917605376 bytes (~2.92 GB) more available space**, after creating the fresh dump. Physical space and Docker accounting differ because image layers can be shared; the filesystem delta is the reported net result.

## Verification

- All 48 original containers retain the same IDs, state, restart counters and OOM counters. The serving web/worker/relay have zero restarts and no OOM. Caddy PID remains 754.
- All eight public health probes during cleanup returned 200 with the same exact release; five final probes also passed.
- One scheduler worker is running. Refresh queue, pool duplicates, orphan rows, duplicate prices and failed migrations are all zero. The 149 saved squads and 2,222 saved selections remain present. READY player-pool revision retention remains bounded to three per scope; this is application data, separate from build cache.
- Final measured memory: web 274.1 MiB / 2 GiB, worker 1.789 GiB / 4 GiB, PostgreSQL 1.342 GiB / 2 GiB, relay 34.23 MiB / 128 MiB; host available memory 5,489 MiB. These observations do not establish a long-term leak result.
- Both changed shell scripts pass Bash syntax validation; all 18 deployment Python tests pass. The cache guard passes all four mode/opt-in combinations on Linux. Source/version/workflow checks and the spec-space snapshot pass.
- The first CI attempt found the previous static assertion prohibiting all host build-cache cleanup. The owning test now checks the explicit operator option and exercises the four combinations; The full rerun [39947294152](https://github.com/Tsyzhman/fantasy/actions/runs/39947294152) passes on code commit `4b578df`, including unit/database tests, audit, migration drift, lint, types, build, restricted database permissions and rollout checks.

The new promoter writes `.partial`, verifies all archive blocks, then atomically publishes the completed dump. An exit trap removes an unfinished partial. The retention helper refuses invalid archives, files changing during verification and indirect paths; it preserves incomplete files and aborts backup deletion when no known full backup exists. Production promotion invokes retention after success. The installed scheduled scripts are recorded by source commit and SHA-256 in `maintenance-install.json`.

No new REVIEW or TECHDEBT entries.

## Research

The operator workflow follows [Docker build-cache pruning](https://docs.docker.com/reference/cli/docker/builder/prune/) and [PostgreSQL archive handling](https://www.postgresql.org/docs/16/app-pgrestore.html). Initial searches also covered Stack Overflow and Reddit; those searches did not override the primary documentation or project availability contract.
