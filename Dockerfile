FROM node:24.21.0-bookworm-slim@sha256:d6aa754f16b3197301076f047b5def2f02ea1dbbc2ca920407d46d7ec7f87b20 AS deps

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates openssl \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
COPY prisma ./prisma
COPY vendor ./vendor

RUN npm ci --no-audit --no-fund \
  --fetch-timeout=60000 --fetch-retries=3 \
  --fetch-retry-mintimeout=1000 --fetch-retry-maxtimeout=10000

FROM deps AS builder

WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
ARG APP_RELEASE_COMMIT=unknown
ARG APP_RELEASE_VERSION=development
ENV APP_RELEASE_COMMIT="${APP_RELEASE_COMMIT}"
LABEL org.opencontainers.image.revision="${APP_RELEASE_COMMIT}" org.opencontainers.image.version="${APP_RELEASE_VERSION}"

COPY . .
# Strip compiler material within the build layer, before any image can retain it.
RUN --mount=type=secret,id=server_actions_id_salt,required=true \
  export NEXT_SERVER_ACTIONS_ENCRYPTION_KEY="$(cat /run/secrets/server_actions_id_salt)" \
  && ./node_modules/.bin/prisma generate && npm run build \
  && node scripts/strip-server-action-key.mjs
RUN ./node_modules/.bin/esbuild scripts/khl-runner.ts --bundle --platform=node --external:@prisma/client --outfile=/app/khl-runner.cjs
RUN ./node_modules/.bin/esbuild scripts/sync-sorareinside.ts --bundle --platform=node --external:@prisma/client --outfile=/app/sync-sorareinside.cjs
RUN ./node_modules/.bin/esbuild scripts/import-franchise-data.ts --bundle --platform=node --external:@prisma/client --outfile=/app/franchises.cjs
RUN ./node_modules/.bin/esbuild scripts/refresh-fantasy-player-pool-snapshots.ts --bundle --platform=node --external:@prisma/client --outfile=/app/player-pool-refresh.cjs
RUN ./node_modules/.bin/esbuild scripts/franchise-report-worker.ts --bundle --platform=node --external:@prisma/client --outfile=/app/franchise-report-worker.cjs
RUN ./node_modules/.bin/esbuild scripts/reconcile-fpl-score-mappings.ts --bundle --platform=node --external:@prisma/client --outfile=/app/reconcile-fpl-score-mappings.cjs \
  && ./node_modules/.bin/esbuild scripts/repair-khl-archive-identities.ts --bundle --platform=node --external:@prisma/client --outfile=/app/repair-khl-archive-identities.cjs \
  && ./node_modules/.bin/esbuild scripts/recover-admin.ts --bundle --platform=node --external:@prisma/client --outfile=/app/recover-admin.cjs

FROM builder AS setup

WORKDIR /app

FROM builder AS prod-deps

WORKDIR /app
RUN npm prune --omit=dev

# HTTP/TLS client only: no browser binaries or browser automation runtime.
FROM node:24.21.0-bookworm-slim@sha256:d6aa754f16b3197301076f047b5def2f02ea1dbbc2ca920407d46d7ec7f87b20 AS khl-http
RUN apt-get update && apt-get install -y --no-install-recommends python3-venv ca-certificates \
  && rm -rf /var/lib/apt/lists/*
COPY scripts/khl-http-requirements.txt /tmp/khl-http-requirements.txt
RUN python3 -m venv /opt/khl-http \
  && /opt/khl-http/bin/pip install --no-cache-dir --only-binary=:all: -r /tmp/khl-http-requirements.txt
COPY scripts/franchise-analytics/requirements.txt /tmp/franchise-requirements.txt
RUN python3 -m venv /opt/franchises \
  && /opt/franchises/bin/pip install --no-cache-dir --only-binary=:all: -r /tmp/franchise-requirements.txt

FROM node:24.21.0-bookworm-slim@sha256:d6aa754f16b3197301076f047b5def2f02ea1dbbc2ca920407d46d7ec7f87b20 AS runtime

WORKDIR /app

ARG APP_RELEASE_VERSION=development
ARG APP_RELEASE_COMMIT=unknown

LABEL org.opencontainers.image.version="${APP_RELEASE_VERSION}"
LABEL org.opencontainers.image.revision="${APP_RELEASE_COMMIT}"

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV HOSTNAME=0.0.0.0
ENV PORT=3000
ENV APP_RELEASE_VERSION="${APP_RELEASE_VERSION}"
ENV APP_RELEASE_COMMIT="${APP_RELEASE_COMMIT}"
ENV KHL_PROTOCOL_TRANSPORT=rest
ENV NODE_OPTIONS=--max-old-space-size=2048

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates openssl python3 postgresql-client \
  && rm -rf /var/lib/apt/lists/*

COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/scripts/fpl-vpn-relay.mjs ./scripts/fpl-vpn-relay.mjs
COPY --from=builder /app/scripts/production-canary.cjs ./scripts/production-canary.cjs
COPY --from=builder /app/khl-runner.cjs ./scripts/khl-runner.cjs
COPY --from=khl-http /opt/khl-http /opt/khl-http
COPY --from=builder /app/scripts/khl-protocol-http.py ./scripts/khl-protocol-http.py
COPY --from=builder /app/sync-sorareinside.cjs ./scripts/sync-sorareinside.cjs
COPY --from=builder /app/franchises.cjs ./scripts/franchises.cjs
COPY --from=builder /app/player-pool-refresh.cjs ./scripts/player-pool-refresh.cjs
COPY --from=builder /app/franchise-report-worker.cjs ./scripts/franchise-report-worker.cjs
COPY --from=builder /app/reconcile-fpl-score-mappings.cjs ./scripts/reconcile-fpl-score-mappings.cjs
COPY --from=builder /app/repair-khl-archive-identities.cjs ./scripts/repair-khl-archive-identities.cjs
COPY --from=builder /app/recover-admin.cjs ./scripts/recover-admin.cjs
COPY --from=builder /app/scripts/franchise-analytics ./scripts/franchise-analytics
COPY --from=khl-http /opt/franchises /opt/franchises
COPY --from=prod-deps /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=prod-deps /app/node_modules/@prisma ./node_modules/@prisma

RUN mkdir -p /app/storage/uploads /app/storage/franchises /app/.next/cache \
  && chown -R node:node /app/storage /app/.next/cache
USER node

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=5 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3000/api/health').then((response) => process.exit(response.ok ? 0 : 1)).catch(() => process.exit(1))"]

CMD ["node", "server.js"]
