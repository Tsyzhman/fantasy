import { Prisma, type PrismaClient } from "@prisma/client";

export type FoontasySourceRow = {
  id: number;
  external_id: string;
  name: string;
  team_name: string;
  role: number;
  points: number;
  attacking_points?: number | null;
  price?: number | null;
  selected_by_percent?: number | null;
  desc?: string | null;
};

export type FoontasyImportInput = {
  leagueId: bigint;
  season: string;
  roundNumber: number;
  rows: FoontasySourceRow[];
};

export type FoontasySyncConfig = {
  email: string;
  password: string;
  url: string;
  leagueId: bigint;
  season: string;
};

export function foontasySyncConfigFromEnv(env: NodeJS.ProcessEnv = process.env): FoontasySyncConfig {
  return {
    email: requiredEnvironmentValue(env, "FOONTASY_EMAIL"),
    password: requiredEnvironmentValue(env, "FOONTASY_PASSWORD"),
    url: env.FOONTASY_URL || "https://foontasy.ru/assistant/rpl",
    leagueId: BigInt(env.FOONTASY_LEAGUE_ID || "63"),
    season: env.FOONTASY_SEASON || "2026/2027"
  };
}

export async function syncFoontasyForecasts(prisma: PrismaClient, config: FoontasySyncConfig) {
  const signinUrl = new URL("/signin", config.url).toString();
  const signin = await fetch(signinUrl, { redirect: "manual" });
  const form = await signin.text();
  const token = /name="_token" value="([^"]+)"/.exec(form)?.[1];
  const initialCookie = responseCookieHeader(signin);
  if (!token || !initialCookie) throw new Error("Foontasy sign-in form or session cookie is unavailable.");

  const login = await fetch(signinUrl, {
    method: "POST",
    redirect: "manual",
    headers: { cookie: initialCookie, "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      _token: token,
      email: config.email,
      password: config.password,
      intended_url: new URL(config.url).origin
    })
  });
  const sessionCookie = responseCookieHeader(signin, login);
  const page = await fetch(config.url, { headers: { cookie: sessionCookie } });
  if (!page.ok) throw new Error(`Foontasy forecast request failed: HTTP ${page.status}.`);
  if (new URL(page.url).pathname === "/signin") throw new Error("Foontasy authentication failed.");

  const html = await page.text();
  return importFoontasyForecasts(prisma, {
    leagueId: config.leagueId,
    season: config.season,
    roundNumber: parseFoontasyRound(html),
    rows: parseFoontasyForecastPage(html)
  });
}

export function parseFoontasyForecastPage(html: string) {
  const match = /let data = (\[.*?\]);\s*let/s.exec(html);
  if (!match) throw new Error("Foontasy page does not contain the forecast data array.");
  const raw: unknown = JSON.parse(match[1]);
  if (!Array.isArray(raw)) throw new Error("Foontasy forecast payload is not an array.");
  const rows = raw.filter(isFoontasySourceRow);
  if (rows.length < 100) throw new Error(`Foontasy returned only ${rows.length} valid forecast rows; existing data was preserved.`);
  return rows;
}

export function parseFoontasyRound(html: string) {
  const match = /(?:<h3[^>]*>\s*)?(\d+)\s*\u0442\u0443\u0440/i.exec(html);
  if (!match) throw new Error("Foontasy page does not identify the current round.");
  return Number(match[1]);
}

