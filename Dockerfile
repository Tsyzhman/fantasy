FROM node:20-bookworm-slim AS deps

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates openssl \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
COPY prisma ./prisma

# npm install (not npm ci) because the developer lockfile can omit
# platform-specific native dependency edges that Docker needs to reconcile.
RUN npm install --no-audit --no-fund

FROM deps AS builder

WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

COPY . .
RUN npx prisma generate && npm run build

FROM builder AS setup

WORKDIR /app

FROM builder AS prod-deps

WORKDIR /app
RUN npm prune --omit=dev

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

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates openssl \
  && rm -rf /var/lib/apt/lists/*

COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/scripts/fpl-vpn-relay.mjs ./scripts/fpl-vpn-relay.mjs
COPY --from=prod-deps /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=prod-deps /app/node_modules/@prisma ./node_modules/@prisma

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=5 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3000/api/health').then((response) => process.exit(response.ok ? 0 : 1)).catch(() => process.exit(1))"]

CMD ["node", "server.js"]
