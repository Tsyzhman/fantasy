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

- `scripts/deploy-production-docker.sh` builds an exact release while the active web and worker continue running.
- Web versions alternate between `127.0.0.1:3000` and `127.0.0.1:3001`. A candidate has schedulers disabled, uses the same database/session configuration and uploads, and passes health with the requested commit before promotion.
- `scripts/production-web-routing.py` changes only the `fantasy.tsyzhman.ru` upstream in `/etc/caddy/Caddyfile`. It checks the expected old port, validates the complete candidate configuration and reloads Caddy gracefully. It never restarts Caddy or edits another site's routing. A failed reload restores the original file.
- The old web remains running through the switch and a 30-second drain, then receives a graceful stop with a further 30-second timeout. Public health must confirm the exact candidate commit before finalizing the current-release symlink.
- Candidate and prior image static assets are combined from their original images, bounded to those two releases. Existing browser tabs can still fetch prior hashed JS/CSS after the old process stops. Authentication storage and secrets are retained; deployment does not revoke sessions.
- Exactly one scheduler worker runs at a time. Only after the candidate web is healthy, the old worker stops and the new worker starts. Relay identities and volumes follow the actual mounted socket volume; collector locks and active-ingestion checks remain mandatory.

<a name="migrations"></a>
<a name="data"></a>

## Data and compatible migrations {#data}

Pending migrations must carry a reviewed `deployment.json` with `mode: online` and the exact `sqlSha256` of `migration.sql`. This explicitly asserts compatibility with the currently serving and candidate binaries, including rollback to the old binary. An absent, mismatched or unsupported declaration aborts promotion without stopping the website.

Keep custom-format backup verification and restore/apply rehearsal, but perform them while production serves traffic. Apply only the reviewed compatible migration set, with bounded database lock/statement timeouts in its SQL; check the old serving version afterward. Breaking schema changes require an expand/contract sequence across separate releases. A normal deployment must never silently fall back to a stop-and-replace path. Applied migrations are not undone by runtime rollback.

<a name="contracts"></a>

## Contracts and entry points {#contracts}

`Deploy Production` packages the exact Git tree and invokes the promoter with archive path, SHA-256, release name, commit, tree and version. Internal `/api/health` checks include the requested commit; public health confirms the upstream actually changed. The routing helper accepts only the expected old and alternate port, rejecting unknown/ambiguous sites and concurrent configuration changes. Release manifests and `PRODUCTION_HISTORY.tsv` identify the resulting runtime.

<a name="recovery"></a>

## Rollout and recovery {#recovery}

Keep the prior web, worker and relay until the candidate has passed internal and public health. If promotion fails, restore the old Caddy upstream before deleting the candidate, restore canonical container names and restart only the old worker. The old web must remain available. Retain the current and one stopped rollback release; remove only unused project relay volumes and bounded candidate/extraction containers. Never prune another application's resources.

<a name="observability"></a>

## Verification and observability {#observability}

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
