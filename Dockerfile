FROM node:20-bookworm-slim

WORKDIR /app

ENV NEXT_TELEMETRY_DISABLED=1
# Playwright is an optional dependency used only by browser-mode FotMob ingestion.
# Skip it entirely in the slim prod image (--omit=optional). The lazy import in
# createFotMobClient will surface a clear error if anyone enables browser mode in
# this image. To run browser mode in a container, derive an image, install with
# --include=optional, then run `npx playwright install --with-deps chromium`.
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates openssl \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci --omit=optional

COPY . .
RUN npx prisma generate && npm run build

ENV NODE_ENV=production
EXPOSE 3000

CMD ["npm", "start"]
