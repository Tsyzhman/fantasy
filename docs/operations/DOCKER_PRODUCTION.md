# Docker production

Follow [the canonical deployment runbook](DEPLOYMENT.md) and `spec://common/INFRA-006-continuous-deployment#root`. CI builds exact frozen-lockfile Node 24 images; production loads verified artifacts while the serving web remains available. Caddy switches between two loopback generations without restarting. The scheduler worker stays exclusive; PostgreSQL persists through releases.

The setup target contains the Prisma CLI, generated client, migrations, and operator source. It is built independently of the web application. The runtime target contains the standalone web application and bundled worker commands.

Application containers use the existing Docker network/service alias for PostgreSQL. Web/worker run as uid 1000 with measured memory/CPU/PID limits, dropped capabilities and no-new-privileges. Migration/recovery credentials stay in protected host files. Volume ownership is prepared by a short networkless operator container; application containers need no root access.

Logs retain five files of 20 MiB. Project retention keeps current plus one rollback and removes only unused project containers/images/relay volumes. CI cleans its own builder; the host-wide Docker build cache belongs to all hosted applications and is untouched.

Determine the current version from public health, release manifests, OCI labels and `PRODUCTION_HISTORY.tsv`. Use [Monitoring](PRODUCTION_MONITORING.md) for resource, SQL, source-health and error checks, and [Production releases](PRODUCTION_RELEASES.md) for the journal. Existing sessions and both generations' static assets persist; check old forms and unsaved drafts across rollout/rollback.

Past beta images and superseded initialization/reset procedures are in [the historical archive](https://github.com/Tsyzhman/fantasy/blob/bd493e0f61f64843f169821e2de9272ee018d561/docs/operations/archive/DOCKER_PRODUCTION-before-WI-072.md). They are not current operating instructions.
