# Deployment

The only production promoter is [Deploy Production](../../.github/workflows/deploy-production.yml), governed by `spec://common/INFRA-006-continuous-deployment#root`. Package a clean committed ref present on origin that contains both current main and the serving production commit.

## Prepare and verify

Run `npm run check`, isolated database integration checks, `python3 scripts/continuous-deployment.test.py`, `node --test scripts/strip-server-action-key.test.mjs` and source/version verifiers. CI uses `.nvmrc` and `npm ci`; Docker uses digest-pinned Node 24 LTS. CI builds runtime/setup images with exact commit/version labels and a stable `NEXT_SERVER_ACTIONS_ID_SALT` supplied through BuildKit. The build removes that compiler salt from manifests/caches in the same layer and rejects residual salt. The separate active encryption key stays on the host and is injected only into runtime containers. CI retains the sanitized source/image archives and checksummed image manifest, then removes its temporary builder. The VPS only verifies and loads those images.

Run the workflow with `dry_run=true` first. Commit/tree/version, source checksum, exact runtime/setup image IDs and image checksum identify the reviewable release. Promote the same verified ref with `dry_run=false`. Releases are serialized; history rollback is rejected.

## Continuous rollout

The serving web remains running while the alternate loopback web is prepared. Only reviewed online migrations with matching SQL hashes are permitted. Existing custom-format backup, restore/apply rehearsal and old-version health checks run before promotion. A bounded authenticated canary checks Squad SSR, its materialized pool and progressive fallback after migrations; its temporary session is removed.

The promoter starts the candidate on port 3000 or 3001, verifies its exact commit, hands off the single scheduler worker, and switches only Fantasy Scout through a validated graceful Caddy reload. The prior web drains for 30 seconds and stops gracefully. Web-owned schedules activate after the drain. Prior/current hashed assets remain available. Stable actions and bounded tab-local unsaved Squad drafts preserve existing clients. A failed switch restores the old upstream before removing the candidate. Applied additive migrations remain compatible with the old binary.

Never stop the serving web to build/back up/rehearse, restart Caddy for rollout, replace live files or run `docker compose down`. PostgreSQL, uploads and session data retain their volumes. Retain current plus one rollback; cleanup touches only unused project artifacts. Shared Docker build cache is untouched.

## Credentials and budgets

`fantasy_app` is the web/worker CRUD identity. Protected mode-600 host files under `/home/deploy/.config/fantasy-scout/`: `database-migration.env` owns migrations/rehearsals, `database-operator.env` owns recovery, `server-actions.key` supplies the private active encryption key, and `server-actions-id-salt.key` preserves the compiler IDs. The active encryption key is absent from GitHub and all image layers. Migration/operator credentials are absent from runtime containers. Initial restriction uses reviewed `scripts/configure-production-database-roles.py` after isolated permission probes; `--verify-only` repeats read/rollback/negative checks.

Reviewed single concurrent index migrations receive a bounded 30-second lock wait through a derived private URL; ordinary/mixed DDL retains five seconds, and all statements retain 120 seconds. Recover an interrupted concurrent build only after verifying its exact invalid index definition: drop that index concurrently, resolve that migration as rolled back, and retry through the canonical promoter.

Web/worker run as uid 1000 with dropped capabilities/no-new-privileges. Budgets: web 2 GiB/2 CPUs/128 PIDs (1 GiB V8), worker 4 GiB/3 CPUs/256 PIDs (2 GiB V8), PostgreSQL 2 GiB/2 CPUs/256 PIDs and relay 128 MiB/0.5 CPU/64 PIDs. Apply PostgreSQL limits online after checking peak and full-import rehearsal. Check simultaneous web generations, external memory and OOM/restarts; idle memory does not establish capacity.

If the legacy runtime is PostgreSQL's bootstrap OID 10, the role adapter preserves that immutable superuser as the protected `fantasy_operator` and creates a limited runtime login with the same credentials. Existing old-generation connections retain their original role until draining; verify the new web/worker connections and absence of the temporary transition login after promotion. `configure-production-postgres.py` applies the database budget, redacted slow/temp-file logging and migration timeouts online, without a database restart.

## Verify the running release

```bash
curl -fsS https://fantasy.tsyzhman.ru/api/health
cat /var/www/fantasy-scout-current/.release-commit
docker inspect fantasy-scout-web --format '{{.Image}}'
docker stats --no-stream fantasy-scout-web fantasy-scout-worker fantasy-scout-postgres
```

Public/internal health, source manifest and OCI revision must agree. `PRODUCTION_HISTORY.tsv` and [Production releases](PRODUCTION_RELEASES.md) record verified releases; no historical beta is described as current. Check domain canary, old tabs/actions/drafts, provider health, duplicate jobs/deliveries and retention. Keep real coverage failures visible.

Franchise collection uses the existing three-hour timer, shared collector/deploy lock and worker `scripts/franchises.cjs`; KHL full statistics uses its daily timer/lock. Inspect service status/journals rather than starting duplicate collectors. Quality, price and snapshot schedulers share active scopes; manual commands retain domain checks.

Operator recovery pipes a new password to `scripts/recover-admin.cjs <existing-email>` in a one-off container with the protected operator env, never through public setup or a command-line password. It restores an existing administrator and records completion; setup stays closed.

Existing pre-release backups and restore rehearsals remain mandatory. Offsite backup/PITR expansion (F02) is excluded. [Monitoring](PRODUCTION_MONITORING.md) owns diagnostics. Superseded beta/PM2/reset procedures and incident snapshots are in [the archive](archive/DEPLOYMENT-before-WI-072.md).
