FROM node:20-bookworm-slim

WORKDIR /app

ENV NEXT_TELEMETRY_DISABLED=1
# Playwright is an optional dependency used only by browser-mode FotMob ingestion.
# Skip the Chromium download here so prod images stay small and `npm ci` does not
# need network access for ~170 MB of browser binaries. To enable browser mode in
# a container, build a derived image that runs `npx playwright install --with-deps chromium`.
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates openssl \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npx prisma generate && npm run build

ENV NODE_ENV=production
EXPOSE 3000

CMD ["npm", "start"]
