---
status: active
---

<a name="root"></a>

# INFRA-006: Continuous production deployment {#root}

<a name="plain-language"></a>

## In simple words {#plain-language}

Users keep using the current website while the next version is prepared. A deployment starts and checks a second web version before switching traffic. Stopping the serving website to build, back up, rehearse migrations or start its replacement is prohibited.

<a name="goal"></a>

## Goal {#goal}

A release keeps a healthy web target available at every step, preserves existing sessions and assets, and allows rollback before the previous runtime is retired.

<a name="governing-specs"></a>

## Control specifications {#governing-specs}

- `spec://common/main#root`: existing product workflows and shared authentication.
- `spec://common/structure#release-transport`: immutable source, transport, ancestry and bounded resources.

<a name="scope"></a>

## Scope and control {#scope}

The contract owns the immutable Docker production promoter and the Fantasy Scout Caddy upstream. It preserves `spec://common/main#root` and `spec://common/structure#release-transport`: exact committed source, ancestry, checksums, bounded resources and verified rollback. Other hosted applications, PostgreSQL, uploads and session data retain their ownership.

<a name="environments"></a>

## Environments and dependencies {#environments}

Production uses Docker's existing `fantasy-scout_default` network, the healthy PostgreSQL container, operator-owned runtime configuration and upload volumes. Caddy owns TLS and public routing on the host. GitHub Actions serializes production jobs; a host deployment lock excludes a second promoter, while existing collector locks protect worker handoff. Candidate ports are loopback only.

<a name="decisions"></a>

## Canonical decisions {#decisions}

Use two running web generations and a graceful upstream reload rather than rebuilding the serving container. Preserve canonical service names by renaming running containers; their port bindings do not change. Worker handoff remains exclusive because two scheduler workers would duplicate jobs. Do not rotate application credentials or clear the database/cache to deploy.

<a name="runtime"></a>

## Runtime and traffic {#runtime}

- CI builds runtime and migration images from the frozen lockfile on a digest-pinned Node 24 LTS base. The promoter loads the checksum-verified image archive and verifies both exact image IDs and release labels. Production never builds application images.
- Web and worker run as uid 1000 with all capabilities dropped and no-new-privileges. Web: 2 GiB, 2 CPUs, 128 PIDs and 1 GiB V8 old heap; worker: 4 GiB, 3 CPUs, 256 PIDs and 2 GiB V8 old heap. PostgreSQL has a separately measured 2 GiB/2 CPU/256 PID budget, applied online; relay has 128 MiB/0.5 CPU/64 PIDs. Validate full imports and simultaneous web versions against these budgets.
- Docker's classic store identifies a config digest while containerd may identify an OCI manifest. Verify both through the exact exported archive: unique CI tags, Linux/amd64 config hash, source label and the OCI manifest-to-config digest binding. The loaded daemon ID must be one of those verified identities. Preserve both CI and loaded IDs in the release manifest; never accept labels alone or rebuild on the server to work around a mismatch.
- Web versions alternate between `127.0.0.1:3000` and `127.0.0.1:3001`. A candidate has schedulers disabled, uses the same database/session configuration and uploads, and passes health with the requested commit before promotion.
- `scripts/production-web-routing.py` changes only the `fantasy.tsyzhman.ru` upstream in `/etc/caddy/Caddyfile`. It checks the expected old port, validates the complete candidate configuration and reloads Caddy gracefully. It never restarts Caddy or edits another site's routing. A failed reload restores the original file.
- The old web remains running through the switch and a 30-second drain, then receives a graceful stop with a further 30-second timeout. Public health must confirm the exact candidate commit before finalizing the current-release symlink.
- Candidate and prior image static assets are combined from their original images, bounded to those two releases. Existing browser tabs can still fetch prior hashed JS/CSS after the old process stops. Authentication storage and secrets are retained; deployment does not revoke sessions.
- A stable compiler ID salt is supplied through a BuildKit secret mount. In the same build layer, strip the salt from both Node action manifests, remove private build caches and scan all build output for residual salt before publishing any runtime/setup image. The active AES-256 encryption key is a separate mode-600 host file, injected into private runtime environments only; it never enters CI or a release artifact. Next 16.3.8 uses that runtime environment in preference to the cleared manifest. Current actions are unbound module-level functions: verify all existing IDs and old forms when rotating the runtime key. Closure-capturing or bound actions require an explicit compatibility review. `deploymentId` is the exact release commit. Unsaved Squad plans persist in tab sessionStorage, scoped by account/provider/league/season/squad, with a 24-hour TTL, 64 KiB per entry and eight-entry limit; saved baselines must match before restoration. Captains, locks, round links and transfer state survive refresh.
- Exactly one scheduler worker runs at a time. Only after the candidate web is healthy, the old worker stops and the new worker starts. Relay identities and volumes follow the actual mounted socket volume; collector locks and active-ingestion checks remain mandatory.
- Web-owned FPL and probable-lineup schedules retain their cadence. A release-specific read-only activation file defers their startup in the candidate until the old web has stopped after draining; its content must match the candidate commit. HTTP readiness does not wait for activation. The pending timer is unreferenced and ends after activation or cancellation, preventing duplicate web schedules during preparation and draining.

<a name="migrations"></a>
<a name="data"></a>

## Data and compatible migrations {#data}

