FROM node:20-bookworm-slim

WORKDIR /app

ENV NEXT_TELEMETRY_DISABLED=1

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates openssl \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
# npm install (not npm ci) — package-lock.json is generated on a developer
# workstation, and npm omits transitive native deps for other platforms there.
# `npm ci` is strict about that and refuses to build; `npm install` reconciles
# the lock with the build-platform deps on the fly. The lock change stays
# inside the layer and is not committed back.
RUN npm install --no-audit --no-fund

COPY . .
RUN npx prisma generate && npm run build

ENV NODE_ENV=production
EXPOSE 3000

CMD ["npm", "start"]