export async function importFoontasyForecasts(prisma: PrismaClient, input: FoontasyImportInput) {
  const sourceIds = input.rows.map((row) => row.external_id);
  const prices = await prisma.fantasyPlayerPrice.findMany({
    where: { provider: "SPORTS_RU", leagueId: input.leagueId, season: input.season, providerPlayerId: { in: sourceIds } },
    select: { id: true, providerPlayerId: true, playerId: true }
  });
  const maps = prices.length === 0 ? [] : await prisma.providerEntityMap.findMany({
    where: { provider: "SPORTS_RU", providerEntityType: "FANTASY_PLAYER_PRICE", providerEntityId: { in: prices.map((price) => price.id) }, internalEntityType: "PLAYER", internalEntityId: { not: null } },
    select: { providerEntityId: true, internalEntityId: true }
  });
  const mappedByPriceId = new Map(maps.map((item) => [item.providerEntityId, item.internalEntityId]));
  const playerIdBySourceId = new Map(prices.flatMap((price) => {
    const playerId = price.playerId ? String(price.playerId) : mappedByPriceId.get(price.id) ?? null;
    return price.providerPlayerId && playerId ? [[price.providerPlayerId, BigInt(playerId)] as const] : [];
  }));
  const mappedPlayerIds = [...new Set(playerIdBySourceId.values())];
  const modelForecasts = mappedPlayerIds.length === 0 ? [] : await prisma.fantasyModelForecast.findMany({
    where: { leagueId: input.leagueId, season: input.season, playerId: { in: mappedPlayerIds } },
    select: {
      playerId: true,
      horizon: true,
      points: true,
      status: true,
      modelVersion: true,
      inputSources: true,
      breakdown: true,
      calculatedAt: true
    },
    orderBy: { calculatedAt: "desc" }
  });
  const modelForecastsByPlayer = new Map<string, typeof modelForecasts>();
  for (const forecast of modelForecasts) {
    const key = String(forecast.playerId);
    const existing = modelForecastsByPlayer.get(key) ?? [];
    if (!existing.some((item) => item.horizon === forecast.horizon && item.modelVersion === forecast.modelVersion)) {
      existing.push(forecast);
      modelForecastsByPlayer.set(key, existing);
    }
  }
  const fetchedAt = new Date();
  await prisma.$transaction(input.rows.map((row) => prisma.foontasyForecast.upsert({
    where: { leagueId_season_roundNumber_sourcePlayerId: { leagueId: input.leagueId, season: input.season, roundNumber: input.roundNumber, sourcePlayerId: row.external_id } },
    create: forecastData(input, row, playerIdBySourceId.get(row.external_id) ?? null, fetchedAt),
    update: forecastData(input, row, playerIdBySourceId.get(row.external_id) ?? null, fetchedAt)
  })));
  const samples = await prisma.foontasyForecastSample.createMany({
    data: input.rows.map((row) => {
      const playerId = playerIdBySourceId.get(row.external_id) ?? null;
      const playerModelForecasts = playerId ? modelForecastsByPlayer.get(String(playerId)) ?? [] : [];
      const nearestForecast = playerModelForecasts.find((forecast) => forecast.horizon === 3) ?? playerModelForecasts[0] ?? null;
      return {
        leagueId: input.leagueId,
        season: input.season,
        roundNumber: input.roundNumber,
        sourcePlayerId: row.external_id,
        playerId,
        playerName: row.name,
        teamName: row.team_name,
        position: String(row.role),
        foontasyPoints: row.points,
        attackingPoints: finiteOrNull(row.attacking_points),
        price: finiteOrNull(row.price),
        selectedByPercent: finiteOrNull(row.selected_by_percent),
        breakdown: row.desc ?? null,
        modelNextPoints: firstFixturePoints(nearestForecast?.breakdown),
        modelVersion: nearestForecast?.modelVersion ?? null,
        featureSnapshot: playerModelForecasts.length === 0 ? Prisma.JsonNull : {
          capturedBeforeRound: input.roundNumber,
          forecasts: playerModelForecasts.map((forecast) => ({
            horizon: forecast.horizon,
            points: forecast.points,
            status: forecast.status,
            modelVersion: forecast.modelVersion,
            calculatedAt: forecast.calculatedAt.toISOString(),
            inputSources: forecast.inputSources,
            breakdown: forecast.breakdown
          }))
        } as Prisma.InputJsonValue,
        capturedAt: fetchedAt
      };
    }),
    skipDuplicates: true
  });
  return {
    rows: input.rows.length,
    mapped: input.rows.filter((row) => playerIdBySourceId.has(row.external_id)).length,
    roundNumber: input.roundNumber,
    samplesAdded: samples.count,
    samplesPreserved: input.rows.length - samples.count
  };
}

function forecastData(input: FoontasyImportInput, row: FoontasySourceRow, playerId: bigint | null, fetchedAt: Date) {
  return { leagueId: input.leagueId, season: input.season, roundNumber: input.roundNumber, sourcePlayerId: row.external_id, playerId, playerName: row.name, teamName: row.team_name, position: String(row.role), points: row.points, attackingPoints: finiteOrNull(row.attacking_points), price: finiteOrNull(row.price), selectedByPercent: finiteOrNull(row.selected_by_percent), breakdown: row.desc ?? null, fetchedAt };
}

function isFoontasySourceRow(value: unknown): value is FoontasySourceRow {
  if (!value || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  return typeof row.id === "number" && typeof row.external_id === "string" && typeof row.name === "string" && typeof row.team_name === "string" && typeof row.role === "number" && typeof row.points === "number" && Number.isFinite(row.points);
}

function finiteOrNull(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function firstFixturePoints(breakdown: unknown) {
  if (!Array.isArray(breakdown)) return null;
  const first = breakdown[0];
  if (!first || typeof first !== "object") return null;
  const points = (first as Record<string, unknown>).points;
  return typeof points === "number" && Number.isFinite(points) ? points : null;
}

export function responseCookieHeader(...responses: Response[]) {
  const cookies = new Map<string, string>();
  for (const response of responses) {
    for (const value of response.headers.getSetCookie?.() ?? []) {
      const pair = value.split(";", 1)[0];
      const separator = pair.indexOf("=");
      if (separator <= 0) continue;
      cookies.set(pair.slice(0, separator), pair.slice(separator + 1));
    }
  }
  return [...cookies].map(([name, value]) => `${name}=${value}`).join("; ");
}

function requiredEnvironmentValue(env: NodeJS.ProcessEnv, name: string) {
  const value = env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}
