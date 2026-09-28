FROM node:20-bookworm-slim AS deps

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates openssl \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
COPY prisma ./prisma
COPY vendor ./vendor

# npm install (not npm ci) because the developer lockfile can omit
# platform-specific native dependency edges that Docker needs to reconcile.
# @spec spec://common/structure#release-transport
RUN npm install --no-audit --no-fund \
  --fetch-timeout=60000 --fetch-retries=3 \
  --fetch-retry-mintimeout=1000 --fetch-retry-maxtimeout=10000

FROM deps AS builder

WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

COPY . .
RUN ./node_modules/.bin/prisma generate && npm run build
RUN ./node_modules/.bin/esbuild scripts/khl-runner.ts --bundle --platform=node --external:@prisma/client --outfile=/app/khl-runner.cjs
RUN ./node_modules/.bin/esbuild scripts/sync-sorareinside.ts --bundle --platform=node --external:@prisma/client --outfile=/app/sync-sorareinside.cjs
RUN ./node_modules/.bin/esbuild scripts/import-franchise-data.ts --bundle --platform=node --external:@prisma/client --outfile=/app/franchises.cjs

FROM builder AS setup

WORKDIR /app

FROM builder AS prod-deps

WORKDIR /app
RUN npm prune --omit=dev

# HTTP/TLS client only: no browser binaries or browser automation runtime.
FROM node:20-bookworm-slim AS khl-http
RUN apt-get update && apt-get install -y --no-install-recommends python3-venv ca-certificates \
  && rm -rf /var/lib/apt/lists/*
COPY scripts/khl-http-requirements.txt /tmp/khl-http-requirements.txt
RUN python3 -m venv /opt/khl-http \
  && /opt/khl-http/bin/pip install --no-cache-dir --only-binary=:all: -r /tmp/khl-http-requirements.txt
COPY scripts/franchise-analytics/requirements.txt /tmp/franchise-requirements.txt
RUN python3 -m venv /opt/franchises \
  && /opt/franchises/bin/pip install --no-cache-dir --only-binary=:all: -r /tmp/franchise-requirements.txt

FROM node:20-bookworm-slim AS runtime

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

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates openssl python3 postgresql-client \
  && rm -rf /var/lib/apt/lists/*

COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/scripts/fpl-vpn-relay.mjs ./scripts/fpl-vpn-relay.mjs
COPY --from=builder /app/khl-runner.cjs ./scripts/khl-runner.cjs
COPY --from=khl-http /opt/khl-http /opt/khl-http
COPY --from=builder /app/scripts/khl-protocol-http.py ./scripts/khl-protocol-http.py
COPY --from=builder /app/sync-sorareinside.cjs ./scripts/sync-sorareinside.cjs
COPY --from=builder /app/franchises.cjs ./scripts/franchises.cjs
COPY --from=builder /app/scripts/franchise-analytics ./scripts/franchise-analytics
COPY --from=khl-http /opt/franchises /opt/franchises
COPY --from=prod-deps /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=prod-deps /app/node_modules/@prisma ./node_modules/@prisma

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=5 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3000/api/health').then((response) => process.exit(response.ok ? 0 : 1)).catch(() => process.exit(1))"]

CMD ["node", "server.js"]