`fantasy_app` retains only schema usage, table SELECT/INSERT/UPDATE/DELETE and sequence usage. It has no ownership, superuser, CREATEDB, CREATEROLE, replication, BYPASSRLS, TRUNCATE or migration-journal write privileges. `fantasy_migrator` owns application schema objects, applies migrations and creates the disposable rehearsal database; its protected host credential is never copied to web/worker. `fantasy_operator` is the protected administrative/recovery identity. Default privileges of the migration owner grant runtime access to future tables. Ownership/attribute changes are transactional with short lock timeouts, preceded by isolated positive/negative probes; existing application credentials and sessions remain valid.

Pending migrations must carry a reviewed `deployment.json` with `mode: online` and the exact `sqlSha256` of `migration.sql`. This explicitly asserts compatibility with the currently serving and candidate binaries, including rollback to the old binary. An absent, mismatched or unsupported declaration aborts promotion without stopping the website.

PostgreSQL 16's bootstrap OID 10 cannot lose SUPERUSER. If it has the legacy runtime name, a short separate administrative session atomically renames it to `fantasy_operator`, creates the limited `fantasy_app` with unchanged credentials, and transfers application ownership. Remove the temporary transition login on success or rollback. Existing connections retain their original role until the old generations drain; after promotion only the protected operator owns OID 10. Each concurrent index uses one migration statement; the migration role has five-second lock and 120-second statement timeouts. Only when every pending migration is a checksum-reviewed single `CREATE INDEX CONCURRENTLY` statement may the private connection environment extend lock waiting to 30 seconds; ordinary/mixed DDL retains five seconds. Failed invalid indexes require an exact definition check, concurrent removal and migration rollback resolution before retry.

Keep custom-format backup verification and restore/apply rehearsal, but perform them while production serves traffic. Apply only the reviewed compatible migration set, with bounded database lock/statement timeouts in its SQL; check the old serving version afterward. Breaking schema changes require an expand/contract sequence across separate releases. A normal deployment must never silently fall back to a stop-and-replace path. Applied migrations are not undone by runtime rollback.

<a name="contracts"></a>

## Contracts and entry points {#contracts}

`Deploy Production` packages the exact Git tree and invokes the promoter with source archive path/SHA-256, release/commit/tree/version, image archive path/SHA-256 and exact runtime/setup image IDs. Internal `/api/health` checks include the requested commit; public health confirms the upstream actually changed. After compatible migrations, a bounded authenticated canary checks Squad SSR, the materialized player-pool route and its progressive API fallback; its ephemeral session is deleted. The routing helper accepts only the expected old and alternate port, rejecting unknown/ambiguous sites and concurrent configuration changes. Release manifests and `PRODUCTION_HISTORY.tsv` identify the resulting runtime.

<a name="recovery"></a>

## Rollout and recovery {#recovery}

Keep the prior web, worker and relay until the candidate has passed internal and public health. If promotion fails, restore the old Caddy upstream before deleting the candidate, restore canonical container names and restart only the old worker. The old web must remain available. Retain the current and one stopped rollback release; remove only unused project relay volumes and bounded candidate/extraction containers. Never prune another application's resources.

<a name="observability"></a>

## Verification and observability {#observability}

Caddy assigns a request UUID and records it with upstream and release commit; application errors include the same ID, PID and commit. Every minute, bounded process diagnostics record CPU, RSS/heap/external memory and event-loop delay. SQL is represented by at most 128 hashed fingerprints and top 20 summaries in a five-minute window, without parameter values. PostgreSQL slow-query/temporary-file logging is bounded and redacts bind parameters; runtime diagnostics report actual interval deltas for temp files, never cumulative counters as a short-window result. The operational SLO is a rolling 24 hours with retained start/end coverage and unchanged <1% 5xx threshold. Fixed beta evidence remains a separate historical artifact and an explicit beta acceptance mode.

Release manifests, image labels, internal health and public health agree on version/commit. Each rollout records candidate readiness, traffic switch, drain and rollback decisions. Verify public responses repeatedly during a real promotion, including an old static asset after switching. Check failed migrations, duplicate workers/jobs/deliveries, memory, OOM/restarts, release count and temporary containers/volumes after completion.

<a name="traceability"></a>

## Implementation ownership {#traceability}

The promoter, routing helper, online migration validator, relay adapter and their direct behavioral tests carry this specification's `@spec` markers. `AGENTS.md` and `docs/operations/DEPLOYMENT.md` expose the mandatory rule to future changes.

<a name="acceptance"></a>

## Readiness {#acceptance}

Unready candidates and unsafe migrations preserve the serving version. Routing validation/reload failures restore the old configuration. Successful promotion has no interval with zero serving web processes, one scheduler worker, available prior static files, exact public revision and bounded retained resources.

<a name="relationships"></a>

## Related contracts {#relationships}

- `spec://modules/khl/INFRA-001-khl-data-ingestion#operations`: collector exclusion.
- `spec://modules/franchises/FEAT-005-franchise-analytics#data`: franchise collector lock and retained storage.
- `spec://modules/telegram/INFRA-005-deadline-pipeline#recovery`: operator notification configuration and deduplicated delivery.
- `spec://modules/machete/INFRA-004-sorareinside-starters#runtime`: private source credentials and refresh scopes.

<a name="changelog"></a>

## Change history {#changelog}

- 2026-10-09: WI-060 — prohibit direct production replacement and require a verified second web version with graceful traffic switch and compatible online migrations.
- 2026-10-10: WI-072 — least-privilege database identities, Node 24, CI image artifacts, resource budgets, domain canary, stable actions/drafts and bounded correlated diagnostics. F02 is explicitly excluded: existing pre-release backup/rehearsal remains; no new offsite schedule/PITR.
