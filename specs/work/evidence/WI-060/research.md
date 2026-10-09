# Deployment research

Searched Reddit, Stack Overflow and official documentation before selecting the implementation. The existing host uses Caddy, so the canonical change targets its actual upstream rather than adding another proxy.

- [Caddy reload](https://caddyserver.com/docs/command-line#caddy-reload): update the running proxy configuration through its reload API; keep the server running.
- [NGINX deployment overview](https://docs.nginx.com/nginx-gateway-fabric/how-to/upgrade-apps-without-downtime/): keep a ready old deployment while starting the next and switch traffic before retiring the old one. This is the general rollout pattern, not the host's proxy implementation.
- [Next.js self-hosting](https://nextjs.org/docs/app/guides/self-hosting): version skew can make old browser tabs request assets from the prior build. The checked local Next.js guide confirms this; retain original assets from exactly two images.
- [Prisma hotfix/migration workflow](https://www.prisma.io/docs/orm/v7/prisma-migrate/workflows/patching-and-hotfixing): preserve applied migration history and use a new forward correction. Runtime rollback does not revert SQL.
- Forum discovery: [Stack Overflow](https://stackoverflow.com/questions/34106964/deploying-with-docker-into-production-zero-downtime), [Reddit Docker](https://www.reddit.com/r/docker/comments/14wr2st/). Implementation decisions rely on the primary documentation above and the actual host configuration.

Observed old failure mechanism: the promoter stopped both web and worker before database backup, setup-image build and migration restore/rehearsal. Normal swaps also stopped the old web before starting the replacement. The revised promoter eliminates both paths and rejects unreviewed pending migrations without stopping production.
